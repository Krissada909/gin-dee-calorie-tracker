import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AIRequestError, authenticateRequest, listProviderModels, loadSavedAISettings, sendAIError, settingsFromRequest, settingsFromSavedSettings } from '../server/ai.js'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'รองรับเฉพาะ POST' })
  try {
    const context = await authenticateRequest(req)
    const raw = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const body = { ...raw, model: 'model-list' }
    const hasEnteredKey = typeof raw.apiKey === 'string' && raw.apiKey.trim().length > 0
    const saved = hasEnteredKey ? null : await loadSavedAISettings(context)
    if (saved && typeof raw.provider === 'string' && raw.provider !== saved.provider) {
      throw new AIRequestError(400, 'กรอก API key ของผู้ให้บริการนี้เพื่อโหลดรายการโมเดล')
    }
    const settings = hasEnteredKey ? settingsFromRequest(body) : saved ? settingsFromSavedSettings(saved, body) : null
    if (!settings) throw new AIRequestError(400, 'กรอก API key เพื่อโหลดรายการโมเดล')

    const models = await listProviderModels(settings)
    return res.status(200).json({ ok: true, models })
  } catch (error) {
    return sendAIError(res, error)
  }
}

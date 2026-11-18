import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, loadSavedAISettings, sendAIError, settingsFromRequest, settingsFromSavedSettings, testProviderConnection, AIRequestError } from '../server/ai'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'รองรับเฉพาะ POST' })
  try {
    const context = await authenticateRequest(req)
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const hasEnteredKey = typeof body.apiKey === 'string' && body.apiKey.trim().length > 0
    const savedSettings = hasEnteredKey ? null : await loadSavedAISettings(context)
    const settings = hasEnteredKey ? settingsFromRequest(body) : savedSettings ? settingsFromSavedSettings(savedSettings, body) : null
    if (!settings) throw new AIRequestError(400, 'กรุณากรอก API key หรือบันทึกการตั้งค่า AI ก่อนทดสอบ')

    await testProviderConnection(settings)
    return res.status(200).json({ ok: true, provider: settings.provider, model: settings.model, message: `เชื่อมต่อ ${settings.provider === 'gemini' ? 'Gemini' : 'OpenAI-compatible'} สำเร็จ` })
  } catch (error) {
    return sendAIError(res, error)
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AIRequestError, analyzeFood, authenticateRequest, loadSavedAISettings, sendAIError } from '../server/ai'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'รองรับเฉพาะ POST' })
  try {
    const context = await authenticateRequest(req)
    const settings = await loadSavedAISettings(context)
    if (!settings) throw new AIRequestError(400, 'ไปที่เมนูตั้งค่า AI แล้วบันทึก API key ก่อนวิเคราะห์รูป หรือกรอกข้อมูลเองได้เลย')

    const imageDataUrl = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).imageDataUrl : undefined
    const result = await analyzeFood(settings, imageDataUrl)
    return res.status(200).json(result)
  } catch (error) {
    return sendAIError(res, error)
  }
}

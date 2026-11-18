import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

type FoodEstimate = { name: string; calories: number; portion: string; note: string }
type ProviderResponse = {
  error?: { message?: string }
  choices?: Array<{ message?: { content?: unknown } }>
}

const systemPrompt = 'คุณเป็นผู้ช่วยบันทึกอาหารภาษาไทย ดูจากภาพอาหารและตอบ JSON เท่านั้น: {"name":"ชื่ออาหารภาษาไทย","calories":จำนวนเต็มแคลอรีโดยประมาณของปริมาณที่เห็นในภาพ,"portion":"คำอธิบายปริมาณ/ส่วนประกอบสั้นๆ","note":"ข้อจำกัด/ความไม่แน่ใจสั้นๆ"}. ประเมินอย่างระมัดระวัง ถ้าระบุอาหารไม่ได้ให้แจ้งใน note และตั้ง calories เป็น 0 ห้ามอ้างความแม่นยำทางการแพทย์ แคลอรีเป็นเพียงค่าประมาณจากภาพ'

function parseEstimate(text: string): Partial<FoodEstimate> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(trimmed) as Partial<FoodEstimate> } catch { /* try the first JSON object in the response */ }
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  try { return JSON.parse(trimmed.slice(first, last + 1)) as Partial<FoodEstimate> } catch { return null }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'รองรับเฉพาะ POST' })
  const provider = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase()
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า AI API key ฝั่ง server จึงกรอกชื่อและแคลอรีเองได้' })
  if (!['gemini', 'openai-compatible'].includes(provider)) {
    return res.status(400).json({ error: 'AI_PROVIDER ต้องเป็น gemini หรือ openai-compatible' })
  }

  const imageDataUrl = req.body?.imageDataUrl
  const imageMatch = typeof imageDataUrl === 'string'
    ? imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
    : null
  if (!imageMatch) return res.status(400).json({ error: 'กรุณาแนบรูปอาหารเป็น JPEG, PNG หรือ WebP' })

  const model = process.env.AI_MODEL || (provider === 'gemini' ? 'gemini-3.8-flash' : process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini')
  const baseUrl = provider === 'gemini'
    ? 'https://generativelanguage.googleapis.com/v1beta/openai'
    : (process.env.AI_BASE_URL || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'ช่วยระบุอาหารและประเมินแคลอรีโดยประมาณจากภาพนี้ ตอบ JSON ภาษาไทยเท่านั้น' },
              { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    })

    const payload = await response.json().catch(() => null) as ProviderResponse | null
    if (!response.ok) {
      console.error('Food analysis provider error', provider, response.status, payload?.error?.message)
      return res.status(502).json({ error: 'วิเคราะห์รูปไม่สำเร็จ ลองอีกครั้งหรือกรอกข้อมูลเองได้เลย' })
    }
    const content = payload?.choices?.[0]?.message?.content
    const parsed = typeof content === 'string' ? parseEstimate(content) : null
    if (!parsed || typeof parsed.name !== 'string' || !Number.isFinite(Number(parsed.calories))) {
      return res.status(502).json({ error: 'ผลวิเคราะห์ไม่สมบูรณ์ กรุณากรอกข้อมูลเอง' })
    }
    return res.status(200).json({
      name: parsed.name.slice(0, 160),
      calories: Math.max(0, Math.min(10000, Math.round(Number(parsed.calories)))),
      portion: String(parsed.portion || '').slice(0, 200),
      note: String(parsed.note || 'ค่าประเมินจากภาพ อาจคลาดเคลื่อน').slice(0, 200),
    })
  } catch (error) {
    console.error('Food analysis failed', provider, error)
    return res.status(502).json({ error: 'เชื่อมต่อระบบวิเคราะห์ภาพไม่ได้ ลองอีกครั้งภายหลัง' })
  }
}

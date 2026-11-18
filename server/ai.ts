import { isIP } from 'node:net'
import { lookup as dnsLookup } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export type AIProvider = 'gemini' | 'openai-compatible'
export type AISettings = {
  provider: AIProvider
  apiKey: string
  model: string
  baseUrl: string
}

type SettingsRow = {
  provider: string
  api_key: string
  model: string
  base_url: string | null
}

type AuthContext = { client: SupabaseClient; user: { id: string } }
type ChatMessage = { role: 'system' | 'user'; content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> }
type ChatResponse = { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } }

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const FOOD_SYSTEM_PROMPT = 'คุณเป็นผู้ช่วยบันทึกอาหารภาษาไทย ดูจากภาพอาหารและตอบ JSON เท่านั้น: {"name":"ชื่ออาหารภาษาไทย","calories":จำนวนเต็มแคลอรีโดยประมาณของปริมาณที่เห็นในภาพ,"portion":"คำอธิบายปริมาณ/ส่วนประกอบสั้นๆ","note":"ข้อจำกัด/ความไม่แน่ใจสั้นๆ"}. ประเมินอย่างระมัดระวัง ถ้าระบุอาหารไม่ได้ให้แจ้งใน note และตั้ง calories เป็น 0 ห้ามอ้างความแม่นยำทางการแพทย์ แคลอรีเป็นเพียงค่าประมาณจากภาพ'

export class AIRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'AIRequestError'
  }
}

function getBearerToken(req: VercelRequest) {
  const header = req.headers.authorization
  const value = Array.isArray(header) ? header[0] : header
  const match = typeof value === 'string' ? value.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/i) : null
  return match?.[1] || null
}

export async function authenticateRequest(req: VercelRequest): Promise<AuthContext> {
  const token = getBearerToken(req)
  if (!token) throw new AIRequestError(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน AI')

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new AIRequestError(503, 'ระบบฐานข้อมูลยังไม่ได้ตั้งค่า')

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  let authResponse: Response
  try {
    authResponse = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new AIRequestError(503, 'ตรวจสอบเซสชันกับ Supabase ไม่สำเร็จ')
  }
  if (!authResponse.ok) throw new AIRequestError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
  const userPayload = await authResponse.json().catch(() => null) as { id?: unknown } | null
  if (!userPayload || typeof userPayload.id !== 'string') throw new AIRequestError(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง')
  return { client, user: { id: userPayload.id } }
}

function isPrivateHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true
  const ipType = isIP(host)
  if (ipType === 4) {
    const [a, b] = host.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (ipType === 6) {
    return host === '::' || host === '::1' || /^::ffff:(?:0:)?(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(host) || /^(?:fc|fd|fe80):/i.test(host)
  }
  return false
}

function normalizeBaseUrl(provider: AIProvider, value?: string | null) {
  const raw = provider === 'gemini' ? GEMINI_BASE_URL : (value?.trim() || DEFAULT_OPENAI_BASE_URL)
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw new AIRequestError(400, 'Base URL ไม่ถูกต้อง') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || isPrivateHost(parsed.hostname)) {
    throw new AIRequestError(400, 'Base URL ต้องเป็น HTTPS สาธารณะ และห้ามเป็น private/localhost URL')
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/+$/, '')
}

function normalizeSettings(providerValue: unknown, apiKeyValue: unknown, modelValue: unknown, baseUrlValue?: unknown): AISettings {
  const provider = typeof providerValue === 'string' ? providerValue.trim().toLowerCase() : ''
  if (provider !== 'gemini' && provider !== 'openai-compatible') throw new AIRequestError(400, 'เลือกผู้ให้บริการ AI ที่รองรับก่อน')
  const apiKey = typeof apiKeyValue === 'string' ? apiKeyValue.trim() : ''
  if (apiKey.length < 8 || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new AIRequestError(400, 'กรุณากรอก API key ที่ถูกต้อง')
  const model = typeof modelValue === 'string' ? modelValue.trim() : ''
  if (!model || model.length > 200 || /[\s\u0000-\u001f]/.test(model)) throw new AIRequestError(400, 'กรุณากรอกชื่อ model ให้ถูกต้อง')
  const baseUrl = normalizeBaseUrl(provider, typeof baseUrlValue === 'string' ? baseUrlValue : '')
  return { provider, apiKey, model, baseUrl }
}

export async function loadSavedAISettings(context: AuthContext): Promise<AISettings | null> {
  const { data, error } = await context.client
    .from('user_ai_settings')
    .select('provider,api_key,base_url,model')
    .eq('user_id', context.user.id)
    .maybeSingle()

  if (error) {
    console.error('AI settings lookup failed', error.code || 'database_error')
    if (error.code === '42P01' || error.code === 'PGRST205') throw new AIRequestError(503, 'ยังไม่ได้เตรียมตาราง AI settings ใน Supabase')
    throw new AIRequestError(503, 'อ่านการตั้งค่า AI ไม่สำเร็จ')
  }
  if (!data) return null
  const row = data as SettingsRow
  return normalizeSettings(row.provider, row.api_key, row.model, row.base_url)
}

export function settingsFromRequest(body: unknown): AISettings {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return normalizeSettings(input.provider, input.apiKey, input.model, input.baseUrl)
}

export function settingsFromSavedSettings(saved: AISettings, body: unknown): AISettings {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return normalizeSettings(input.provider ?? saved.provider, saved.apiKey, input.model ?? saved.model, input.baseUrl ?? saved.baseUrl)
}

function completionUrl(baseUrl: string) {
  return /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`
}

function providerMessage(payload: ChatResponse | null, apiKey: string) {
  const raw = typeof payload?.error?.message === 'string' ? payload.error.message : ''
  if (!raw) return ''
  return raw.split(apiKey).join('[ซ่อน API key]').replace(/[\u0000-\u001f]/g, ' ').slice(0, 220)
}

function requestPublicJson(urlValue: string, apiKey: string, requestBody?: string, maxBytes = 512_000) {
  const url = new URL(urlValue)
  return new Promise<{ status: number; payload: unknown }>((resolve, reject) => {
    const request = httpsRequest({
      protocol: 'https:',
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: requestBody === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        Host: url.host,
        ...(requestBody === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(requestBody)) }),
      },
      lookup(hostname, options, callback) {
        dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
          if (error) {
            if (options.all) callback(error, [])
            else callback(error, '', 0)
            return
          }
          if (!addresses.length || addresses.some((address) => isPrivateHost(address.address))) {
            const blocked = new AIRequestError(400, 'Base URL ต้องชี้ไปยัง IP สาธารณะ') as NodeJS.ErrnoException
            if (options.all) callback(blocked, [])
            else callback(blocked, '', 0)
            return
          }
          if (options.all) callback(null, addresses)
          else callback(null, addresses[0].address, addresses[0].family)
        })
      },
    }, (response) => {
      const chunks: Buffer[] = []
      let length = 0
      response.on('data', (chunk: Buffer) => {
        length += chunk.length
        if (length > maxBytes) {
          request.destroy(new Error('provider response too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        let payload: unknown = null
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { /* provider may return non-JSON errors */ }
        resolve({ status: response.statusCode || 502, payload })
      })
    })
    request.on('error', reject)
    request.setTimeout(20_000, () => request.destroy(new Error('provider request timed out')))
    if (requestBody === undefined) request.end()
    else request.end(requestBody)
  })
}

function providerStatusError(status: number, payload: ChatResponse | null, apiKey: string) {
  const detail = providerMessage(payload, apiKey)
  if (status === 401 || status === 403) return new AIRequestError(502, 'API key ไม่ถูกต้องหรือยังไม่มีสิทธิ์ใช้ model นี้')
  if (status === 404) return new AIRequestError(502, 'ไม่พบ model หรือ endpoint กรุณาตรวจ Base URL และชื่อ model')
  return new AIRequestError(502, detail ? `ผู้ให้บริการปฏิเสธคำขอ: ${detail}` : `ผู้ให้บริการตอบกลับด้วยสถานะ ${status}`)
}

async function callChat(settings: AISettings, messages: ChatMessage[], maxTokens: number) {
  const requestBody = JSON.stringify({ model: settings.model, temperature: 0.2, max_tokens: maxTokens, messages })
  try {
    const { status, payload } = await requestPublicJson(completionUrl(settings.baseUrl), settings.apiKey, requestBody)
    if (status < 200 || status >= 300) throw providerStatusError(status, payload as ChatResponse | null, settings.apiKey)
    return payload as ChatResponse | null
  } catch (error) {
    if (error instanceof AIRequestError) throw error
    if (error instanceof Error && error.message.includes('timed out')) throw new AIRequestError(504, 'ผู้ให้บริการใช้เวลานานเกินไป ลองอีกครั้ง')
    throw new AIRequestError(502, 'เชื่อมต่อผู้ให้บริการไม่ได้ กรุณาตรวจ Base URL และลองอีกครั้ง')
  }
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text) : '').join('\n')
  return ''
}

const NON_CHAT_MODEL = /embed|whisper|tts|dall-e|moderation|davinci|babbage|audio|realtime|transcribe|imagen|image-gen|-image|sora|aqa|robotics|computer-use|live/i

export async function listProviderModels(settings: AISettings): Promise<string[]> {
  const base = settings.baseUrl.replace(/\/chat\/completions$/i, '')
  try {
    const { status, payload } = await requestPublicJson(`${base}/models`, settings.apiKey, undefined, 2_000_000)
    if (status < 200 || status >= 300) throw providerStatusError(status, payload as ChatResponse | null, settings.apiKey)
    const data = payload && typeof payload === 'object' ? (payload as { data?: unknown }).data : undefined
    if (!Array.isArray(data)) throw new AIRequestError(502, 'ผู้ให้บริการนี้ไม่ส่งรายการโมเดลกลับมา กรอกชื่อ model เองได้')
    const ids = new Set<string>()
    for (const item of data) {
      const raw = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined
      if (typeof raw !== 'string') continue
      const id = raw.replace(/^models\//, '').trim()
      if (!id || id.length > 200 || /[\s\u0000-\u001f]/.test(id) || NON_CHAT_MODEL.test(id)) continue
      if (settings.provider === 'gemini' && !/^gemini/i.test(id)) continue
      ids.add(id)
    }
    return [...ids].sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).slice(0, 300)
  } catch (error) {
    if (error instanceof AIRequestError) throw error
    if (error instanceof Error && error.message.includes('timed out')) throw new AIRequestError(504, 'ผู้ให้บริการใช้เวลานานเกินไป ลองอีกครั้ง')
    throw new AIRequestError(502, 'เชื่อมต่อผู้ให้บริการไม่ได้ กรุณาตรวจ Base URL และลองอีกครั้ง')
  }
}

export async function testProviderConnection(settings: AISettings) {
  const payload = await callChat(settings, [{ role: 'user', content: 'ตอบกลับสั้น ๆ ว่า OK เพื่อยืนยันการเชื่อมต่อ' }], 16)
  if (!messageText(payload?.choices?.[0]?.message?.content).trim()) throw new AIRequestError(502, 'เชื่อมต่อได้แต่ไม่ได้รับคำตอบจาก model')
}

function parseEstimate(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(trimmed) as Record<string, unknown> } catch { /* try the first JSON object in the response */ }
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  try { return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown> } catch { return null }
}

export async function analyzeFood(settings: AISettings, imageDataUrl: unknown) {
  const image = typeof imageDataUrl === 'string' ? imageDataUrl : null
  const match = image?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match || !image) throw new AIRequestError(400, 'กรุณาแนบรูปอาหารเป็น JPEG, PNG หรือ WebP')
  if (image.length > 4_000_000) throw new AIRequestError(413, 'รูปมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง')

  const payload = await callChat(settings, [
    { role: 'system', content: FOOD_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'ช่วยระบุอาหารและประเมินแคลอรีโดยประมาณจากภาพนี้ ตอบ JSON ภาษาไทยเท่านั้น' },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ], 300)
  const parsed = parseEstimate(messageText(payload?.choices?.[0]?.message?.content))
  if (!parsed || typeof parsed.name !== 'string' || !Number.isFinite(Number(parsed.calories))) {
    throw new AIRequestError(502, 'ผลวิเคราะห์ไม่สมบูรณ์ กรุณากรอกข้อมูลเอง')
  }
  return {
    name: parsed.name.slice(0, 160),
    calories: Math.max(0, Math.min(10000, Math.round(Number(parsed.calories)))),
    portion: String(parsed.portion || '').slice(0, 200),
    note: String(parsed.note || 'ค่าประเมินจากภาพ อาจคลาดเคลื่อน').slice(0, 200),
  }
}

export function sendAIError(res: VercelResponse, error: unknown) {
  if (error instanceof AIRequestError) return res.status(error.status).json({ error: error.message })
  console.error('AI endpoint failed', 'unexpected_error')
  return res.status(500).json({ error: 'ระบบ AI ขัดข้องชั่วคราว ลองอีกครั้งภายหลัง' })
}

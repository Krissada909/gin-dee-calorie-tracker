import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, CircleHelp, KeyRound, LoaderCircle, RefreshCw, Save, ShieldCheck, Trash2, Wifi } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Provider = 'gemini' | 'openai-compatible'
type TestStatus = { kind: 'idle' | 'success' | 'error'; message: string }
type SettingsRow = { provider: Provider; base_url: string | null; model: string; updated_at: string }

const CUSTOM_MODEL = '__custom__'

function pickDefaultModel(models: string[], provider: Provider) {
  if (provider === 'gemini') {
    return models.find((id) => /flash/i.test(id) && !/lite|preview|exp/i.test(id)) || models.find((id) => /flash/i.test(id)) || models[0] || ''
  }
  return models.find((id) => /mini/i.test(id)) || models[0] || ''
}

export default function AISettingsPage({ session, onBack }: { session: Session; onBack: () => void }) {
  const [provider, setProvider] = useState<Provider>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [savedProvider, setSavedProvider] = useState<Provider | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [customModel, setCustomModel] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [status, setStatus] = useState<TestStatus>({ kind: 'idle', message: '' })
  const [formMessage, setFormMessage] = useState('')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setFormMessage('ยังไม่ได้เชื่อมต่อ Supabase')
      return
    }
    let active = true
    setLoading(true)
    void supabase
      .from('user_ai_settings')
      .select('provider,base_url,model,updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setFormMessage(error.message.includes('user_ai_settings') ? 'ยังไม่ได้เตรียมตาราง AI settings ใน Supabase' : 'อ่านการตั้งค่าไม่สำเร็จ ลองโหลดหน้านี้ใหม่')
        } else if (data) {
          const row = data as SettingsRow
          const rowProvider: Provider = row.provider === 'openai-compatible' ? 'openai-compatible' : 'gemini'
          setProvider(rowProvider)
          setSavedProvider(rowProvider)
          setModel(row.model || '')
          setBaseUrl(row.base_url || 'https://api.openai.com/v1')
          setHasSavedKey(true)
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [session.user.id])

  const canLoadModels = Boolean(apiKey.trim()) || (hasSavedKey && savedProvider === provider)

  const loadModels = useCallback(async () => {
    const key = apiKey.trim()
    if (!key && !(hasSavedKey && savedProvider === provider)) {
      setModels([])
      setModelsError('')
      return
    }
    setModelsLoading(true)
    setModelsError('')
    try {
      const response = await fetch('/api/list-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          provider,
          ...(provider === 'openai-compatible' ? { baseUrl: baseUrl.trim() } : {}),
          ...(key ? { apiKey: key } : {}),
        }),
      })
      const result = await response.json().catch(() => ({})) as { models?: unknown; error?: string }
      if (!response.ok || !Array.isArray(result.models)) throw new Error(result.error || 'โหลดรายการโมเดลไม่สำเร็จ')
      const list = result.models.filter((item): item is string => typeof item === 'string')
      setModels(list)
      if (!hasSavedKey) setModel((current) => (list.includes(current) ? current : pickDefaultModel(list, provider)))
    } catch (error) {
      setModels([])
      setModelsError(error instanceof Error ? error.message : 'โหลดรายการโมเดลไม่สำเร็จ')
    } finally { setModelsLoading(false) }
  }, [apiKey, baseUrl, hasSavedKey, provider, savedProvider, session.access_token])

  useEffect(() => {
    if (loading) return
    const timer = window.setTimeout(() => void loadModels(), 800)
    return () => window.clearTimeout(timer)
  }, [loading, loadModels])

  async function testConnection() {
    if (!apiKey.trim() && !hasSavedKey) {
      setStatus({ kind: 'error', message: 'กรอก API key ก่อน หรือบันทึกการตั้งค่าก่อนทดสอบ' })
      return
    }
    setTesting(true)
    setStatus({ kind: 'idle', message: '' })
    try {
      const body = {
        provider,
        model: model.trim(),
        ...(provider === 'openai-compatible' ? { baseUrl: baseUrl.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }
      const response = await fetch('/api/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; model?: string; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error || 'ทดสอบการเชื่อมต่อไม่สำเร็จ')
      setStatus({ kind: 'success', message: `${result.message || 'เชื่อมต่อสำเร็จ'} · ${result.model || model}` })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'เชื่อมต่อไม่สำเร็จ ลองตรวจ API key, model และ Base URL' })
    } finally { setTesting(false) }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return setFormMessage('ยังไม่ได้เชื่อมต่อ Supabase')
    if (!apiKey.trim() && !hasSavedKey) return setFormMessage('กรอก API key เพื่อบันทึกการตั้งค่า')
    setSaving(true)
    setFormMessage('')
    setStatus({ kind: 'idle', message: '' })
    const values = {
      provider,
      base_url: provider === 'openai-compatible' ? baseUrl.trim() : null,
      model: model.trim(),
      updated_at: new Date().toISOString(),
    }
    const replacingKey = Boolean(apiKey.trim())
    const { error } = replacingKey
      ? await supabase.from('user_ai_settings').upsert({ user_id: session.user.id, ...values, api_key: apiKey.trim() }, { onConflict: 'user_id' })
      : await supabase.from('user_ai_settings').update(values).eq('user_id', session.user.id)
    setSaving(false)
    if (error) {
      setFormMessage(error.message.includes('user_ai_settings') ? 'บันทึกไม่ได้: ยังไม่ได้ติดตั้งตาราง AI settings ใน Supabase' : 'บันทึกไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง')
      return
    }
    setApiKey('')
    setHasSavedKey(true)
    setSavedProvider(provider)
    setFormMessage(replacingKey ? 'บันทึกการตั้งค่าแล้ว API key จะไม่แสดงกลับมา' : 'อัปเดตการตั้งค่าแล้วโดยใช้ API key ที่บันทึกไว้')
  }

  async function clearSettings() {
    if (!supabase || !window.confirm('ลบการตั้งค่า AI และ API key ของบัญชีนี้ใช่ไหม?')) return
    setClearing(true)
    setFormMessage('')
    const { error } = await supabase.from('user_ai_settings').delete().eq('user_id', session.user.id)
    setClearing(false)
    if (error) {
      setFormMessage('ลบการตั้งค่าไม่สำเร็จ ลองอีกครั้ง')
      return
    }
    setProvider('gemini')
    setModel('')
    setModels([])
    setCustomModel(false)
    setSavedProvider(null)
    setBaseUrl('https://api.openai.com/v1')
    setApiKey('')
    setHasSavedKey(false)
    setStatus({ kind: 'idle', message: '' })
    setFormMessage('ลบ API key และการตั้งค่าของบัญชีนี้แล้ว')
  }

  return <main className="dashboard settings-page">
    <section className="settings-title-row">
      <div>
        <button className="back-link" type="button" onClick={onBack}><ArrowLeft size={15} /> กลับภาพรวม</button>
        <p className="eyebrow">PERSONAL AI CONNECTION</p>
        <h1>ตั้งค่า AI</h1>
        <p className="date-label">ตั้งค่าเฉพาะบัญชี {session.user.email || ''} เพื่อประเมินอาหารจากรูป</p>
      </div>
      <span className="settings-title-icon"><KeyRound size={22} /></span>
    </section>

    {loading ? <div className="settings-loading"><LoaderCircle className="spin" size={20} /> กำลังอ่านการตั้งค่า…</div> : <div className="settings-grid">
      <form className="settings-card" onSubmit={(event) => void saveSettings(event)}>
        <div className="settings-card-heading"><span className="settings-card-icon"><Wifi size={17} /></span><div><h2>ผู้ให้บริการ AI</h2><p>เลือกโมเดลที่ใช้ช่วยดูรูปอาหาร</p></div></div>
        <div className="provider-options" role="group" aria-label="เลือกผู้ให้บริการ AI">
          <button type="button" className={`provider-option ${provider === 'gemini' ? 'selected' : ''}`} onClick={() => { setProvider('gemini'); setModel(model.startsWith('gemini') ? model : ''); setModels([]); setCustomModel(false); setStatus({ kind: 'idle', message: '' }) }}><strong>Gemini</strong><small>Google AI Studio</small></button>
          <button type="button" className={`provider-option ${provider === 'openai-compatible' ? 'selected' : ''}`} onClick={() => { setProvider('openai-compatible'); setModel(model.startsWith('gemini') ? '' : model); setModels([]); setCustomModel(false); setStatus({ kind: 'idle', message: '' }) }}><strong>OpenAI-compatible</strong><small>OpenAI หรือ endpoint อื่น</small></button>
        </div>

        <div className="settings-fields">
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="ai-model">โมเดล AI</label>
              <button type="button" className="link-button" onClick={() => void loadModels()} disabled={modelsLoading || !canLoadModels}>{modelsLoading ? <LoaderCircle className="spin" size={12} /> : <RefreshCw size={12} />}โหลดรายการใหม่</button>
            </div>
            {models.length > 0 && !customModel ? <select id="ai-model" value={model} required onChange={(event) => { if (event.target.value === CUSTOM_MODEL) { setCustomModel(true) } else { setModel(event.target.value) } setStatus({ kind: 'idle', message: '' }) }}>
              {!model && <option value="" disabled>เลือกโมเดล…</option>}
              {model && !models.includes(model) && <option value={model}>{model} (ไม่อยู่ในรายการ)</option>}
              {models.map((id) => <option key={id} value={id}>{id}</option>)}
              <option value={CUSTOM_MODEL}>กรอกชื่อโมเดลเอง…</option>
            </select> : <input id="ai-model" autoComplete="off" required maxLength={200} placeholder={provider === 'gemini' ? 'ใส่ API key เพื่อโหลดรายการโมเดล หรือพิมพ์ชื่อเอง' : 'เช่น gpt-4o-mini'} value={model} onChange={(event) => { setModel(event.target.value); setStatus({ kind: 'idle', message: '' }) }} />}
            <small className={`field-help ${modelsError ? 'field-help-error' : ''}`}>
              {modelsLoading ? 'กำลังโหลดรายการโมเดล…'
                : modelsError ? `${modelsError} · พิมพ์ชื่อโมเดลเองได้`
                : models.length > 0 ? <>พบ {models.length} โมเดล · เลือกโมเดลที่รองรับการอ่านรูปภาพ{customModel && <> · <button type="button" className="inline-link" onClick={() => setCustomModel(false)}>เลือกจากรายการ</button></>}</>
                : 'ใส่ API key แล้วระบบจะโหลดรายการโมเดลที่ใช้ได้ให้เลือกอัตโนมัติ'}
            </small>
            {models.length > 0 && model && !models.includes(model) && !customModel && <small className="field-help field-help-error">โมเดลนี้ไม่อยู่ในรายการของผู้ให้บริการ อาจใช้งานไม่ได้ ลองเลือกจากรายการ</small>}
          </div>
          {provider === 'openai-compatible' && <div className="field">
            <label htmlFor="ai-base-url">Base URL</label>
            <input id="ai-base-url" type="url" autoComplete="url" required maxLength={500} placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setStatus({ kind: 'idle', message: '' }) }} />
            <small className="field-help">ใส่ base URL ของ provider ไม่ต้องเติม `/chat/completions`; ต้องเป็น HTTPS</small>
          </div>}
          {provider === 'gemini' && <div className="provider-hint"><CircleHelp size={15} /><span>ใช้ Gemini API ผ่าน endpoint ของ Google โดยอัตโนมัติ ขอ API key ได้จาก Google AI Studio</span></div>}
          <div className="field">
            <label htmlFor="ai-api-key">API key</label>
            <input id="ai-api-key" type="password" autoComplete="new-password" maxLength={4096} placeholder={hasSavedKey ? 'มี key บันทึกแล้ว · กรอกใหม่เพื่อแทนที่' : 'วาง API key ของคุณ'} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setStatus({ kind: 'idle', message: '' }); setFormMessage('') }} />
            <small className="field-help">{hasSavedKey ? 'ระบบจะไม่ดึง key เดิมกลับมาแสดง หากเปลี่ยนค่าให้กรอก key ใหม่' : 'กรอก key เพื่อทดสอบหรือบันทึกการเชื่อมต่อ'}</small>
          </div>
        </div>

        {hasSavedKey && <div className="saved-key-note"><ShieldCheck size={16} /><span>มี API key ของบัญชีนี้บันทึกไว้แล้ว · ตั้งค่าล่าสุดจะแยกจากผู้ใช้อื่น</span></div>}
        {status.message && <div className={`connection-status ${status.kind}`} role="status">{status.kind === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}<span>{status.message}</span></div>}
        {formMessage && <p className="settings-message" role="status">{formMessage}</p>}

        <div className="settings-actions">
          <button className="button button-outline" type="button" onClick={() => void testConnection()} disabled={testing || loading || !model.trim() || (!hasSavedKey && !apiKey.trim())}>{testing ? <LoaderCircle className="spin" size={15} /> : <Wifi size={15} />}{testing ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}</button>
          <button className="button button-primary" type="submit" disabled={saving || loading || !model.trim() || (!hasSavedKey && !apiKey.trim())}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? 'กำลังบันทึก…' : hasSavedKey && apiKey.trim() ? 'บันทึก / เปลี่ยน key' : 'บันทึกการตั้งค่า'}</button>
        </div>
        {hasSavedKey && <button className="clear-key-button" type="button" onClick={() => void clearSettings()} disabled={clearing}>{clearing ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}ลบการตั้งค่าและ API key</button>}
      </form>

      <aside className="settings-side-card">
        <div className="settings-side-icon"><ShieldCheck size={19} /></div>
        <h2>คีย์ของคุณ แยกเป็นส่วนตัว</h2>
        <p>ระบบจัดเก็บการตั้งค่าไว้ในแถวของบัญชีนี้ โดย Supabase RLS จำกัดไม่ให้บัญชีอื่นอ่านหรือแก้ไขได้ API key ไม่ถูกใส่ใน frontend bundle หรือ localStorage; ผู้ดูแล Supabase project ยังเข้าถึงข้อมูลระดับฐานข้อมูลได้</p>
        <div className="settings-safety-line"><Check size={14} /><span>ไม่ใช้ service_role key</span></div>
        <div className="settings-safety-line"><Check size={14} /><span>ไม่แสดง API key หลังบันทึก</span></div>
        <div className="settings-safety-line"><Check size={14} /><span>Test connection เรียก provider จริง</span></div>
        <p className="settings-small-note">การทดสอบและการวิเคราะห์รูปอาจมีค่าใช้จ่ายตามเงื่อนไขของผู้ให้บริการที่คุณเลือก</p>
      </aside>
    </div>}
  </main>
}

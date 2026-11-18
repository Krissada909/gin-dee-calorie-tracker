import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity as ActivityIcon, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight,
  Bell, Camera, Check, ChevronDown, CircleHelp, Clock3, Flame, Footprints,
  ImagePlus, LoaderCircle, LogOut, Mail, Minus, Plus, Salad, Sparkles, Trash2,
  Settings as SettingsIcon, Utensils, X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, mealLabels, supabase, type Activity, type Meal, type MealType } from './lib/supabase'
import { signedFoodPhotoUrl, uploadFoodPhoto } from './lib/foodPhotos'
import AISettingsPage from './components/AISettings'

const DAY_MS = 24 * 60 * 60 * 1000
const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const activityOptions = ['วิ่ง', 'เดิน', 'ปั่นจักรยาน', 'เวทเทรนนิ่ง', 'โยคะ', 'อื่น ๆ']
const demoKey = 'kalink-dee-demo-v1'

type DemoState = { meals: Meal[]; activities: Activity[] }

function dateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function seedDemo(): DemoState {
  const today = dateKey()
  return {
    meals: [
      { id: 'demo-1', eaten_at: `${today}T08:15:00`, meal_type: 'breakfast', name: 'ข้าวต้มปลา', calories: 320, note: 'ตัวอย่าง' },
      { id: 'demo-2', eaten_at: `${today}T12:30:00`, meal_type: 'lunch', name: 'ข้าวกะเพราไก่ไข่ดาว', calories: 650, note: 'ตัวอย่าง' },
      { id: 'demo-3', eaten_at: `${today}T15:20:00`, meal_type: 'snack', name: 'ลาเต้เย็น', calories: 180, note: 'ตัวอย่าง' },
    ],
    activities: [
      { id: 'demo-run', performed_at: `${today}T18:10:00`, activity: 'วิ่ง', calories_burned: 280, distance_km: 4.2 },
    ],
  }
}

function loadDemo(): DemoState {
  try {
    const stored = localStorage.getItem(demoKey)
    if (stored) return JSON.parse(stored) as DemoState
  } catch { /* start with examples if local storage is unavailable */ }
  const initial = seedDemo()
  try { localStorage.setItem(demoKey, JSON.stringify(initial)) } catch { /* storage can be disabled */ }
  return initial
}

function formatCalories(value: number) {
  return new Intl.NumberFormat('th-TH').format(value)
}

function formatDateLabel(key: string) {
  const date = new Date(`${key}T12:00:00`)
  return new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function dayRange(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const end = new Date(start.getTime() + DAY_MS)
  return { start: start.toISOString(), end: end.toISOString() }
}

function readImage(file: File, maxSide = 1280): Promise<{ file: File; url: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('ไฟล์นี้เปิดไม่ได้ ลองเลือกรูป JPG, PNG หรือ WebP'))
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        if (!context) return reject(new Error('เตรียมรูปไม่สำเร็จ'))
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('บีบอัดรูปไม่สำเร็จ'))
          const compact = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
          const url = canvas.toDataURL('image/jpeg', 0.78)
          resolve({ file: compact, url })
        }, 'image/jpeg', 0.78)
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function IconMark() {
  return <span className="brand-mark"><Utensils size={20} strokeWidth={2.2} /></span>
}

function AuthGate({ onContinueDemo }: { onContinueDemo: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (authError) setError(authError.message)
    else setSent(true)
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><IconMark /><span>กินดี</span></div>
        <p className="eyebrow">YOUR DAILY FOOD JOURNAL</p>
        <h1>เริ่มบันทึก<br />ทีละมื้อ</h1>
        <p className="auth-copy">เข้าสู่ระบบเพื่อเก็บบันทึกอาหารและกิจกรรมของคุณอย่างเป็นส่วนตัว</p>
        {sent ? (
          <div className="sent-message"><span className="sent-icon"><Mail size={20} /></span><strong>ส่งลิงก์ให้แล้ว</strong><p>ลองเช็กอีเมล {email} แล้วกดลิงก์เพื่อเข้าสู่ระบบ</p></div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="login-email">อีเมลของคุณ</label>
            <input id="login-email" type="email" placeholder="name@email.com" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            {error && <p className="form-error">{error}</p>}
            <button className="button button-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Mail size={17} />} ส่งลิงก์เข้าสู่ระบบ</button>
          </form>
        )}
        <div className="auth-divider"><span>หรือ</span></div>
        <button className="button button-ghost full-width" onClick={onContinueDemo}>ลองโหมดตัวอย่าง</button>
        <p className="auth-footnote">ข้อมูลของคุณเป็นส่วนตัว และจะไม่ถูกเผยแพร่</p>
      </section>
      <div className="auth-side"><div className="auth-note"><span className="tiny-star">✳</span><p>กินอย่างเข้าใจ<br /><em>ไม่ต้องสมบูรณ์แบบ</em></p><small>บันทึกวันนี้ เพื่อรู้จักตัวเองมากขึ้น</small></div></div>
    </main>
  )
}

function MealComposer({ date, accessToken, canAnalyze, onClose, onSave }: { date: string; accessToken?: string; canAnalyze: boolean; onClose: () => void; onSave: (entry: Omit<Meal, 'id'>, photo?: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mealType, setMealType] = useState<MealType>('lunch')
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5))
  const [photo, setPhoto] = useState<File>()
  const [preview, setPreview] = useState('')
  const [analysisNote, setAnalysisNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  async function choosePhoto(file?: File) {
    if (!file) return
    setError('')
    try {
      const image = await readImage(file)
      setPhoto(image.file)
      setPreview(image.url)
      setAnalysisNote(canAnalyze ? 'ภาพพร้อมแล้ว กด “ให้ช่วยประเมิน” เพื่อดูชื่ออาหารและแคลอรีโดยประมาณ' : 'โหมดตัวอย่างยังไม่เชื่อม AI — กรอกชื่ออาหารและแคลอรีเองได้')
    } catch (e) { setError(e instanceof Error ? e.message : 'เปิดรูปไม่สำเร็จ') }
  }

  async function analyzePhoto() {
    if (!preview || !accessToken) return
    setAnalyzing(true)
    setError('')
    try {
      const response = await fetch('/api/analyze-food', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ imageDataUrl: preview }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'วิเคราะห์รูปไม่สำเร็จ')
      setName(result.name || '')
      setCalories(String(result.calories ?? ''))
      setAnalysisNote(`${result.portion ? `${result.portion} · ` : ''}${result.note || 'ค่าประเมินจากภาพ'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'วิเคราะห์รูปไม่สำเร็จ')
    } finally { setAnalyzing(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !Number.isFinite(Number(calories))) return
    setBusy(true)
    setError('')
    try {
      await onSave({
        eaten_at: new Date(`${date}T${time}:00`).toISOString(),
        meal_type: mealType,
        name: name.trim(),
        calories: Math.max(0, Math.round(Number(calories))),
        image_url: preview || null,
        note: analysisNote || null,
      }, photo)
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <Modal title="เพิ่มมื้ออาหาร" subtitle="บันทึกภาพและรายละเอียดของมื้อนี้" onClose={onClose}>
    <form onSubmit={submit} className="composer-form">
      <div className="photo-picker">
        {preview ? <div className="photo-preview"><img src={preview} alt="ภาพอาหารที่เลือก" /><button type="button" className="photo-remove" onClick={() => { setPhoto(undefined); setPreview(''); setAnalysisNote('') }} aria-label="ลบรูป"><X size={16} /></button></div> : <button type="button" className="photo-drop" onClick={() => inputRef.current?.click()}><span className="photo-drop-icon"><ImagePlus size={23} /></span><strong>เพิ่มรูปอาหาร</strong><small>ถ่ายรูปหรือเลือกจากอัลบั้ม</small><span className="photo-drop-cta"><Camera size={14} /> เลือกรูป</span></button>}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void choosePhoto(e.target.files?.[0])} />
      </div>
      {preview && <div className="analysis-row"><div className="analysis-copy"><Sparkles size={16} /><span>{analysisNote || 'ให้ AI ช่วยดูว่าเป็นอาหารอะไร'}</span></div>{canAnalyze ? <button type="button" className="button button-outline button-small" onClick={() => void analyzePhoto()} disabled={analyzing}>{analyzing ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{analyzing ? 'กำลังดูรูป...' : 'ให้ช่วยประเมิน'}</button> : <span className="analysis-unavailable">ตั้งค่า AI หลังเข้าสู่ระบบ</span>}</div>}
      <div className="field-grid">
        <div className="field full-field"><label htmlFor="meal-name">ชื่ออาหาร</label><input id="meal-name" required maxLength={160} placeholder="เช่น ข้าวกะเพราไก่ไข่ดาว" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="meal-calories">แคลอรีโดยประมาณ</label><div className="input-suffix"><input id="meal-calories" required type="number" min="0" max="10000" step="1" placeholder="0" value={calories} onChange={(e) => setCalories(e.target.value)} /><span>kcal</span></div></div>
        <div className="field"><label htmlFor="meal-time">เวลาที่ทาน</label><input id="meal-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div className="field full-field"><label>ประเภทมื้อ</label><div className="choice-row">{mealTypes.map((type) => <button type="button" key={type} className={`choice-chip ${mealType === type ? 'selected' : ''}`} onClick={() => setMealType(type)}>{mealLabels[type]}</button>)}</div></div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="estimate-disclaimer"><CircleHelp size={14} /> ค่าแคลอรีจากภาพเป็นเพียงการประเมิน อาจคลาดเคลื่อนตามปริมาณและส่วนผสม</p>
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} บันทึกมื้อนี้</button></div>
    </form>
  </Modal>
}

function ActivityComposer({ date, onClose, onSave }: { date: string; onClose: () => void; onSave: (entry: Omit<Activity, 'id'>) => Promise<void> }) {
  const [activity, setActivity] = useState('วิ่ง')
  const [calories, setCalories] = useState('')
  const [distance, setDistance] = useState('')
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave({ performed_at: new Date(`${date}T${time}:00`).toISOString(), activity, calories_burned: Math.max(0, Math.round(Number(calories) || 0)), distance_km: Math.max(0, Number(distance) || 0) })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  return <Modal title="เพิ่มกิจกรรม" subtitle="เก็บการออกกำลังกายของวันนี้" onClose={onClose}>
    <form onSubmit={submit} className="composer-form">
      <div className="activity-type-grid">{activityOptions.map((item) => <button key={item} type="button" className={`activity-option ${activity === item ? 'selected' : ''}`} onClick={() => setActivity(item)}><span className="activity-option-icon">{item === 'วิ่ง' ? <Footprints size={18} /> : <ActivityIcon size={18} />}</span>{item}</button>)}</div>
      <div className="field-grid">
        <div className="field"><label htmlFor="burned">เผาผลาญประมาณ</label><div className="input-suffix"><input id="burned" type="number" min="0" max="20000" required placeholder="0" value={calories} onChange={(e) => setCalories(e.target.value)} /><span>kcal</span></div></div>
        <div className="field"><label htmlFor="distance">ระยะทาง (ถ้ามี)</label><div className="input-suffix"><input id="distance" type="number" min="0" max="1000" step="0.01" placeholder="0.00" value={distance} onChange={(e) => setDistance(e.target.value)} /><span>กม.</span></div></div>
        <div className="field full-field"><label htmlFor="activity-time">เวลา</label><input id="activity-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="estimate-disclaimer"><CircleHelp size={14} /> กรอกค่าพลังงานจากนาฬิกาหรือแอปออกกำลังกายของคุณ</p>
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} บันทึกกิจกรรม</button></div>
    </form>
  </Modal>
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="modal-sheet" role="dialog" aria-modal="true" aria-label={title}><header className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="ปิด"><X size={19} /></button></header>{children}</section></div>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [demoMode, setDemoMode] = useState(!isSupabaseConfigured)
  const [selectedDate, setSelectedDate] = useState(dateKey())
  const [demo, setDemo] = useState<DemoState>(loadDemo)
  const [meals, setMeals] = useState<Meal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'meal' | 'activity' | null>(null)
  const [page, setPage] = useState<'dashboard' | 'settings'>('dashboard')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const today = dateKey()
  const isToday = selectedDate === today

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true) }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => {
      setSession(current)
      setAuthReady(true)
      if (current) setDemoMode(false)
      else setPage('dashboard')
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(demoKey, JSON.stringify(demo)) } catch { /* local-only demo may exceed storage */ }
  }, [demo])

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  const loadEntries = useCallback(async () => {
    if (!supabase || !session?.user) return
    setLoading(true)
    const range = dayRange(selectedDate)
    const [foodResult, activityResult] = await Promise.all([
      supabase.from('food_entries').select('id,user_id,eaten_at,meal_type,name,calories,image_path,note').gte('eaten_at', range.start).lt('eaten_at', range.end).order('eaten_at', { ascending: true }),
      supabase.from('exercise_entries').select('id,user_id,performed_at,activity,calories_burned,distance_km').gte('performed_at', range.start).lt('performed_at', range.end).order('performed_at', { ascending: true }),
    ])
    if (foodResult.error || activityResult.error) {
      showToast(foodResult.error?.message || activityResult.error?.message || 'โหลดข้อมูลไม่สำเร็จ')
      setLoading(false)
      return
    }
    const foodRows = await Promise.all((foodResult.data || []).map(async (row) => ({
      ...row,
      image_url: await signedFoodPhotoUrl(row.image_path),
    } as Meal)))
    setMeals(foodRows)
    setActivities((activityResult.data || []).map((row) => ({ ...row, distance_km: Number(row.distance_km) } as Activity)))
    setLoading(false)
  }, [selectedDate, session, showToast])

  useEffect(() => {
    if (demoMode) {
      setMeals(demo.meals.filter((item) => dateKey(new Date(item.eaten_at)) === selectedDate).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at)))
      setActivities(demo.activities.filter((item) => dateKey(new Date(item.performed_at)) === selectedDate).sort((a, b) => a.performed_at.localeCompare(b.performed_at)))
    } else if (session) {
      void loadEntries()
    } else { setMeals([]); setActivities([]) }
  }, [demo, demoMode, loadEntries, selectedDate, session])

  const totals = useMemo(() => ({
    intake: meals.reduce((sum, item) => sum + item.calories, 0),
    burned: activities.reduce((sum, item) => sum + item.calories_burned, 0),
    distance: activities.reduce((sum, item) => sum + item.distance_km, 0),
  }), [meals, activities])
  const net = totals.intake - totals.burned

  async function saveMeal(entry: Omit<Meal, 'id'>, photo?: File) {
    if (!demoMode && supabase && session?.user) {
      let imagePath: string | null = null
      if (photo) imagePath = await uploadFoodPhoto(session.user.id, photo)
      const { error } = await supabase.from('food_entries').insert({
        user_id: session.user.id,
        eaten_at: entry.eaten_at,
        meal_type: entry.meal_type,
        name: entry.name,
        calories: entry.calories,
        image_path: imagePath,
        note: entry.note,
      })
      if (error) throw error
      await loadEntries()
    } else {
      setDemo((current) => ({ ...current, meals: [...current.meals, { ...entry, id: crypto.randomUUID() }] }))
    }
    showToast('บันทึกมื้ออาหารแล้ว')
  }

  async function saveActivity(entry: Omit<Activity, 'id'>) {
    if (!demoMode && supabase && session?.user) {
      const { error } = await supabase.from('exercise_entries').insert({ ...entry, user_id: session.user.id })
      if (error) throw error
      await loadEntries()
    } else {
      setDemo((current) => ({ ...current, activities: [...current.activities, { ...entry, id: crypto.randomUUID() }] }))
    }
    showToast('บันทึกกิจกรรมแล้ว')
  }

  async function deleteMeal(meal: Meal) {
    if (!window.confirm(`ลบรายการ “${meal.name}” ใช่ไหม?`)) return
    if (!demoMode && supabase) {
      const { error } = await supabase.from('food_entries').delete().eq('id', meal.id)
      if (error) return showToast('ลบรายการไม่สำเร็จ')
      if (meal.image_path && session?.user) await supabase.storage.from('food-photos').remove([meal.image_path])
      await loadEntries()
    } else setDemo((current) => ({ ...current, meals: current.meals.filter((item) => item.id !== meal.id) }))
    showToast('ลบรายการแล้ว')
  }

  async function deleteActivity(item: Activity) {
    if (!window.confirm(`ลบกิจกรรม “${item.activity}” ใช่ไหม?`)) return
    if (!demoMode && supabase) {
      const { error } = await supabase.from('exercise_entries').delete().eq('id', item.id)
      if (error) return showToast('ลบกิจกรรมไม่สำเร็จ')
      await loadEntries()
    } else setDemo((current) => ({ ...current, activities: current.activities.filter((row) => row.id !== item.id) }))
    showToast('ลบกิจกรรมแล้ว')
  }

  function shiftDate(direction: number) {
    const current = new Date(`${selectedDate}T12:00:00`)
    current.setDate(current.getDate() + direction)
    setSelectedDate(dateKey(current))
  }

  if (isSupabaseConfigured && !authReady) return <div className="screen-loading"><LoaderCircle className="spin" size={22} />กำลังตรวจสอบบัญชี…</div>
  if (isSupabaseConfigured && !session && !demoMode) return <AuthGate onContinueDemo={() => setDemoMode(true)} />

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top"><IconMark /><span>กินดี</span><span className="brand-period">.</span></a>
      <span className="nav-caption">สมุดบันทึกของฉัน</span>
      <nav className="side-nav" aria-label="เมนูหลัก">
        <button type="button" className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}><span className="nav-icon"><Salad size={18} /></span>ภาพรวมวันนี้</button>
        <a href="#meals" className="nav-item" onClick={() => setPage('dashboard')}><span className="nav-icon"><Utensils size={18} /></span>บันทึกอาหาร</a>
        <a href="#activities" className="nav-item" onClick={() => setPage('dashboard')}><span className="nav-icon"><Footprints size={18} /></span>กิจกรรมของฉัน</a>
        {session && !demoMode && <button type="button" className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><span className="nav-icon"><SettingsIcon size={18} /></span>ตั้งค่า AI</button>}
      </nav>
      <div className="sidebar-spacer" />
      <div className="privacy-note"><span className="privacy-mark"><Check size={13} /></span><div><strong>{demoMode ? 'ข้อมูลตัวอย่าง' : 'ข้อมูลส่วนตัว'}</strong><small>{demoMode ? 'เก็บไว้ในเบราว์เซอร์นี้' : 'บันทึกในบัญชีของคุณ'}</small></div></div>
      <div className="sidebar-footer"><span className="leaf-dot" /> กินดี · สมุดอาหารของคุณ</div>
    </aside>

    <div className="main-column" id="top">
      <header className="topbar"><a className="mobile-brand" href="#top"><IconMark /><span>กินดี</span><span className="brand-period">.</span></a><div className="topbar-right"><span className={`mode-pill ${demoMode ? 'demo' : ''}`}><span />{demoMode ? 'โหมดตัวอย่าง' : 'บันทึกส่วนตัว'}</span><button className="icon-button notification-button" aria-label="แจ้งเตือน"><Bell size={18} /></button><div className="user-menu">{demoMode ? <span className="avatar">ก</span> : <span className="avatar">{session?.user.email?.[0]?.toUpperCase() || 'U'}</span>}<span className="user-name">{demoMode ? 'ผู้ใช้ตัวอย่าง' : session?.user.email?.split('@')[0]}</span><ChevronDown size={14} />{!demoMode && <button className="signout-button" title="ออกจากระบบ" onClick={() => void supabase?.auth.signOut()}><LogOut size={15} /></button>}</div></div></header>
      {page === 'settings' && session && !demoMode && <AISettingsPage session={session} onBack={() => setPage('dashboard')} />}
      <main className={`dashboard ${page === 'settings' ? 'dashboard-hidden' : ''}`}>
        <section className="welcome-row">
          <div><div className="eyebrow">บันทึกเล็ก ๆ ที่ทำให้เข้าใจตัวเอง</div><h1>{isToday ? 'วันนี้ของคุณ' : 'บันทึกประจำวัน'}</h1><p className="date-label">{formatDateLabel(selectedDate)}</p></div>
          <div className="date-switcher"><button className="date-arrow" aria-label="วันก่อนหน้า" onClick={() => shiftDate(-1)}><ArrowLeft size={17} /></button><button className="date-today" onClick={() => setSelectedDate(today)} disabled={isToday}><Clock3 size={14} /> วันนี้</button><button className="date-arrow" aria-label="วันถัดไป" disabled={selectedDate >= today} onClick={() => shiftDate(1)}><ArrowRight size={17} /></button></div>
        </section>

        {demoMode && <div className="demo-banner"><Sparkles size={16} /><span>กำลังดูข้อมูลตัวอย่าง — เชื่อม Supabase ในการตั้งค่าเพื่อเก็บข้อมูลบัญชีของคุณ</span><button onClick={() => showToast('ดูคู่มือตั้งค่าใน README.md')}>ดูวิธีตั้งค่า</button>{isSupabaseConfigured && <button className="demo-login-button" onClick={() => setDemoMode(false)}>เข้าสู่ระบบ</button>}</div>}

        <section id="summary" className="summary-section">
          <div className="summary-card">
            <div className="summary-card-top"><span className="summary-kicker"><span className="kicker-dot" /> สรุปพลังงานรายวัน</span><span className="summary-date-mini">{new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(new Date(`${selectedDate}T12:00:00`))}</span></div>
            <div className="summary-main"><div className="summary-net"><span className="summary-label">สมดุลสุทธิ</span><div className="net-number">{formatCalories(net)}<small>kcal</small></div><p>{net >= 0 ? 'พลังงานรับเข้า มากกว่าที่บันทึกว่าใช้ไป' : 'พลังงานจากกิจกรรมมากกว่าที่รับเข้า'}</p></div><div className="summary-formula"><div className="formula-line"><span className="formula-icon intake-icon"><ArrowDownRight size={16} /></span><div><small>รับเข้าจากอาหาร</small><strong>{formatCalories(totals.intake)} <em>kcal</em></strong></div></div><div className="formula-minus"><Minus size={14} /></div><div className="formula-line"><span className="formula-icon burn-icon"><Flame size={16} /></span><div><small>เผาผลาญจากกิจกรรม</small><strong>{formatCalories(totals.burned)} <em>kcal</em></strong></div></div></div></div>
            <div className="summary-footer"><span>คำนวณจากรายการที่บันทึกในวันที่เลือก</span><span className="sum-tag">{meals.length} มื้อ <i /> {activities.length} กิจกรรม</span></div>
          </div>
          <div className="metric-stack"><article className="metric-card intake-metric"><div className="metric-top"><span className="metric-icon"><Utensils size={17} /></span><span className="metric-direction"><ArrowDownRight size={16} /></span></div><span className="metric-label">พลังงานที่รับเข้า</span><strong>{formatCalories(totals.intake)} <small>kcal</small></strong><span className="metric-foot">รวมจากอาหารที่บันทึก</span></article><article className="metric-card burn-metric"><div className="metric-top"><span className="metric-icon"><Flame size={17} /></span><span className="metric-direction"><ArrowUpRight size={16} /></span></div><span className="metric-label">เผาผลาญจากกิจกรรม</span><strong>{formatCalories(totals.burned)} <small>kcal</small></strong><span className="metric-foot"><Footprints size={13} /> {totals.distance.toLocaleString('th-TH', { maximumFractionDigits: 2 })} กม. ที่วิ่ง/เคลื่อนไหว</span></article></div>
        </section>

        <div className="section-heading" id="meals"><div><span className="section-index">01 / FOOD JOURNAL</span><h2>มื้ออาหาร <span>{meals.length}</span></h2></div><button className="button button-primary" onClick={() => setModal('meal')}><Plus size={17} /> เพิ่มมื้ออาหาร</button></div>
        <section className="journal-card" aria-label="รายการมื้ออาหาร">
          <div className="journal-card-head"><div><strong>บันทึกของวันนี้</strong><span>{isToday ? 'มื้อที่คุณบันทึกไว้ตลอดวัน' : formatDateLabel(selectedDate)}</span></div><span className="journal-total">รวม <b>{formatCalories(totals.intake)}</b> kcal</span></div>
          {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22} /><p>กำลังโหลดบันทึก…</p></div> : meals.length ? <div className="journal-list">{meals.map((meal) => <article className="meal-row" key={meal.id}><div className="meal-time"><span className="timeline-dot" /><time>{formatTime(meal.eaten_at)}</time></div><div className="meal-photo">{meal.image_url ? <img src={meal.image_url} alt={meal.name} /> : <div className={`meal-placeholder ${meal.meal_type}`}><Utensils size={19} /></div>}</div><div className="meal-description"><span className="meal-type-label">{mealLabels[meal.meal_type]}</span><strong>{meal.name}</strong>{meal.note && <small>{meal.note}</small>}</div><div className="meal-calories"><strong>{formatCalories(meal.calories)}</strong><small>kcal</small></div><button className="row-delete" title="ลบมื้อนี้" aria-label={`ลบ ${meal.name}`} onClick={() => void deleteMeal(meal)}><Trash2 size={15} /></button></article>)}</div> : <EmptyState icon={<Utensils size={22} />} title="วันนี้ยังไม่มีมื้ออาหาร" description="บันทึกมื้อแรกของคุณ หรือเพิ่มรูปแล้วให้ช่วยประเมินแคลอรี" action="เพิ่มมื้ออาหาร" onClick={() => setModal('meal')} />}
          <button className="add-row-button" onClick={() => setModal('meal')}><Plus size={15} /> เพิ่มบันทึกอาหาร</button>
        </section>

        <div className="section-heading activity-heading" id="activities"><div><span className="section-index">02 / MOVEMENT</span><h2>กิจกรรมวันนี้ <span>{activities.length}</span></h2></div><button className="button button-outline" onClick={() => setModal('activity')}><Plus size={17} /> เพิ่มกิจกรรม</button></div>
        <section className="activity-card" aria-label="รายการออกกำลังกาย">
          {activities.length ? <div className="activity-list">{activities.map((item) => <article className="activity-row" key={item.id}><span className="activity-badge"><Footprints size={18} /></span><div className="activity-description"><strong>{item.activity}</strong><span>{formatTime(item.performed_at)} · {item.distance_km > 0 ? `${item.distance_km.toLocaleString('th-TH', { maximumFractionDigits: 2 })} กม.` : 'ไม่ได้ระบุระยะทาง'}</span></div><div className="activity-calories"><strong>{formatCalories(item.calories_burned)}</strong><small>kcal</small></div><button className="row-delete" title="ลบกิจกรรมนี้" aria-label={`ลบ ${item.activity}`} onClick={() => void deleteActivity(item)}><Trash2 size={15} /></button></article>)}</div> : <EmptyState icon={<Footprints size={22} />} title="ยังไม่มีบันทึกการเคลื่อนไหว" description="วิ่งหรือออกกำลังกายวันนี้? เพิ่มแคลอรีที่ใช้และระยะทางได้เลย" action="เพิ่มกิจกรรม" onClick={() => setModal('activity')} />}
          {activities.length > 0 && <button className="add-row-button activity-add" onClick={() => setModal('activity')}><Plus size={15} /> เพิ่มกิจกรรม</button>}
        </section>

        <footer className="dashboard-foot"><span><CircleHelp size={14} /> พลังงานที่เผาผลาญในหน้านี้รวมเฉพาะกิจกรรมที่คุณบันทึก ไม่ใช่พลังงานพื้นฐานของร่างกาย</span><span>ทำอย่างสม่ำเสมอ ในแบบของคุณ</span></footer>
      </main>
      <nav className="mobile-nav"><a href="#summary" className={`mobile-nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}><Salad size={19} /><span>ภาพรวม</span></a><a href="#meals" className="mobile-nav-item" onClick={() => setPage('dashboard')}><Utensils size={19} /><span>อาหาร</span></a><a href="#activities" className="mobile-nav-item" onClick={() => setPage('dashboard')}><Footprints size={19} /><span>กิจกรรม</span></a>{session && !demoMode && <button type="button" className={`mobile-nav-item mobile-nav-button ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><SettingsIcon size={19} /><span>ตั้งค่า</span></button>}</nav>
    </div>
    {modal === 'meal' && <MealComposer key={`meal-${selectedDate}`} date={selectedDate} accessToken={session?.access_token} canAnalyze={Boolean(session && !demoMode)} onClose={() => setModal(null)} onSave={saveMeal} />}
    {modal === 'activity' && <ActivityComposer key={`activity-${selectedDate}`} date={selectedDate} onClose={() => setModal(null)} onSave={saveActivity} />}
    {toast && <div className="toast-message"><Check size={16} />{toast}</div>}
  </div>
}

function EmptyState({ icon, title, description, action, onClick }: { icon: ReactNode; title: string; description: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p><button className="button button-ghost button-small" onClick={onClick}><Plus size={15} />{action}</button></div>
}

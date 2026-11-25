import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity as ActivityIcon, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight,
  Bell, Camera, Check, ChevronDown, CircleHelp, Clock3, Flame, Footprints,
  ImagePlus, LoaderCircle, LogOut, Minus, Plus, Salad, Sparkles, Trash2,
  Settings as SettingsIcon, ShieldCheck, Utensils, X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, mealLabels, supabase, type Activity, type Meal, type MealType } from './lib/supabase'
import { signedFoodPhotoUrl, uploadFoodPhoto } from './lib/foodPhotos'
import AISettingsPage from './components/AISettings'
import EnergyReport from './components/EnergyReport'

const DAY_MS = 24 * 60 * 60 * 1000
type DayEntries = { meals: Meal[]; activities: Activity[] }
const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const activityOptions = ['วิ่ง', 'เดิน', 'ปั่นจักรยาน', 'เวทเทรนนิ่ง', 'โยคะ', 'อื่น ๆ']
function dateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

function GoogleLogo() {
  return <svg className="google-logo" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
}

function ConfigMissing() {
  return <div className="screen-loading" role="alert">ยังไม่ได้ตั้งค่า Supabase (VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY)</div>
}

function AuthGate() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signInWithGoogle() {
    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase สำหรับเข้าสู่ระบบ')
      return
    }
    setBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (authError) {
      setError(authError.message)
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand"><IconMark /><span>กินดี</span><span className="brand-period">.</span></div>
        <div className="login-body">
          <p className="eyebrow">YOUR DAILY FOOD JOURNAL</p>
          <h1>บันทึกอาหาร<br />ทีละมื้อ <em>สบาย ๆ</em></h1>
          <p className="login-copy">เข้าสู่ระบบด้วยบัญชี Google เพื่อเริ่มบันทึกมื้ออาหารและกิจกรรมของคุณ</p>
          <button className="google-button" type="button" onClick={() => void signInWithGoogle()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={19} /> : <GoogleLogo />}
            <span>{busy ? 'กำลังเชื่อมต่อ Google…' : 'ดำเนินการต่อด้วย Google'}</span>
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
          <ul className="login-points">
            <li><span><Camera size={15} /></span>ถ่ายรูปอาหาร ให้ AI ช่วยประเมินแคลอรี</li>
            <li><span><Flame size={15} /></span>บันทึกการออกกำลังกาย ดูสมดุลพลังงานรายวัน</li>
            <li><span><ShieldCheck size={15} /></span>ข้อมูลแยกเป็นส่วนตัวตามบัญชีของคุณ</li>
          </ul>
        </div>
        <p className="login-foot">ใช้เพียงอีเมลและโปรไฟล์เพื่อสร้างบัญชี · ไม่เข้าถึงกล่องจดหมาย Gmail</p>
      </section>
      <aside className="login-visual" aria-hidden="true">
        <div className="lv-stack">
          <div className="lv-card lv-summary">
            <span className="lv-kicker"><i />สรุปพลังงานรายวัน</span>
            <strong>1,150<small>kcal</small></strong>
            <div className="lv-bar"><span /></div>
            <div className="lv-split"><span>รับเข้า <b>1,430</b></span><span>เผาผลาญ <b>280</b></span></div>
          </div>
          <div className="lv-card lv-item lv-meal">
            <span className="lv-icon lv-icon-food"><Utensils size={18} /></span>
            <div><small>มื้อกลางวัน</small><strong>ข้าวกะเพราไก่ไข่ดาว</strong></div>
            <b>650<small>kcal</small></b>
          </div>
          <div className="lv-card lv-item lv-activity">
            <span className="lv-icon lv-icon-move"><Footprints size={18} /></span>
            <div><small>18:10 · 4.2 กม.</small><strong>วิ่ง</strong></div>
            <b>280<small>kcal</small></b>
          </div>
        </div>
        <p className="lv-tagline"><span>✳</span>กินอย่างเข้าใจ<br /><em>ไม่ต้องสมบูรณ์แบบ</em></p>
      </aside>
    </main>
  )
}

function MealComposer({ date, accessToken, onClose, onSave }: { date: string; accessToken?: string; onClose: () => void; onSave: (entry: Omit<Meal, 'id'>, photo?: File) => Promise<void> }) {
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
      setAnalysisNote('ภาพพร้อมแล้ว กด “ให้ช่วยประเมิน” เพื่อดูชื่ออาหารและแคลอรีโดยประมาณ')
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
      {preview && <div className="analysis-row"><div className="analysis-copy"><Sparkles size={16} /><span>{analysisNote || 'ให้ AI ช่วยดูว่าเป็นอาหารอะไร'}</span></div><button type="button" className="button button-outline button-small" onClick={() => void analyzePhoto()} disabled={analyzing}>{analyzing ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{analyzing ? 'กำลังดูรูป...' : 'ให้ช่วยประเมิน'}</button></div>}
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
  const [selectedDate, setSelectedDate] = useState(dateKey())
  const [meals, setMeals] = useState<Meal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'meal' | 'activity' | null>(null)
  const [page, setPage] = useState<'dashboard' | 'reports' | 'settings'>('dashboard')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const dayCache = useRef(new Map<string, DayEntries>())
  const requestId = useRef(0)
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
      if (!current) setPage('dashboard')
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  const loadEntries = useCallback(async () => {
    if (!supabase || !session?.user) return
    const userId = session.user.id
    const cacheKey = `${userId}:${selectedDate}`
    const cached = dayCache.current.get(cacheKey)
    const thisRequest = ++requestId.current
    if (cached) { setMeals(cached.meals); setActivities(cached.activities) }
    setLoading(!cached)
    const range = dayRange(selectedDate)
    const [foodResult, activityResult] = await Promise.all([
      supabase.from('food_entries').select('id,user_id,eaten_at,meal_type,name,calories,image_path,note').gte('eaten_at', range.start).lt('eaten_at', range.end).order('eaten_at', { ascending: true }),
      supabase.from('exercise_entries').select('id,user_id,performed_at,activity,calories_burned,distance_km').gte('performed_at', range.start).lt('performed_at', range.end).order('performed_at', { ascending: true }),
    ])
    if (foodResult.error || activityResult.error) {
      if (thisRequest === requestId.current) {
        showToast(foodResult.error?.message || activityResult.error?.message || 'โหลดข้อมูลไม่สำเร็จ')
        setLoading(false)
      }
      return
    }
    const foodRows = (foodResult.data || []).map((row) => ({ ...row, image_url: null } as Meal))
    const activityRows = (activityResult.data || []).map((row) => ({ ...row, distance_km: Number(row.distance_km) } as Activity))
    dayCache.current.set(cacheKey, { meals: foodRows, activities: activityRows })
    if (thisRequest === requestId.current) {
      setMeals(foodRows)
      setActivities(activityRows)
      setLoading(false)
    }
    // Photos are decorative; resolve them after the rows and totals are already visible.
    void Promise.all(foodRows.filter((row) => row.image_path).map(async (row) => ({ id: row.id, url: await signedFoodPhotoUrl(row.image_path) })))
      .then((photos) => {
        if (!photos.length) return
        const latest = dayCache.current.get(cacheKey)
        if (!latest) return
        const photoById = new Map(photos.map(({ id, url }) => [id, url]))
        const updated = { ...latest, meals: latest.meals.map((meal) => photoById.has(meal.id) ? { ...meal, image_url: photoById.get(meal.id) ?? null } : meal) }
        dayCache.current.set(cacheKey, updated)
        if (thisRequest === requestId.current) setMeals(updated.meals)
      })
      .catch(() => { /* Keep the meal placeholder when a signed photo URL cannot be resolved. */ })
  }, [selectedDate, session, showToast])

  useEffect(() => {
    if (session) void loadEntries()
    else { requestId.current++; setMeals([]); setActivities([]); setLoading(false) }
  }, [loadEntries, selectedDate, session])

  const totals = useMemo(() => ({
    intake: meals.reduce((sum, item) => sum + item.calories, 0),
    burned: activities.reduce((sum, item) => sum + item.calories_burned, 0),
    distance: activities.reduce((sum, item) => sum + item.distance_km, 0),
  }), [meals, activities])
  const net = totals.intake - totals.burned

  async function saveMeal(entry: Omit<Meal, 'id'>, photo?: File) {
    if (supabase && session?.user) {
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
      throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึก')
    }
    showToast('บันทึกมื้ออาหารแล้ว')
  }

  async function saveActivity(entry: Omit<Activity, 'id'>) {
    if (supabase && session?.user) {
      const { error } = await supabase.from('exercise_entries').insert({ ...entry, user_id: session.user.id })
      if (error) throw error
      await loadEntries()
    } else {
      throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึก')
    }
    showToast('บันทึกกิจกรรมแล้ว')
  }

  async function deleteMeal(meal: Meal) {
    if (!window.confirm(`ลบรายการ “${meal.name}” ใช่ไหม?`)) return
    if (supabase) {
      const { error } = await supabase.from('food_entries').delete().eq('id', meal.id)
      if (error) return showToast('ลบรายการไม่สำเร็จ')
      if (meal.image_path && session?.user) await supabase.storage.from('food-photos').remove([meal.image_path])
      await loadEntries()
    }
    showToast('ลบรายการแล้ว')
  }

  async function deleteActivity(item: Activity) {
    if (!window.confirm(`ลบกิจกรรม “${item.activity}” ใช่ไหม?`)) return
    if (supabase) {
      const { error } = await supabase.from('exercise_entries').delete().eq('id', item.id)
      if (error) return showToast('ลบกิจกรรมไม่สำเร็จ')
      await loadEntries()
    }
    showToast('ลบกิจกรรมแล้ว')
  }

  function shiftDate(direction: number) {
    const current = new Date(`${selectedDate}T12:00:00`)
    current.setDate(current.getDate() + direction)
    setSelectedDate(dateKey(current))
  }

  if (!isSupabaseConfigured) return <ConfigMissing />
  if (!authReady) return <div className="screen-loading"><LoaderCircle className="spin" size={22} />กำลังตรวจสอบบัญชี…</div>
  if (!session) return <AuthGate />

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top"><IconMark /><span>กินดี</span><span className="brand-period">.</span></a>
      <span className="nav-caption">สมุดบันทึกของฉัน</span>
      <nav className="side-nav" aria-label="เมนูหลัก">
        <button type="button" className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}><span className="nav-icon"><Salad size={18} /></span>ภาพรวมวันนี้</button>
        <button type="button" className={`nav-item ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}><span className="nav-icon"><ActivityIcon size={18} /></span>รายงาน</button>
        <a href="#meals" className="nav-item" onClick={() => setPage('dashboard')}><span className="nav-icon"><Utensils size={18} /></span>บันทึกอาหาร</a>
        <a href="#activities" className="nav-item" onClick={() => setPage('dashboard')}><span className="nav-icon"><Footprints size={18} /></span>กิจกรรมของฉัน</a>
        <button type="button" className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><span className="nav-icon"><SettingsIcon size={18} /></span>ตั้งค่า</button>
      </nav>
      <div className="sidebar-spacer" />
      <div className="privacy-note"><span className="privacy-mark"><Check size={13} /></span><div><strong>ข้อมูลส่วนตัว</strong><small>บันทึกในบัญชีของคุณ</small></div></div>
      <div className="sidebar-footer"><span className="leaf-dot" /> กินดี · สมุดอาหารของคุณ</div>
    </aside>

    <div className="main-column" id="top">
      <header className="topbar"><a className="mobile-brand" href="#top"><IconMark /><span>กินดี</span><span className="brand-period">.</span></a><div className="topbar-right"><span className="mode-pill"><span />บันทึกส่วนตัว</span><button className="icon-button notification-button" aria-label="แจ้งเตือน"><Bell size={18} /></button><div className="user-menu"><span className="avatar">{session.user.email?.[0]?.toUpperCase() || 'U'}</span><span className="user-name">{session.user.email?.split('@')[0]}</span><ChevronDown size={14} /><button className="signout-button" title="ออกจากระบบ" onClick={() => void supabase?.auth.signOut()}><LogOut size={15} /></button></div></div></header>
      {page === 'settings' && <><AISettingsPage session={session} onBack={() => setPage('dashboard')} /><EnergyReport session={session} mode="profile" /></>}
      {page === 'reports' && <EnergyReport session={session} mode="report" />}
      <main className={`dashboard ${page !== 'dashboard' ? 'dashboard-hidden' : ''}`}>
        <section className="welcome-row">
          <div><div className="eyebrow">บันทึกเล็ก ๆ ที่ทำให้เข้าใจตัวเอง</div><h1>{isToday ? 'วันนี้ของคุณ' : 'บันทึกประจำวัน'}</h1><p className="date-label">{formatDateLabel(selectedDate)}</p></div>
          <div className="date-switcher"><button className="date-arrow" aria-label="วันก่อนหน้า" onClick={() => shiftDate(-1)}><ArrowLeft size={17} /></button><button className="date-today" onClick={() => setSelectedDate(today)} disabled={isToday}><Clock3 size={14} /> วันนี้</button><button className="date-arrow" aria-label="วันถัดไป" disabled={selectedDate >= today} onClick={() => shiftDate(1)}><ArrowRight size={17} /></button></div>
        </section>

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
      <nav className="mobile-nav"><button type="button" className={`mobile-nav-item mobile-nav-button ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}><Salad size={19} /><span>ภาพรวม</span></button><button type="button" className={`mobile-nav-item mobile-nav-button ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}><ActivityIcon size={19} /><span>รายงาน</span></button><a href="#meals" className="mobile-nav-item" onClick={() => setPage('dashboard')}><Utensils size={19} /><span>อาหาร</span></a><a href="#activities" className="mobile-nav-item" onClick={() => setPage('dashboard')}><Footprints size={19} /><span>กิจกรรม</span></a><button type="button" className={`mobile-nav-item mobile-nav-button ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><SettingsIcon size={19} /><span>ตั้งค่า</span></button></nav>
    </div>
    {modal === 'meal' && <MealComposer key={`meal-${selectedDate}`} date={selectedDate} accessToken={session.access_token} onClose={() => setModal(null)} onSave={saveMeal} />}
    {modal === 'activity' && <ActivityComposer key={`activity-${selectedDate}`} date={selectedDate} onClose={() => setModal(null)} onSave={saveActivity} />}
    {toast && <div className="toast-message"><Check size={16} />{toast}</div>}
  </div>
}

function EmptyState({ icon, title, description, action, onClick }: { icon: ReactNode; title: string; description: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p><button className="button button-ghost button-small" onClick={onClick}><Plus size={15} />{action}</button></div>
}

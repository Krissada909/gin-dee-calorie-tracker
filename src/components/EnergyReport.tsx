import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity as ActivityIcon, ArrowDownRight, ArrowUpRight, CircleHelp, Flame, Footprints, LoaderCircle, Save, Utensils } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { Activity, Meal } from '../lib/supabase'
import { supabase } from '../lib/supabase'

type Profile = { age: number; sex_category: 'male' | 'female'; height_cm: number; weight_kg: number; activity_category: 'inactive' | 'low_active' | 'active' | 'very_active' }
type Props = { session: Session | null; mode: 'profile' | 'report' }
type ProfileForm = { age: string; sex_category: Profile['sex_category']; height_cm: string; weight_kg: string; activity_category: Profile['activity_category'] }
const emptyForm: ProfileForm = { age: '', sex_category: 'female', height_cm: '', weight_kg: '', activity_category: 'low_active' }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d) }
function plusDay(s: string, n: number) { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d) }
export function estimatedEer(p: Profile) { const { age, height_cm: h, weight_kg: w, activity_category: a } = p; if (p.sex_category === 'male') { switch (a) { case 'inactive': return 753.07 - 10.83 * age + 6.50 * h + 14.10 * w; case 'low_active': return 581.47 - 10.83 * age + 8.30 * h + 14.94 * w; case 'active': return 1004.82 - 10.83 * age + 6.52 * h + 15.91 * w; default: return -517.88 - 10.83 * age + 15.61 * h + 19.11 * w } } switch (a) { case 'inactive': return 584.90 - 7.01 * age + 5.72 * h + 11.71 * w; case 'low_active': return 575.77 - 7.01 * age + 6.60 * h + 12.14 * w; case 'active': return 710.25 - 7.01 * age + 6.54 * h + 12.34 * w; default: return 511.83 - 7.01 * age + 9.07 * h + 12.56 * w } }
const nfmt = (n: number, d = 0) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: d }).format(n)
export default function EnergyReport({ session, mode }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null), [form, setForm] = useState<ProfileForm>(emptyForm)
  const [start, setStart] = useState(weekStart), [end, setEnd] = useState(() => plusDay(weekStart(), 6))
  const [meals, setMeals] = useState<Pick<Meal, 'calories' | 'eaten_at'>[]>([]), [activities, setActivities] = useState<Pick<Activity, 'calories_burned' | 'distance_km' | 'performed_at'>[]>([])
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [reportError, setReportError] = useState(''), [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      if (!session || !supabase) { setProfile(null); setForm(emptyForm); return }
      const { data, error: queryError } = await supabase.from('energy_profiles').select('age,sex_category,height_cm,weight_kg,activity_category').eq('user_id', session.user.id).maybeSingle()
      if (!alive) return
      if (queryError) setError('โหลดโปรไฟล์ไม่สำเร็จ')
      else if (data) { const p = data as Profile; setProfile(p); setForm({ age: String(p.age), sex_category: p.sex_category, height_cm: String(p.height_cm), weight_kg: String(p.weight_kg), activity_category: p.activity_category }) }
      else { setProfile(null); setForm(emptyForm) }
    })()
    return () => { alive = false }
  }, [session])

  useEffect(() => {
    if (!start || !end || start > end) { setReportError(start > end ? 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' : ''); setMeals([]); setActivities([]); return }
    let alive = true
    setLoading(true); setReportError('')
    const run = async () => {
      try {
        const client = supabase
        if (!client || !session) { setMeals([]); setActivities([]); return }
        const from = new Date(`${start}T00:00:00`).toISOString(), to = new Date(`${plusDay(end, 1)}T00:00:00`).toISOString()
        const fetchAll = async <T,>(query: (offset: number) => any): Promise<T[]> => {
          const rows: T[] = []
          for (let offset = 0; ; offset += 1000) {
            const { data, error: queryError } = await query(offset)
            if (queryError) throw queryError
            const page = (data || []) as T[]; rows.push(...page)
            if (page.length < 1000) return rows
          }
        }
        const [food, exercise] = await Promise.all([
          fetchAll<Pick<Meal, 'calories' | 'eaten_at'>>(offset => client.from('food_entries').select('calories,eaten_at').gte('eaten_at', from).lt('eaten_at', to).order('eaten_at', { ascending: true }).range(offset, offset + 999)),
          fetchAll<Pick<Activity, 'calories_burned' | 'distance_km' | 'performed_at'>>(offset => client.from('exercise_entries').select('calories_burned,distance_km,performed_at').gte('performed_at', from).lt('performed_at', to).order('performed_at', { ascending: true }).range(offset, offset + 999)),
        ])
        if (!alive) return
        setMeals(food); setActivities(exercise.map(x => ({ ...x, distance_km: Number(x.distance_km) })))
      } catch {
        if (!alive) return
        setMeals([]); setActivities([]); setReportError('โหลดข้อมูลรายงานไม่สำเร็จ กรุณาลองใหม่')
      } finally { if (alive) setLoading(false) }
    }
    void run()
    return () => { alive = false }
  }, [session, start, end])

  const days = start <= end ? Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000) + 1 : 0
  const eer = profile ? Math.round(estimatedEer(profile)) : null
  const totals = useMemo(() => {
    const intake = meals.reduce((sum, item) => sum + Number(item.calories || 0), 0)
    const workout = activities.reduce((sum, item) => sum + Number(item.calories_burned || 0), 0)
    const distance = activities.reduce((sum, item) => sum + Number(item.distance_km || 0), 0)
    return { intake, workout, distance, eer: eer === null ? null : eer * days, diff: eer === null ? null : intake - eer * days }
  }, [meals, activities, eer, days])
  const trend = useMemo(() => Array.from({ length: days }, (_, index) => {
    const day = plusDay(start, index)
    return { day, intake: meals.filter(item => dateKey(new Date(item.eaten_at)) === day).reduce((sum, item) => sum + Number(item.calories || 0), 0), workout: activities.filter(item => dateKey(new Date(item.performed_at)) === day).reduce((sum, item) => sum + Number(item.calories_burned || 0), 0) }
  }), [start, days, meals, activities])
  const chartMax = Math.max(500, Math.ceil(Math.max(0, ...trend.flatMap(item => [item.intake, item.workout])) / 500) * 500)
  const chartTicks = Array.from({ length: 5 }, (_, index) => chartMax * (4 - index) / 4)

  async function clearProfile() { setError(''); setNotice(''); try { if (supabase && session) { const { error: e } = await supabase.from('energy_profiles').delete().eq('user_id', session.user.id); if (e) throw e } setProfile(null); setForm(emptyForm); setNotice('ลบโปรไฟล์ประมาณการแล้ว') } catch (e) { setError(e instanceof Error ? e.message : 'ลบโปรไฟล์ไม่สำเร็จ') } }
  async function save(e: FormEvent) {
    e.preventDefault(); setError(''); setNotice('')
    const age = Number(form.age), height_cm = Number(form.height_cm), weight_kg = Number(form.weight_kg)
    if (!form.age || !form.height_cm || !form.weight_kg || !Number.isFinite(age) || !Number.isFinite(height_cm) || !Number.isFinite(weight_kg)) { setError('กรุณากรอกอายุ ส่วนสูง และน้ำหนัก'); return }
    if (age < 19) { setError('สูตรนี้ใช้กับผู้ใหญ่อายุ 19 ปีขึ้นไปเท่านั้น'); return }
    if (!supabase || !session) { setError('กรุณาเข้าสู่ระบบ'); return }
    const values: Profile = { age, sex_category: form.sex_category, height_cm, weight_kg, activity_category: form.activity_category }
    setSaving(true)
    try { const { error: e } = await supabase.from('energy_profiles').upsert({ user_id: session.user.id, ...values }, { onConflict: 'user_id' }); if (e) throw e; setProfile(values); setNotice('บันทึกโปรไฟล์แล้ว') }
    catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') } finally { setSaving(false) }
  }
  const update = (patch: Partial<ProfileForm>) => setForm(value => ({ ...value, ...patch }))

  if (mode === 'profile') return <section className="dashboard settings-page energy-profile-page">
    <div className="settings-title-row"><div><p className="eyebrow">PERSONAL ENERGY PROFILE</p><h1>ประมาณการพลังงาน</h1><p className="date-label">โปรไฟล์นี้เป็นข้อมูลส่วนตัวและไม่บังคับ · จัดเก็บแยกตามบัญชี</p></div><span className="settings-title-icon"><ActivityIcon size={22} /></span></div>
    <div className="energy-profile-layout"><form className="energy-card" onSubmit={save}><h3>โปรไฟล์ประมาณการพลังงาน <small>ไม่บังคับ</small></h3><p>คำนวณ Estimated Energy Requirement (EER) จากสูตรผู้ใหญ่อายุ 19+ ของ National Academies (2023); EER ≈ TEE เมื่อคงน้ำหนัก <a href="https://www.ncbi.nlm.nih.gov/books/NBK591034/table/tab_S_3/?report=objectonly" target="_blank" rel="noreferrer">ดู Table S-3</a></p><div className="energy-fields"><label>อายุ (ปี)<input required type="number" min="19" max="120" value={form.age} onChange={e => update({ age: e.target.value })} /></label><label>หมวดสูตร<select value={form.sex_category} onChange={e => update({ sex_category: e.target.value as Profile['sex_category'] })}><option value="female">หญิง</option><option value="male">ชาย</option></select></label><label>ส่วนสูง (ซม.)<input required type="number" min="100" max="250" step="0.1" value={form.height_cm} onChange={e => update({ height_cm: e.target.value })} /></label><label>น้ำหนัก (กก.)<input required type="number" min="25" max="350" step="0.1" value={form.weight_kg} onChange={e => update({ weight_kg: e.target.value })} /></label><label className="energy-wide">ระดับกิจกรรม<select value={form.activity_category} onChange={e => update({ activity_category: e.target.value as Profile['activity_category'] })}><option value="inactive">ไม่ค่อยเคลื่อนไหว</option><option value="low_active">เคลื่อนไหวเล็กน้อย</option><option value="active">เคลื่อนไหวปานกลาง</option><option value="very_active">เคลื่อนไหวมาก</option></select></label></div><button className="button button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}บันทึกโปรไฟล์</button>{profile && <button type="button" className="button button-ghost profile-delete" onClick={() => void clearProfile()}>ลบโปรไฟล์/ปิดการประมาณการ</button>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status" className="energy-notice">{notice}</p>}<p className="estimate-disclaimer"><CircleHelp size={14} />ไม่ใช่คำแนะนำทางการแพทย์; ไม่เหมาะสำหรับผู้มีอายุต่ำกว่า 19 ปี ผู้ตั้งครรภ์ หรือผู้ให้นมบุตร ตามข้อจำกัด <a href="https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" target="_blank" rel="noreferrer">NIDDK Body Weight Planner</a></p>{profile && <div className="eer-result"><span>ประมาณการ EER / TDEE ต่อวัน</span><strong>{nfmt(Math.round(estimatedEer(profile)))} <small>kcal/วัน</small></strong><small>เป็นค่าประมาณ ไม่ใช่เป้าหมายทางการแพทย์ · ไม่รวม/หัก workout kcal ซ้ำ</small></div>}</form><aside className="settings-side-card"><div className="settings-side-icon"><CircleHelp size={19} /></div><h2>ข้อมูลสุขภาพของคุณ</h2><p>กรอกข้อมูลเฉพาะเมื่อสะดวก โปรไฟล์เริ่มต้นว่างและลบได้ทุกเมื่อ รายงานจะใช้ข้อมูลนี้เพื่อแสดงค่าประมาณเท่านั้น</p><div className="settings-safety-line"><CircleHelp size={14} /><span>สูตร National Academies 2023 สำหรับอายุ 19+</span></div><p className="settings-small-note">กิจกรรมที่บันทึกแสดงแยกต่างหาก ไม่ถูกนำมาหักจาก EER ซ้ำอีกครั้ง</p></aside></div>
  </section>

  return <main className="dashboard report-page">
    <section className="welcome-row report-welcome"><div><div className="eyebrow">03 / ESTIMATE & REPORT</div><h1>รายงานพลังงาน</h1><p className="date-label">สรุปช่วงเวลาแบบอ่านเร็ว · กิจกรรมแสดงแยกจาก EER</p></div></section>
    <section className="report-range-panel"><div><strong>ช่วงเวลารายงาน</strong><span>รวมวันเริ่มต้นและวันสิ้นสุด</span></div><div className="range-controls"><button className="button button-outline button-small" type="button" onClick={() => { const s = weekStart(); setStart(s); setEnd(plusDay(s, 6)) }}>สัปดาห์ปัจจุบัน</button><label>เริ่มวันที่<input aria-label="วันที่เริ่มรายงาน" type="date" value={start} onChange={e => setStart(e.target.value)} /></label><label>ถึงวันที่<input aria-label="วันที่สิ้นสุดรายงาน" type="date" value={end} onChange={e => setEnd(e.target.value)} /></label></div></section>
    {!profile && <div className="report-profile-notice"><CircleHelp size={18} /><div><strong>ยังไม่ได้ตั้งค่าโปรไฟล์ EER</strong><span>รายงานจะแสดงอาหารและกิจกรรมได้ แต่ยังคำนวณส่วนต่างเทียบ EER ไม่ได้</span></div></div>}
    {loading ? <div className="settings-loading"><LoaderCircle className="spin" size={20} /> กำลังโหลดรายงาน…</div> : reportError ? <p className="form-error report-error" role="alert">{reportError}</p> : <>
      <section className="report-metrics" aria-label="ตัวชี้วัดรายงาน">
        <article className="report-metric intake-report-metric"><span className="report-metric-icon"><Utensils size={18} /></span><small>พลังงานที่รับเข้า</small><strong>{nfmt(totals.intake)} <em>kcal</em></strong><span>เฉลี่ย {nfmt(days ? totals.intake / days : 0)} kcal/วัน</span></article>
        <article className="report-metric eer-report-metric"><span className="report-metric-icon"><ActivityIcon size={18} /></span><small>ประมาณการ EER</small><strong>{totals.eer === null ? '—' : `${nfmt(totals.eer)} kcal`}</strong><span>{eer === null ? 'ตั้งค่าโปรไฟล์ได้ใน Settings' : `เฉลี่ย ${nfmt(eer)} kcal/วัน`}</span></article>
        <article className="report-metric diff-report-metric"><span className="report-metric-icon"><ArrowDownRight size={18} /></span><small>อาหารเทียบ EER โดยประมาณ</small><strong>{totals.diff === null ? '—' : `${totals.diff > 0 ? '+' : ''}${nfmt(totals.diff)} kcal`}</strong><span>{totals.diff === null ? 'ต้องมีโปรไฟล์ EER ก่อน' : 'อาหาร − EER · ไม่รวมกิจกรรมซ้ำ'}</span></article>
        <article className="report-metric workout-report-metric"><span className="report-metric-icon"><Flame size={18} /></span><small>กิจกรรมที่บันทึก</small><strong>{nfmt(totals.workout)} <em>kcal</em></strong><span><Footprints size={13} /> {nfmt(totals.distance, 2)} กม. รวมระยะทาง</span></article>
      </section>
      <section className="report-overview-grid"><article className="report-overview-card"><div className="report-card-heading"><div><span className="section-index">DAILY OVERVIEW</span><h2>แนวโน้มรายวัน</h2></div><span className="report-period-tag">{days} วัน</span></div><p className="report-chart-legend"><i /> รับเข้าจากอาหาร <i className="workout-legend" /> กิจกรรมที่บันทึก</p><p className="report-chart-note">แท่งแสดงพลังงานรายวัน (kcal) · เปรียบเทียบอาหารและกิจกรรมแยกกัน</p><div className="report-chart-layout" role="img" aria-labelledby="report-chart-title" aria-describedby="report-chart-description"><span id="report-chart-title" className="sr-only">แนวโน้มพลังงานอาหารและกิจกรรมรายวัน</span><span id="report-chart-description" className="sr-only">กราฟแท่งกลุ่มแสดงกิโลแคลอรีรายวัน โดยอาหารและกิจกรรมใช้สเกลเดียวกันและแสดงแยกกัน</span><div className="report-chart-axis" aria-hidden="true">{chartTicks.map((tick, index) => <span key={index}>{nfmt(tick)}</span>)}</div><div className="report-chart" aria-hidden="true" style={{ '--chart-steps': chartTicks.length - 1 } as React.CSSProperties}>{trend.map(item => <div className="report-chart-day" key={item.day} title={`${item.day}: รับเข้า ${nfmt(item.intake)} kcal · กิจกรรม ${nfmt(item.workout)} kcal`}><div className="report-bars"><span className="intake-bar" style={{ height: `${item.intake ? Math.max(2, item.intake / chartMax * 100) : 0}%` }} /><span className="workout-bar" style={{ height: `${item.workout ? Math.max(2, item.workout / chartMax * 100) : 0}%` }} /></div><small>{new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(new Date(`${item.day}T12:00:00`))}</small></div>)}</div></div><div className="report-chart-foot"><span>อาหารเฉลี่ย <b>{nfmt(days ? totals.intake / days : 0)}</b> kcal/วัน</span><span>กิจกรรมเฉลี่ย <b>{nfmt(days ? totals.workout / days : 0)}</b> kcal/วัน</span></div></article>
        <article className="report-overview-card report-breakdown"><div className="report-card-heading"><div><span className="section-index">PERIOD SUMMARY</span><h2>ยอดรวมและเฉลี่ยต่อวัน</h2></div></div><div className="report-summary-row"><span><Utensils size={15} />อาหารที่รับเข้า</span><strong>{nfmt(totals.intake)} <small>รวม</small><i>{nfmt(days ? totals.intake / days : 0)} / วัน</i></strong></div><div className="report-summary-row"><span><ActivityIcon size={15} />EER โดยประมาณ</span><strong>{totals.eer === null ? '—' : nfmt(totals.eer)} <small>รวม</small><i>{eer === null ? '—' : `${nfmt(eer)} / วัน`}</i></strong></div><div className="report-summary-row"><span><ArrowUpRight size={15} />อาหาร − EER</span><strong>{totals.diff === null ? '—' : `${totals.diff > 0 ? '+' : ''}${nfmt(totals.diff)}`} <small>รวม</small><i>{totals.diff === null ? '—' : `${totals.diff > 0 ? '+' : ''}${nfmt(days ? totals.diff / days : 0)} / วัน`}</i></strong></div><div className="report-summary-row"><span><Flame size={15} />กิจกรรมแคลอรี</span><strong>{nfmt(totals.workout)} <small>รวม</small><i>{nfmt(days ? totals.workout / days : 0)} / วัน</i></strong></div><div className="report-summary-row"><span><Footprints size={15} />ระยะทาง</span><strong>{nfmt(totals.distance, 2)} <small>กม.</small><i>{nfmt(days ? totals.distance / days : 0, 2)} กม./วัน</i></strong></div><p className="estimate-disclaimer"><CircleHelp size={14} />วันไม่มีรายการนับเป็นศูนย์; Workout kcal แสดงแยก ไม่บวก/หักจาก EER หรือส่วนต่าง</p></article></section>
    </>}
    <footer className="dashboard-foot"><span><CircleHelp size={14} /> EER เป็นค่าประมาณจากโปรไฟล์ของคุณ ไม่ใช่คำแนะนำทางการแพทย์</span><span>รายงานนี้เป็นข้อมูลส่วนตัว</span></footer>
  </main>
}

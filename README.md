# กินดี — สมุดอาหารประจำวัน

เว็บแอปภาษาไทยสำหรับบันทึกอาหารและกิจกรรมในแต่ละวัน แสดงแคลอรีรับเข้า แคลอรีที่ผู้ใช้กรอกว่าใช้จากกิจกรรม ระยะทาง และสมดุลสุทธิ ผู้ใช้ล็อกอินด้วยอีเมลเพื่อแยกข้อมูล และตั้งค่า AI provider ของตนเองเพื่อช่วยระบุอาหารจากภาพได้

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 20 ขึ้นไปและ pnpm 10.18.0 จากนั้นคัดลอก `.env.example` เป็น `.env.local` แล้วตั้งค่า Supabase หากยังไม่ตั้ง Supabase แอปจะเปิดโหมดตัวอย่างและเก็บข้อมูลใน browser เครื่องนั้นเท่านั้น

```bash
pnpm install
pnpm dev
```

Vite เปิดที่ `http://localhost:3000` โหมดนี้ใช้ทดสอบหน้าเว็บและข้อมูลตัวอย่าง; Vercel Functions สำหรับทดสอบ provider และวิเคราะห์รูปทำงานเมื่อใช้ `vercel dev` หรือ production deployment

## ตั้งค่า Supabase และล็อกอิน

สำหรับ Supabase project ใหม่ ให้รัน `supabase/schema.sql` ใน SQL Editor ไฟล์นี้สร้างตาราง `food_entries`, `exercise_entries` และ `user_ai_settings`, เปิด Row Level Security และสร้าง bucket `food-photos` แบบ private พร้อม policies ที่จำกัดข้อมูลและรูปไว้เฉพาะบัญชีเจ้าของ สำหรับ project ที่มีตารางอาหาร/กิจกรรมอยู่แล้ว ให้รัน migration ใหม่จาก `supabase/migrations/20261118_100000_user_ai_settings.sql` เพื่อเพิ่มเฉพาะ AI settings

เปิด Email OTP ใน Supabase Auth แล้วตั้ง URL และ publishable/anon key ใน environment:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

ค่าทั้งสองใช้ใน browser ได้ตามรูปแบบ public key ของ Supabase; ห้ามใส่ `service_role` key ในแอปหรือ environment ที่ขึ้นต้น `VITE_` แอปส่งลิงก์ทางอีเมลเพื่อเข้าสู่ระบบ และใช้ RLS แยกข้อมูลอาหาร กิจกรรม รูปภาพ และการตั้งค่า AI ระหว่างบัญชี

ใน Supabase Auth > URL Configuration ให้เพิ่ม production URL ของ Vercel ใน Site URL/Redirect URLs เพื่อให้ Email OTP กลับมาที่แอปได้ เช่น `https://gin-dee-calorie-tracker.vercel.app` และ URL Preview ที่ต้องการใช้งาน

## ตั้งค่า AI ในหน้าแอป

หลังล็อกอิน เปิดเมนู **ตั้งค่า AI** เลือก Gemini หรือ OpenAI-compatible แล้วกรอก API key และชื่อ model; สำหรับ OpenAI-compatible provider ให้กรอก HTTPS Base URL เพิ่มด้วย ปุ่ม **ทดสอบการเชื่อมต่อ** จะเรียกผู้ให้บริการจริงและแสดงผลสำเร็จหรือข้อความที่ช่วยตรวจ key, model หรือ endpoint ได้ คีย์อาจถูกส่งไปยัง provider ระหว่างการทดสอบและวิเคราะห์รูป จึงควรใช้ key ที่ผู้ใช้เป็นเจ้าของ และการเรียกใช้อาจมีค่าใช้จ่ายตามผู้ให้บริการ

Gemini ใช้ endpoint OpenAI-compatible ของ Google อัตโนมัติ โดยค่าเริ่มต้นเป็น model `gemini-3.8-flash` ซึ่งมี input แบบภาพให้ใช้กับ Chat Completions ได้ ดู [รายการโมเดล Gemini ทางการ](https://aistudio.google.com/docs/models), [เอกสาร OpenAI compatibility](https://aistudio.google.com/docs/openai) และ [สร้าง Gemini API key](https://aistudio.google.com/apikey)

OpenAI-compatible ใช้ endpoint ที่ผู้ใช้ระบุและ model ที่ provider นั้นรองรับทั้ง Chat Completions และ image input; Base URL ต้องเป็น HTTPS สาธารณะ และไม่ต้องต่อ `/chat/completions` เอง การตั้งค่าถูกแยกเป็นหนึ่งแถวต่อผู้ใช้ด้วย Supabase RLS; key ที่บันทึกแล้วจะไม่ถูกดึงกลับมาแสดงในหน้า Settings, ไม่เก็บใน localStorage หรือ bundle ของเว็บ และ API ฝั่ง server ตรวจ session ก่อนใช้เฉพาะค่าของผู้ใช้ที่ล็อกอิน ระบบไม่ใช้ Supabase `service_role` key

ขอบเขตความปลอดภัย: RLS ป้องกันไม่ให้ผู้ใช้อื่นอ่านหรือแก้ไขแถวของคุณ แต่ key ยังเป็นค่าที่จัดเก็บในฐานข้อมูลของโปรเจกต์; เจ้าของ/ผู้ดูแล Supabase ที่มีสิทธิ์ฐานข้อมูลอาจเข้าถึงได้ อย่าใส่ credential ที่ไม่ต้องการให้ผู้ดูแลโปรเจกต์เห็น และลบ key ได้จากหน้า Settings

ถ้ายังไม่มี API key ผู้ใช้ยังบันทึกชื่ออาหารและแคลอรีด้วยตนเองได้ ผล AI จากภาพเป็นค่าประเมิน อาจไม่เห็นส่วนผสม น้ำมัน ขนาดเสิร์ฟ หรือวิธีปรุง จึงควรตรวจและแก้ก่อนบันทึก

## Deploy ไป Vercel

โปรเจกต์เชื่อม GitHub repository สำหรับ Vercel แล้ว ให้ push commit ไป branch `main` เพื่อให้ Vercel เริ่ม deploy จาก Git integration ใช้ Framework Preset `Vite`, Build Command `corepack pnpm install --frozen-lockfile && corepack pnpm build`, Output Directory `dist`; `vercel.json` ตั้งค่า SPA fallback ให้แล้ว

ตั้ง `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ใน Project Settings > Environment Variables ของ Vercel แล้ว redeploy; ไม่ต้องตั้ง global AI API key ใน Vercel เพราะผู้ใช้ตั้ง key แยกในหน้า Settings ของบัญชีตนเอง

ไฟล์ใน `api/` ให้ Vercel route ใต้ `/api/...` อัตโนมัติ ส่วน SPA rewrite ส่งหน้าหลักไป `index.html`; ดู [Vercel Rewrites](https://vercel.com/docs/routing/rewrites) และ [Vercel Functions](https://vercel.com/docs/functions) เพิ่มเติม

อย่า commit `.env.local` หรือ API keys; มี `.gitignore` สำหรับไฟล์ environment อยู่แล้ว

## วิธีคำนวณ

แคลอรีรับเข้าคือผลรวมแคลอรีจากอาหารที่บันทึกในวันที่เลือก ส่วนแคลอรีที่ใช้ไปคือผลรวมการเผาผลาญจากกิจกรรมที่ผู้ใช้กรอก สมดุลสุทธิที่แสดงคือแคลอรีอาหารลบแคลอรีกิจกรรม และระยะทางคือผลรวมกิโลเมตรที่กรอกไว้ ตัวเลข “เผาผลาญ” ในแอปไม่ได้รวมพลังงานพื้นฐานของร่างกาย (BMR/TDEE) เพราะแอปยังไม่มีข้อมูลร่างกายและไม่ได้คำนวณค่าดังกล่าว

## โครงสร้างสำคัญ

- `src/App.tsx`, `src/components/AISettings.tsx`, `src/styles.css`: dashboard, authentication และหน้า Settings
- `src/lib/supabase.ts`, `src/lib/foodPhotos.ts`: client และ private photo storage
- `server/ai.ts`: ตรวจ session, RLS lookup, validation และเรียก AI provider
- `api/analyze-food.ts`, `api/test-ai.ts`: Vercel Functions สำหรับวิเคราะห์ภาพและทดสอบการเชื่อมต่อ
- `supabase/schema.sql`, `supabase/migrations/`: schema, RLS และ storage policies
- `plan.md`, `TODO.md`: แผนและผลลัพธ์งานที่ยืนยัน

# กินดี — สมุดอาหารประจำวัน

เว็บแอปภาษาไทยสำหรับบันทึกอาหารและกิจกรรมในแต่ละวัน แสดงแคลอรีรับเข้า แคลอรีที่ผู้ใช้กรอกว่าใช้จากกิจกรรม ระยะทาง และสมดุลสุทธิ ผู้ใช้เข้าสู่ระบบด้วย Google (Gmail) ผ่าน Supabase OAuth และตั้งค่า AI provider ของตนเองเพื่อช่วยประเมินอาหารจากภาพได้

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 20 ขึ้นไปและ pnpm 10.18.0 จากนั้นคัดลอก `.env.example` เป็น `.env.local` แล้วตั้งค่า Supabase หากยังไม่ตั้ง Supabase แอปจะเปิดโหมดตัวอย่างและเก็บข้อมูลใน browser เครื่องนั้นเท่านั้น

```bash
pnpm install
pnpm dev
```

Vite เปิดที่ `http://localhost:3000` โหมดนี้ใช้ทดสอบหน้าเว็บและข้อมูลตัวอย่าง; Vercel Functions สำหรับทดสอบ provider และวิเคราะห์รูปทำงานเมื่อใช้ `vercel dev` หรือ production deployment

## ตั้งค่า Supabase

สำหรับ Supabase project ใหม่ ให้รัน `supabase/schema.sql` ใน SQL Editor ไฟล์นี้สร้างตาราง `food_entries`, `exercise_entries` และ `user_ai_settings`, เปิด Row Level Security และสร้าง bucket `food-photos` แบบ private พร้อม policies ที่จำกัดข้อมูลและรูปไว้เฉพาะบัญชีเจ้าของ สำหรับ project ที่มีตารางอาหาร/กิจกรรมอยู่แล้ว ให้รัน migration `supabase/migrations/20261118_100000_user_ai_settings.sql` เพื่อเพิ่มเฉพาะ AI settings

ตั้ง URL และ publishable/anon key ใน environment ของ Vercel และ `.env.local`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

ค่าทั้งสองใช้ใน browser ได้ตามรูปแบบ public key ของ Supabase; ห้ามใส่ `service_role` key ในแอปหรือ environment ที่ขึ้นต้น `VITE_` ตารางข้อมูลอาหาร กิจกรรม รูปภาพ และ AI settings ใช้ RLS แยกตามบัญชี

## เปิด Google Sign-In (ทำครั้งเดียว)

การเข้าสู่ระบบในหน้าแอปใช้ Google OAuth ไม่ส่ง Magic Link หรือ Email OTP จึงไม่ใช้โควตาส่งอีเมลของ Supabase Auth ขั้นตอนนี้ต้องเปิด Google provider ใน Supabase ก่อน ปุ่มจะยังล็อกอินไม่ได้จนกว่าจะตั้งค่าครบ

1. ใน [Google Auth Platform](https://console.cloud.google.com/auth/overview) เลือกหรือสร้าง Google Cloud project แล้วสร้าง OAuth Client ID ชนิด **Web application**.
2. เพิ่ม **Authorized JavaScript origins**:
   - Production: `https://gin-dee-calorie-tracker.vercel.app`
   - Local development (ถ้าต้องใช้): `http://localhost:3000`
3. เพิ่ม **Authorized redirect URI** เป็น Supabase callback ของโปรเจกต์นี้: `https://tloenjfdzsjhrraaqlcy.supabase.co/auth/v1/callback`.
4. ใน Supabase Dashboard ไปที่ **Authentication → Sign In / Providers → Google**, เปิด Google provider แล้วใส่ OAuth Client ID และ Client Secret.
5. ใน Supabase Dashboard ไปที่ **Authentication → URL Configuration** ตั้ง Site URL เป็น `https://gin-dee-calorie-tracker.vercel.app` และเพิ่ม URL นี้ใน Redirect URLs; เพิ่ม `http://localhost:3000` เฉพาะเมื่อทดสอบ local.
6. หาก OAuth consent screen ยังอยู่ในสถานะ Testing ให้เพิ่ม Gmail ที่จะใช้ใน **Test users** ของ Google Auth Platform.

เก็บ Google Client Secret ไว้ในหน้า Google provider ของ Supabase เท่านั้น **อย่า commit ลง Git และอย่าใส่ใน Vercel**; Git ใช้ deploy โค้ดแอป ส่วน Google OAuth provider เป็นค่าลับฝั่ง Supabase. แอปใช้ข้อมูลพื้นฐาน `openid`, อีเมล และโปรไฟล์เท่านั้น ไม่อ่านหรือส่งอีเมลในกล่อง Gmail. Supabase รองรับการเชื่อม identity อัตโนมัติเมื่ออีเมลที่ยืนยันแล้วตรงกัน ดังนั้นให้เลือก Gmail เดียวกับบัญชีเดิมเพื่อเข้าถึงข้อมูลชุดเดิม ([รายละเอียด identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)).

อ้างอิง: [Supabase Sign in with Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) และ [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

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

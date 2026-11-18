# กินดี — สมุดอาหารประจำวัน

เว็บแอปภาษาไทยสำหรับบันทึกอาหารและกิจกรรมในแต่ละวัน มีหน้าแดชบอร์ดแสดงแคลอรีรับเข้า แคลอรีจากกิจกรรม ระยะทาง และสมดุลสุทธิ พร้อมอัปโหลดรูปอาหารให้ AI ช่วยระบุชื่อและประเมินแคลอรีก่อนผู้ใช้ยืนยัน

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 20 ขึ้นไปและ pnpm 10.18.0 จากนั้นคัดลอก `.env.example` เป็น `.env.local` แล้วตั้งค่าที่ต้องใช้ (ถ้ายังไม่ตั้ง Supabase แอปจะเปิดโหมดตัวอย่างและเก็บข้อมูลใน browser เครื่องนั้นเท่านั้น)

```bash
pnpm install
pnpm dev
```

Vite เปิดที่ `http://localhost:3000` โหมดนี้ใช้ทดสอบหน้าเว็บและบันทึกตัวอย่าง; Vercel Function สำหรับ AI ทำงานเมื่อใช้ Vercel deployment หรือ `vercel dev`

## ตั้งค่า Supabase

สร้าง Supabase project แล้วรัน `supabase/schema.sql` ใน SQL Editor ของโปรเจกต์ ไฟล์นี้สร้างตาราง `food_entries` และ `exercise_entries`, เปิด Row Level Security และสร้าง bucket `food-photos` แบบ private พร้อม policies ที่จำกัดข้อมูลและรูปไว้เฉพาะบัญชีเจ้าของ

เปิด Email OTP ใน Supabase Auth แล้วตั้งค่า URL และ publishable/anon key ใน environment:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

ค่าทั้งสองตัวใช้ใน browser ได้ตามรูปแบบ public key ของ Supabase; ห้ามใส่ `service_role` key ในแอปหรือ environment ที่ขึ้นต้น `VITE_` แอปจะส่งลิงก์ทางอีเมลสำหรับเข้าสู่ระบบ และใช้ RLS ปกป้องข้อมูลแยกตามบัญชี

## เลือกผู้ให้บริการ AI สำหรับวิเคราะห์รูป

การวิเคราะห์ทำงานใน `api/analyze-food.ts` ฝั่ง server จึงไม่ส่ง API key ไปยัง browser ตั้งค่า provider และ key เฉพาะใน Environment Variables ฝั่ง Vercel (หรือ `.env.local` สำหรับ `vercel dev`):

```env
AI_PROVIDER=gemini
AI_API_KEY=<Gemini API key>
AI_MODEL=gemini-3.8-flash
```

Gemini ใช้ Gemini API ผ่าน OpenAI compatibility endpoint ของ Google และรับภาพในคำขอ Chat Completions ได้ [เอกสาร Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) หากต้องการใช้ provider อื่นที่รองรับ OpenAI-compatible Chat Completions ให้เปลี่ยนค่าดังนี้:

```env
AI_PROVIDER=openai-compatible
AI_API_KEY=<provider API key>
AI_BASE_URL=https://<provider-endpoint>/v1
AI_MODEL=<vision model name>
```

`AI_BASE_URL` จะใช้ค่า OpenAI API เป็นค่าเริ่มต้นเมื่อไม่ระบุ หากใช้ endpoint อื่นให้ตั้งเป็น base URL ที่ provider แจ้งมาและเลือกโมเดลที่รองรับภาพ คีย์ต้องไม่ขึ้นต้น `VITE_` และห้ามใส่ใน source code

หากไม่มี AI key ให้ปล่อย `AI_API_KEY` ว่าง แอปยังรับภาพและให้กรอกชื่อ/แคลอรีด้วยตัวเองได้ เมื่อเปิด AI แล้วผลลัพธ์ยังเป็นเพียงการประเมินจากภาพ อาจไม่เห็นส่วนผสม น้ำมัน ขนาดเสิร์ฟ หรือวิธีปรุง ผู้ใช้จึงควรตรวจและแก้ไขก่อนบันทึก

## Deploy ไป Vercel

1. Push โปรเจกต์ไป GitHub แล้วเลือก **Add New Project** ใน Vercel เพื่อ import repository
2. ใช้ Framework Preset `Vite`, Build Command `pnpm build`, Output Directory `dist`; `vercel.json` ตั้งค่า SPA rewrite ให้แล้ว
3. ตั้ง `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ใน Project Settings > Environment Variables หากต้องการใช้ AI ให้เพิ่ม `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` และ `AI_BASE_URL` ตาม provider ที่เลือก
4. Deploy แล้วเพิ่ม URL ของเว็บใน Supabase Auth > URL Configuration > Site URL และ Redirect URLs เพื่อให้ลิงก์ Email OTP กลับมาที่แอปได้

อย่า commit `.env.local` หรือ API keys; มี `.gitignore` สำหรับไฟล์ environment อยู่แล้ว

## วิธีคำนวณ

แคลอรีรับเข้าคือผลรวมแคลอรีจากอาหารที่บันทึกในวันที่เลือก ส่วนแคลอรีที่ใช้ไปคือผลรวมการเผาผลาญจากกิจกรรมที่ผู้ใช้กรอก สมดุลสุทธิที่แสดงคือแคลอรีอาหารลบแคลอรีกิจกรรม และระยะทางคือผลรวมกิโลเมตรที่กรอกไว้ ตัวเลข “เผาผลาญ” ในแอปไม่ได้รวมพลังงานพื้นฐานของร่างกาย (BMR/TDEE) เพราะแอปยังไม่มีข้อมูลร่างกายและไม่ได้คำนวณค่าดังกล่าว

## โครงสร้างสำคัญ

- `src/App.tsx`, `src/styles.css`: หน้าจอ dashboard และ interaction
- `src/lib/supabase.ts`, `src/lib/foodPhotos.ts`: client และ private photo storage
- `api/analyze-food.ts`: Vercel Function ที่เลือก Gemini หรือ OpenAI-compatible provider ได้
- `supabase/schema.sql`: schema, RLS และ storage policies
- `plan.md`, `TODO.md`: แผนและผลลัพธ์งานที่ยืนยัน

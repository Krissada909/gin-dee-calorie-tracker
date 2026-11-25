# แผน implementation — กินดี

## ขอบเขตและสถาปัตยกรรม
สร้างเว็บแอปภาษาไทย responsive สำหรับติดตามอาหารและการออกกำลังกายในแต่ละวัน รายการอาหารมีวันที่ เวลา ประเภทมื้อ ชื่ออาหาร แคลอรี และภาพ; ผู้ใช้ถ่าย/อัปโหลดภาพ ให้ AI ช่วยระบุอาหารและประเมินแคลอรีได้ แล้วตรวจแก้ก่อนบันทึก ข้อมูลจริงแยกตามบัญชีผ่าน Supabase Auth, Postgres และ private Supabase Storage พร้อม Row Level Security policies

หน้าเว็บใช้ Vite + React + TypeScript และ Supabase client; Vercel Serverless Functions วิเคราะห์ภาพและทดสอบ AI provider เปลี่ยน primary sign-in เป็น Google OAuth ผ่าน `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })` เพื่อไม่ต้องส่ง email OTP. Supabase provider ต้องเปิดใช้งานด้วย Google OAuth Client ID/Secret ใน Supabase Auth; secret ไม่ใส่ใน Git หรือ Vercel. โฟลว์เว็บ redirect กลับ origin ที่ผู้ใช้เริ่มล็อกอิน และใช้ Supabase automatic identity linking เมื่อ email ที่ยืนยันแล้วตรงกัน เพื่อคง user ID/RLS เดิม. ดู [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) และ [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)

ตั้ง Google Cloud OAuth client เป็น Web application; Authorized JavaScript origin คือ `https://gin-dee-calorie-tracker.vercel.app` (เพิ่ม `http://localhost:3000` เฉพาะทดสอบ local), Authorized redirect URI คือ Supabase callback `https://tloenjfdzsjhrraaqlcy.supabase.co/auth/v1/callback`. เพิ่ม Vercel origin ใน Supabase Auth Site URL/Redirect allowlist ด้วย; Google scopes จำกัดไว้ที่ `openid`, email และ profile จึงไม่ให้แอปอ่าน Gmail inbox

เพิ่ม `user_ai_settings` หนึ่งแถวต่อบัญชี เพื่อเก็บ provider (`gemini` หรือ `openai-compatible`), API key, base URL ที่เลือกได้ และ model. หน้า Settings อ่านเฉพาะ metadata ไม่ดึง key กลับมาแสดง; key ไม่อยู่ใน Vite bundle หรือ localStorage. การบันทึก key ใช้ Supabase Auth + RLS; Serverless Function ตรวจ bearer token แล้วอ่านเฉพาะ settings ของ user เดียวกันด้วย publishable key และ RLS โดยไม่ใช้ service_role. ปุ่ม Test connection ส่งค่าที่ผู้ใช้กำลังกรอกไปยัง server endpoint ผ่าน HTTPS เพื่อเรียก provider จริง และตอบกลับเฉพาะผลผ่าน/ไม่ผ่านโดยไม่ echo หรือ log key; หากไม่ใส่ key ใหม่สามารถทดสอบค่าที่บันทึกไว้ได้

`/api/analyze-food` ใช้ provider settings ของบัญชีที่ล็อกอินเท่านั้น และส่งรูปให้โมเดลภาพก่อนคืนชื่อ/แคลอรี/portion/note สำหรับผู้ใช้ตรวจแก้ก่อนบันทึก หากไม่มี settings จะแจ้งให้ตั้งค่าหรือกรอกเอง Endpoint ของ OpenAI-compatible รับเฉพาะ HTTPS base URL; resolver ตรวจและ pin DNS lookup ตอนเชื่อมต่อ, ปฏิเสธคำตอบ private/loopback IP, จำกัดเวลา/ขนาด response และไม่ตาม redirect เพื่อป้องกัน SSRF และไม่ส่ง API key ไปยัง origin อื่น; Gemini ใช้ `https://generativelanguage.googleapis.com/v1beta/openai` และค่าเริ่มต้น `gemini-3.8-flash` ที่ตรวจจาก [รายการโมเดลทางการของ Google](https://aistudio.google.com/docs/models) และ [OpenAI compatibility](https://aistudio.google.com/docs/openai)

ค่าฝั่ง browser ที่ต้องตั้งใน Vercel มี `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` เท่านั้นสำหรับ Supabase client; ไม่ต้องมี global AI key ใน Vercel เพราะผู้ใช้แต่ละคนบันทึก key ของตนใน Settings. แอปกำหนดให้ผู้ใช้เข้าสู่ระบบด้วย Google ผ่าน Supabase ก่อนใช้งาน; ไม่มีโหมดตัวอย่างหรือการบันทึกข้อมูลส่วนตัวแบบ local-only. คง `vercel.json`, SQL migrations และคู่มือการตั้งค่าให้พร้อม deploy

การคำนวณ: แคลอรีอาหารรวมต่อวันคือผลรวมอาหาร; พลังงานจากกิจกรรมคือผลรวมแคลอรีที่ผู้ใช้กรอก; สมดุลสุทธิเดิม = พลังงานอาหาร − พลังงานกิจกรรม. เพิ่มโปรไฟล์ประมาณการพลังงานรายวันแบบสมัครใจ (อายุ 19+, sex category สำหรับสูตรชาย/หญิง, ส่วนสูง, น้ำหนัก และระดับกิจกรรม) คำนวณ EER ตามสมการผู้ใหญ่อายุ 19+ ใน National Academies 2023 Table S-3 และแสดงเป็นค่าประมาณเท่านั้น; ถือ EER ≈ TEE เมื่อคงน้ำหนัก ไม่ใช่คำแนะนำทางการแพทย์. ไม่บวก/หักแคลอรีกิจกรรมจาก/เข้า EER เนื่องจากกิจกรรมถูกรวมในระดับกิจกรรมของสูตรแล้ว. ไม่เหมาะสำหรับอายุต่ำกว่า 19 ปี ผู้ตั้งครรภ์ หรือให้นมบุตร ตามข้อจำกัดของ NIDDK planner. ข้อมูลโปรไฟล์อยู่ในตารางต่อ auth.users พร้อม RLS owner-only; ต้องเข้าสู่ระบบเพื่ออ่านหรือบันทึกโปรไฟล์ และแบบฟอร์มเริ่มว่างเพื่อไม่ใส่ข้อมูลส่วนบุคคลแทนผู้ใช้.

ย้ายโปรไฟล์ EER ส่วนตัวออกจาก dashboard ไปหน้า Settings โดยวางต่อจากการตั้งค่า AI และคงฟอร์มบันทึก/ลบโปรไฟล์ไว้. เพิ่มเมนูและหน้า “รายงาน” แยกสำหรับช่วงวันแบบ weekly/custom: เลือกสัปดาห์ปัจจุบันเป็น preset หรือวันที่เริ่ม/สิ้นสุดเอง; รวมวันปฏิทินทั้งช่วงแบบ inclusive และคำนวณค่าเฉลี่ยต่อวันโดยนับวันที่ไม่มีรายการเป็นศูนย์. แสดง dashboard ผู้บริหารที่สแกนง่าย: intake, EER, difference (intake − EER), workout kcal, ระยะทาง และแนวโน้มรายวัน; รายงานแยก query ช่วงวันที่เอง ไม่ใช้ข้อมูล selected day ที่ dashboard โหลดอยู่. แสดงสถานะชัดเมื่อยังไม่ได้ตั้งค่าโปรไฟล์ EER และไม่แสดงส่วนต่างเสมือนเป็นค่าพลังงานสุทธิหรือหัก workout ซ้ำ. Workout kcal แสดงแยก ไม่หักออกจาก EER/difference.

## โครงสร้างโปรเจกต์
- `src/`: UI dashboard, navigation ระหว่างภาพรวม/รายงาน/Settings, forms, responsive styles, helpers และ Supabase client
- `src/components/AISettings.tsx`: Settings page เลือก provider, กรอก model/base URL/key, บันทึกและทดสอบต่อบัญชี; EER profile อยู่ใน Settings เช่นกัน
- `src/components/EnergyReport.tsx`: EER profile form สำหรับ Settings และ executive report dashboard แยกหน้า พร้อม query ช่วงวันแบบ inclusive/paginated
- `server/ai.ts`: ตรวจ bearer token, อ่าน settings ของผู้ใช้ผ่าน RLS, ตรวจ endpoint และเรียก provider โดยไม่บันทึก key ลง log
- `api/analyze-food.ts`: Vercel Function สำหรับ vision estimation ด้วย settings ของบัญชีที่ล็อกอิน
- `api/test-ai.ts`: Vercel Function ทดสอบ key/provider ที่กรอกหรือ settings ที่บันทึกแล้ว
- `supabase/schema.sql`, `supabase/migrations/`: ตารางอาหาร/กิจกรรม/AI settings/energy profile, indexes, RLS และ private storage policies
- `public/manus-routes.json`, `public/brand.svg`, `app.config.ts`: route manifest และ branding
- `.env.example`, `vercel.json`, `README.md`: environment template, routing และคู่มือ local/Supabase/Vercel

## Design — สมุดอาหารหมึกคราม (เลือกยืนยันแล้ว)
- **Design Movement:** สมุดบันทึกสุขภาพร่วมสมัยที่ผสานความเป็น editorial กับ dashboard อ่อนโยน
- **Core Principles:** ข้อมูลอ่านง่ายก่อนตกแต่ง; แต่ละมื้อรู้สึกเป็นบันทึกส่วนตัว; ตัวเลขแคลอรีมีลำดับชัด; บันทึกภาพ/กิจกรรมได้เร็วบนมือถือ
- **Color Philosophy:** พื้นครีมอุ่นและกระดาษขาวนวลช่วยให้อาหารเด่น; หมึกคราม `#243B53` ให้ความน่าเชื่อถือ; เหลืองอำพัน `#F2C14E` เน้นพลังงานและการลงมือทำ; สีเขียวสงวนไว้สำหรับสัญญาณกิจกรรม
- **Layout Paradigm:** dashboard แบบบันทึกแนวตั้ง มีสรุปพลังงานรายวันด้านบนและ timeline มื้อ/กิจกรรมด้านล่าง; รายงานเป็นหน้า executive overview แยกด้วย metric cards และแนวโน้มรายวัน; Settings รวมการตั้งค่า AI และโปรไฟล์ EER ส่วนตัวในกรอบกระดาษเดียวกับ dashboard และเป็น bottom-friendly บนมือถือ
- **Signature Elements:** ตัวเลขพลังงานแบบหมึกพิมพ์ขนาดใหญ่; เส้นคั่นบางและป้ายเวลาแบบ margin note; สัญลักษณ์ช้อนลายเส้นสำหรับแบรนด์
- **Interaction Philosophy:** เพิ่มอาหารจากภาพแล้วทบทวนค่าประเมิน; ยอดอัปเดตทันที; สถานะทดสอบ AI ชัดเจนและไม่เปิดเผย key; ผู้ใช้แก้ไขและลบรายการได้สะดวก
- **Animation:** transition 160–220ms ของ sheet และการอัปเดตยอด; เคารพ `prefers-reduced-motion`; ไม่มีการเคลื่อนไหวรบกวนการอ่าน
- **Typography System:** IBM Plex Sans Thai สำหรับภาษาไทย; hierarchy 12/14/16/24/32px; ตัวเลข tabular สำหรับแคลอรี/ระยะทาง
- **Brand Essence:** สมุดบันทึกอาหารสำหรับคนที่อยากเข้าใจพลังงานจากสิ่งที่กินและกิจกรรม โดยบันทึกได้ง่ายและไม่ตัดสิน — สงบ, เป็นมิตร, ชัดเจน
- **Brand Voice:** สุภาพ สั้น ไม่กดดัน; ตัวอย่าง “วันนี้คุณกินไปเท่าไรแล้ว” และ “ค่าจากภาพเป็นการประเมิน ลองตรวจสอบก่อนบันทึกนะ”
- **Wordmark & Logo:** ชื่อ “กินดี” คู่สัญลักษณ์ช้อนเส้นเดียวกับบรรทัดสมุด
- **Signature Brand Color:** Ink navy `#243B53`

# แผน implementation — กินดี

## ขอบเขตและสถาปัตยกรรม
สร้างเว็บแอปภาษาไทย responsive สำหรับติดตามอาหารและการออกกำลังกายในแต่ละวัน รายการอาหารมีวันที่ เวลา ประเภทมื้อ ชื่ออาหาร แคลอรี และภาพ; ผู้ใช้ถ่าย/อัปโหลดภาพ ให้ AI ช่วยระบุอาหารและประเมินแคลอรีได้ แล้วตรวจแก้ก่อนบันทึก ข้อมูลจริงแยกตามบัญชีผ่าน Supabase Auth, Postgres และ private Supabase Storage พร้อม SQL schema และ Row Level Security policies

หน้าเว็บใช้ Vite + React + TypeScript และ Supabase client; เสิร์ฟ API วิเคราะห์รูปจาก Vercel Serverless Function เพื่อไม่ให้ API key อยู่ใน browser/source. `AI_PROVIDER=gemini` ใช้ Gemini API ผ่าน Google OpenAI compatibility endpoint; `AI_PROVIDER=openai-compatible` ใช้บริการอื่นที่รองรับ Chat Completions และปรับ `AI_BASE_URL`, `AI_MODEL` ได้ คีย์ใช้ `AI_API_KEY` ฝั่ง server เท่านั้น หากยังไม่มีคีย์ ระบบบันทึก/กรอกข้อมูลเองได้และแจ้งว่าการวิเคราะห์ AI ยังไม่พร้อม

ค่าตั้งค่า Supabase ฝั่ง browser คือ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` (publishable/anon; ไม่ใช้ service_role) โดย RLS จำกัดข้อมูลของผู้ใช้แต่ละบัญชี มีโหมดตัวอย่าง local-only เมื่อยังไม่ตั้งค่า Supabase และมี `.env.example`, คู่มือตั้งค่า และ `vercel.json` สำหรับเตรียม deploy บน Vercel

การคำนวณ: แคลอรีอาหารรวมต่อวันคือผลรวมอาหาร; พลังงานจากกิจกรรมคือผลรวมแคลอรีที่ผู้ใช้กรอก; สมดุลสุทธิ = พลังงานอาหาร − พลังงานกิจกรรม; ระยะทางรวมเป็นกิโลเมตร ไม่เรียกค่ากิจกรรมว่า TDEE/BMR เพราะยังไม่มีข้อมูลที่จำเป็นสำหรับค่าดังกล่าว

## โครงสร้างโปรเจกต์
- `src/`: UI dashboard, form เพิ่มมื้อ/กิจกรรม, responsive styles, helpers และ Supabase client
- `api/analyze-food.ts`: Vercel Function เลือก Gemini หรือ OpenAI-compatible vision provider
- `supabase/schema.sql`: ตารางอาหาร/กิจกรรม, indexes, RLS และ private storage policies
- `public/manus-routes.json`, `public/brand.svg`, `app.config.ts`: route manifest และ branding
- `.env.example`, `vercel.json`, `README.md`: environment template และคู่มือ local/Supabase/Vercel

## Design — สมุดอาหารหมึกคราม (เลือกยืนยันแล้ว)
- **Design Movement:** สมุดบันทึกสุขภาพร่วมสมัยที่ผสานความเป็น editorial กับ dashboard อ่อนโยน
- **Core Principles:** ข้อมูลอ่านง่ายก่อนตกแต่ง; แต่ละมื้อรู้สึกเป็นบันทึกส่วนตัว; ตัวเลขแคลอรีมีลำดับชัด; บันทึกภาพ/กิจกรรมได้เร็วบนมือถือ
- **Color Philosophy:** พื้นครีมอุ่นและกระดาษขาวนวลช่วยให้อาหารเด่น; หมึกคราม `#243B53` ให้ความน่าเชื่อถือ; เหลืองอำพัน `#F2C14E` เน้นพลังงานและการลงมือทำ; สีเขียวสงวนไว้สำหรับสัญญาณกิจกรรม
- **Layout Paradigm:** dashboard แบบบันทึกแนวตั้ง มีสรุปพลังงานรายวันด้านบนและ timeline มื้อ/กิจกรรมด้านล่าง แผงเพิ่มข้อมูลเป็น modal/bottom sheet ที่เหมาะกับมือถือ
- **Signature Elements:** ตัวเลขพลังงานแบบหมึกพิมพ์ขนาดใหญ่; เส้นคั่นบางและป้ายเวลาแบบ margin note; สัญลักษณ์ช้อนลายเส้นสำหรับแบรนด์
- **Interaction Philosophy:** เพิ่มอาหารจากภาพแล้วทบทวนค่าประเมิน; ยอดอัปเดตทันที; แจ้งชัดเมื่อใช้โหมดตัวอย่างหรือยังไม่มี AI key; แก้ไขและลบรายการได้สะดวก
- **Animation:** transition 160–220ms ของ sheet และการอัปเดตยอด; เคารพ `prefers-reduced-motion`; ไม่มีการเคลื่อนไหวรบกวนการอ่าน
- **Typography System:** IBM Plex Sans Thai สำหรับภาษาไทย; hierarchy 12/14/16/24/32px; ตัวเลข tabular สำหรับแคลอรี/ระยะทาง
- **Brand Essence:** สมุดบันทึกอาหารสำหรับคนที่อยากเข้าใจพลังงานจากสิ่งที่กินและกิจกรรม โดยบันทึกได้ง่ายและไม่ตัดสิน — สงบ, เป็นมิตร, ชัดเจน
- **Brand Voice:** สุภาพ สั้น ไม่กดดัน; ตัวอย่าง “วันนี้คุณกินไปเท่าไรแล้ว” และ “ค่าจากภาพเป็นการประเมิน ลองตรวจสอบก่อนบันทึกนะ”
- **Wordmark & Logo:** ชื่อ “กินดี” คู่สัญลักษณ์ช้อนเส้นเดียวกับบรรทัดสมุด
- **Signature Brand Color:** Ink navy `#243B53`

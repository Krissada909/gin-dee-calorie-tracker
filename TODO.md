# TODO — กินดี

- [x] **ปุ่ม Google OAuth ในแอป:** เปลี่ยนหน้าเข้าสู่ระบบเป็น “เข้าสู่ระบบด้วย Google”; เรียก Supabase OAuth และไม่เรียก Email OTP ในโค้ดหน้าเข้าสู่ระบบ
- [ ] **เปิด Google OAuth ใน Supabase:** สร้าง Google OAuth Web client; ตั้ง Authorized JavaScript origin เป็น Vercel domain และ Supabase callback URI เป็น redirect URI; เปิด Google provider ใน Supabase Auth โดยเก็บ Client ID/Secret ไว้ที่ Supabase เท่านั้น ไม่ใส่ใน Git/Vercel; เพิ่ม Vercel URL ใน Supabase Site URL/Redirect allowlist
- [ ] **ทดสอบล็อกอิน Google จริง:** หลัง provider เปิดใช้งาน ให้ทดสอบเลือก Gmail จนกลับเข้าแอปและยืนยันว่าใช้บัญชีเดิมเมื่อ email ที่ยืนยันแล้วตรงกับบัญชีเดิม; หากยังไม่มี key/provider ให้ใช้กรอกแคลอรีเองต่อได้
- [x] **แยกข้อมูลผู้ใช้:** อาหาร กิจกรรม รูปภาพ และ AI settings ผูกกับ Supabase user ID และใช้ RLS จำกัดสิทธิ์ให้เจ้าของข้อมูลเท่านั้น
- [x] **บันทึกอาหารประจำวัน:** เพิ่มมื้อพร้อมวันที่ เวลา ประเภทมื้อ ชื่อ แคลอรี และรูปไปยัง private Supabase Storage; เมื่อผู้ใช้ตั้งค่า AI แล้ว ให้ AI ประเมินชื่อ/แคลอรีจากรูปและตรวจแก้ก่อนบันทึก; หากยังไม่ตั้งค่า AI ให้กรอกเองได้
- [x] **หน้า Settings AI แยกตามบัญชี:** ผู้ใช้ที่ล็อกอินเลือก Gemini หรือ OpenAI-compatible provider, กรอก API key/model และ Base URL สำหรับ endpoint อื่น; บันทึก แก้ model/provider โดยไม่ต้องกรอก key ซ้ำ แทนที่หรือลบ key ได้; UI ไม่ดึง key กลับมาแสดง และไม่เก็บใน localStorage หรือ Vite bundle
- [x] **Test connection และวิเคราะห์ตามบัญชี:** ปุ่มทดสอบเรียก provider จริงด้วย key ที่กรอกใหม่หรือ key ที่บันทึกไว้และค่าปัจจุบัน; แสดงผลผ่าน/ผิดพลาดโดยไม่เปิดเผย key; `/api/analyze-food` ใช้เฉพาะ AI settings ของบัญชีที่ล็อกอิน
- [ ] **ทดสอบผู้ให้บริการ AI จริง:** ยังไม่มี API key ของผู้ใช้; หลังใส่ key ใน Settings ต้องกดทดสอบและยืนยันสถานะเชื่อมต่อก่อนใช้วิเคราะห์รูปจริง
- [x] **สรุปอาหารรายวันและประวัติ:** แสดงยอดแคลอรีที่รับเข้าจากอาหารรวมรายวันและรายการย้อนหลัง
- [x] **บันทึกการออกกำลังกาย:** เพิ่มกิจกรรมรายวัน โดยกรอกแคลอรีที่เผาผลาญและระยะทางกิโลเมตร
- [x] **สรุปพลังงานรายวัน:** แสดงแคลอรีอาหาร แคลอรีจากกิจกรรม ระยะทาง และสมดุลสุทธิ; ไม่เรียกค่ากิจกรรมนี้ว่า BMR/TDEE
- [x] **Deploy Google sign-in UI:** commit `69c9c32` ถูก deploy ไป Vercel Production สถานะ READY; production domain ตอบ HTTP 200 และ bundle มี Google OAuth flow

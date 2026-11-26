# LINE OA ตอบอัตโนมัติ — NEURO INTERVENTION

โปรเจกต์ Apps Script **แยก** (ไม่เกี่ยวกับเว็บงานรังสีวิทยา) สำหรับ LINE OA

- แชต 1:1 → ตอบอัตโนมัติตามคำค้น (ส่งข้อความ + รูปได้) / ข้อความค่าเริ่มต้น / ข้อความต้อนรับ
- แชตกลุ่ม → ไม่ตอบ (พิมพ์ `#groupid` เพื่อขอ Group ID)
- ส่งต่อข้อความระหว่างกลุ่ม เช่น `#ส่งต่อ ห้อง 2 ขอ sheath 6F` จาก MT Rayong → INR
- Webhook URL ของ LINE = ลิงก์ `/exec`:
  `https://script.google.com/macros/s/AKfycbyEyp9QTJaZ7hNJwwLWmCKqwAUUDNveeP9xGURI7_PKvmPYLl8emmVmV8q_0mMHXqEn/exec`
- **หน้าตั้งค่า: https://forinnovation3010-coder.github.io/radiology-apps/line-oa/**
  (เปิดได้แม้ล็อกอิน Google หลายบัญชี · ไม่มี PIN — ตั้งเพิ่มได้ในหน้า "การเชื่อมต่อ")

## ไฟล์
- `apps-script/Code.gs`, `apps-script/Index.html` → วางในโปรเจกต์ Apps Script "LINE OA Bot" (บัญชี forinnovation3010)
- `index.html` → หน้าตั้งค่าบน GitHub Pages สร้างจาก `apps-script/Index.html` ด้วย `node line-oa/build_page.js`

## ติดตั้ง (ครั้งเดียว)

1. https://script.google.com → **New project** → ตั้งชื่อ `LINE OA Bot`
2. วาง `apps-script/Code.gs` ทับไฟล์ Code.gs → กด ＋ เพิ่มไฟล์ HTML ชื่อ `Index` → วาง `apps-script/Index.html`
3. ⚙️ Project Settings → Script properties → เพิ่ม `LINE_TOKEN` = Channel access token ของ OA
   (**ห้ามใส่ token ในโค้ดหรือใน GitHub** — repo นี้เปิดสาธารณะ)
4. เลือกฟังก์ชัน `lineAuthorize` → Run → อนุญาตสิทธิ์ (สร้างชีต "ข้อมูล LINE OA" + เช็ก token)
5. Deploy → New deployment → Web app — Execute as: **Me**, Who has access: **Anyone**
6. LINE Developers → Messaging API → Webhook URL = ลิงก์ /exec → เปิด Use webhook
7. LINE OA Manager → ตั้งค่าการตอบกลับ → ปิด "ข้อความตอบกลับอัตโนมัติ"
8. พิมพ์ `#groupid` ในกลุ่ม MT Rayong และ INR → เปิดหน้าตั้งค่า → 📨 ส่งต่อข้อความ → เพิ่ม → บันทึก

แก้โค้ดทีหลัง: วางทับ → Deploy → Manage deployments → ✏️ → New version (ลิงก์เดิม)

## รูปที่ให้บอทส่ง

อัปโหลดรูป (JPG/PNG ไม่เกิน 1 MB, ชื่อไฟล์ภาษาอังกฤษ) ไว้ในโฟลเดอร์ `line-oa/images/` แล้วใช้ลิงก์
`https://forinnovation3010-coder.github.io/radiology-apps/line-oa/images/ชื่อไฟล์.jpg`
ใส่ในช่อง "ลิงก์รูป" ของคำตอบ

## โควตาข้อความ

ตอบกลับ (คำตอบตามคำค้น / ต้อนรับ / ค่าเริ่มต้น) **ไม่นับโควตา** · การส่งต่อข้อความและปุ่มทดลองส่งเข้ากลุ่ม **นับโควตา**

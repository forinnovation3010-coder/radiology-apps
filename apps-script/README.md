# โค้ด Apps Script ของเว็บงานรังสีวิทยา (ใบลา + คลัง X-ray)

ไฟล์ในโฟลเดอร์นี้ = สำเนาโค้ดในโปรเจกต์ Apps Script "เว็บงานรังสีวิทยา" (บัญชี forinnovation3010)

- `*.gs`, `Nav.html`, `LeavePage.html`, `XrayPage.html` → วางในโปรเจกต์ Apps Script
- `build_static.js` → สร้างหน้าเว็บใน `../web/` (GitHub Pages) จากไฟล์ HTML ชุดนี้: `node apps-script/build_static.js`

แก้โค้ดแล้วต้องทำ 2 อย่าง: วางโค้ดใน Apps Script + Deploy เวอร์ชันใหม่ (รายการเดิม) และรัน build_static.js แล้ว push
หมายเหตุ: ADMIN_PIN ใน Leave.gs ของจริงตั้งไว้ใน Apps Script — สำเนานี้ใส่ค่าแทนไว้

## LINE OA ตอบอัตโนมัติ (`Line.gs` + `LinePage.html`)
- หน้าตั้งค่า: ลิงก์ /exec ต่อท้าย `?page=line` หรือ GitHub Pages `web/line.html` (ไม่อยู่ในเมนู ☰)
- Webhook URL ของ LINE = ลิงก์ /exec เดียวกับเว็บรวม (doPost ใน Router.gs ส่งต่อให้ `lineWebhook_` เมื่อ body มี `events`)
- ต้องใส่ `LINE_TOKEN` ใน Script properties เอง (ห้ามใส่ในโค้ด เพราะ repo นี้เปิดสาธารณะ) แล้วกด Run `lineAuthorize` 1 ครั้ง
- ข้อมูลเก็บในชีต "ข้อมูล LINE OA" (ระบบสร้างเองในโฟลเดอร์ระบบงานรังสีวิทยา, ID อยู่ใน `LINE_SS_ID`)
- PIN ไม่บังคับ (`LINE_ADMIN_PIN`) ตั้ง/ยกเลิกได้ในหน้าตั้งค่า

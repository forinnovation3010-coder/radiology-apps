# โค้ด Apps Script ของเว็บงานรังสีวิทยา (ใบลา + คลัง X-ray)

ไฟล์ในโฟลเดอร์นี้ = สำเนาโค้ดในโปรเจกต์ Apps Script "เว็บงานรังสีวิทยา" (บัญชี forinnovation3010)

- `*.gs`, `Nav.html`, `LeavePage.html`, `XrayPage.html` → วางในโปรเจกต์ Apps Script
- `build_static.js` → สร้างหน้าเว็บใน `../web/` (GitHub Pages) จากไฟล์ HTML ชุดนี้: `node apps-script/build_static.js`

แก้โค้ดแล้วต้องทำ 2 อย่าง: วางโค้ดใน Apps Script + Deploy เวอร์ชันใหม่ (รายการเดิม) และรัน build_static.js แล้ว push
หมายเหตุ: ADMIN_PIN ใน Leave.gs ของจริงตั้งไว้ใน Apps Script — สำเนานี้ใส่ค่าแทนไว้

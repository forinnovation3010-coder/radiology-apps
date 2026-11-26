# ตัวอัปเดตเว็บอัตโนมัติ (GitHub → Apps Script)

แก้โค้ดใน GitHub (ให้ Claude แก้จากมือถือได้) → ภายใน ~10 นาที ตัวอัปเดตวางโค้ดลงโปรเจกต์ Apps Script → Deploy เวอร์ชันใหม่ **ลิงก์เดิม**

| โปรเจกต์ | โฟลเดอร์โค้ดใน repo |
|---|---|
| เว็บงานรังสีวิทยา (ใบลา + X-ray + QA) | `apps-script/` |
| Intervention Device | `intervention/apps-script/` |
| MY SHIFT | `myshift/apps-script/` |
| LINE OA Bot | `line-oa/apps-script/` |
| ตัวอัปเดตเอง | `auto-update/` |

รายชื่อ/ID อยู่ใน `targets.json` — `scriptId` ว่าง = ยังไม่อัปเดตโปรเจกต์นั้น

## ติดตั้งครั้งเดียว (ทำในมือถือได้)

ใช้ Chrome ล็อกอินบัญชี **forinnovation3010** → ⋮ → ✅ เวอร์ชันเดสก์ท็อป

1. เปิด https://script.google.com/home/usersettings → **Google Apps Script API = เปิด**
2. https://script.google.com → เปิดโปรเจกต์ "ตัวอัปเดตเว็บอัตโนมัติ" (ถ้ายังไม่มี: New project แล้วตั้งชื่อนี้)
3. เปิด https://raw.githubusercontent.com/forinnovation3010-coder/radiology-apps/main/auto-update/AutoUpdate.gs
   → กดค้าง เลือกทั้งหมด → คัดลอก → วางทับไฟล์ `Code.gs` ทั้งไฟล์
4. แก้บรรทัด `const SHARE_WITH = 'ใส่อีเมล';` เป็นอีเมลที่ต่อกับ Claude
5. ⚙️ Project Settings → ✅ Show "appsscript.json" → กลับไป Editor → เปิด `appsscript.json`
   → วางทับด้วยเนื้อหาจาก https://raw.githubusercontent.com/forinnovation3010-coder/radiology-apps/main/auto-update/appsscript.json
6. กด 💾 Save → เลือกฟังก์ชัน **setup** → ▶ Run → อนุญาตสิทธิ์
   (setup = ตั้งเวลาเช็กทุก 10 นาที + ส่งออกโค้ดทุกโปรเจกต์ไปโฟลเดอร์ Drive "โค้ดส่งให้ Claude")
7. บอก Claude ว่า "ติดตั้งเสร็จแล้ว" → Claude อ่านโค้ดจริง เทียบกับ GitHub ใส่ scriptId ให้ แล้วเริ่มอัปเดตอัตโนมัติ

**ถ้าโปรเจกต์อยู่บัญชีอื่น** (เช่น MY SHIFT): เปิดโปรเจกต์นั้น → 👤 Share → ใส่ forinnovation3010@gmail.com เป็น **Editor**
**ถ้าโปรเจกต์ผูกกับชีต** (เปิดจากเมนูชีต → ส่วนขยาย → Apps Script): ไม่โผล่ใน Drive — ส่ง Script ID (⚙️ Project Settings) ให้ Claude

## ฟังก์ชัน
- `syncAll` — ทริกเกอร์ทุก 10 นาที (อัปเดตเฉพาะโปรเจกต์ที่โค้ดเปลี่ยน)
- `forceUpdate` — อัปเดตทุกโปรเจกต์ทันที
- `exportForClaude` — ส่งโค้ดปัจจุบันของทุกโปรเจกต์ไปโฟลเดอร์ "โค้ดส่งให้ Claude" (ใช้ก่อนให้ Claude แก้ ถ้าเคยแก้ในหน้า Apps Script เอง)

## ความปลอดภัย
- repo นี้ **สาธารณะ** — ห้ามใส่ token / รหัส / PIN ในโค้ด ใช้ Script properties หรือ `keep` ใน targets.json
- ก่อนวางโค้ดทุกครั้ง สำรองโค้ดเดิมไว้ใน Drive "สำรองโค้ด Apps Script (ตัวอัปเดต)" (เก็บ 30 ชุดล่าสุดต่อโปรเจกต์)
- ไฟล์ที่มีในโปรเจกต์แต่ไม่มีใน GitHub (เช่น appsscript.json) ไม่ถูกลบ
- ถ้าแก้โค้ดในหน้า Apps Script เอง แล้ว GitHub มีโค้ดใหม่ → โค้ดที่แก้เองจะถูกทับ (กู้ได้จากโฟลเดอร์สำรอง) — แนะนำแก้ผ่าน GitHub อย่างเดียว
- Apps Script เก็บเวอร์ชันได้ไม่เกิน 200 เวอร์ชันต่อโปรเจกต์ ถ้าใกล้เต็ม ลบเวอร์ชันเก่าที่ Project History

// ====== ตั้งระบบครั้งแรก (รันครั้งเดียว) ======
// เลือกฟังก์ชัน setupAll ด้านบน แล้วกด Run → ระบบจะสร้างให้เอง:
//   📁 ระบบงานรังสีวิทยา
//      ├─ 📗 ข้อมูลบุคลากรและตั้งค่า  (People, Config — มี PIN ไม่ต้องแชร์ใคร)
//      ├─ 📗 บันทึกใบลา               (แท็บ ใบลา_ปีงบXXXX — แชร์ให้หัวหน้า/ฝ่ายบุคคลได้)
//      ├─ 📗 ข้อมูลคลังสินค้า X-ray
//      └─ 📜 โปรเจกต์ Apps Script นี้ (ย้ายเข้าโฟลเดอร์ให้)
// ID ของชีตเก็บไว้ใน Project Settings → Script Properties (LEAVE_SS_ID / LEAVE_REC_SS_ID / XRAY_SS_ID / FOLDER_ID)
// รันซ้ำได้ ไฟล์ที่มีอยู่แล้วจะไม่ถูกสร้างใหม่
// ถ้าอยากชี้ไปชีตอื่น แก้ค่าที่ Script Properties ได้เลย ไม่ต้องแก้โค้ด

const SETUP_FOLDER = 'ระบบงานรังสีวิทยา';

function setupAll() {
  const P = PropertiesService.getScriptProperties();
  let folder;
  const fid = P.getProperty('FOLDER_ID');
  try { folder = fid ? DriveApp.getFolderById(fid) : null; } catch (e) { folder = null; }
  if (!folder) {
    folder = DriveApp.createFolder(SETUP_FOLDER);
    P.setProperty('FOLDER_ID', folder.getId());
  }

  const make = (key, title) => {
    const id = P.getProperty(key);
    if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
    const ss = SpreadsheetApp.create(title);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    P.setProperty(key, ss.getId());
    return ss;
  };
  const leave = make('LEAVE_SS_ID', 'ข้อมูลบุคลากรและตั้งค่า');
  if (leave.getName() !== 'ข้อมูลบุคลากรและตั้งค่า') leave.rename('ข้อมูลบุคลากรและตั้งค่า');
  const rec = make('LEAVE_REC_SS_ID', 'บันทึกใบลา');
  const xray = make('XRAY_SS_ID', 'ข้อมูลคลังสินค้า X-ray');

  // ย้ายไฟล์โค้ดนี้เข้าโฟลเดอร์ด้วย
  try { DriveApp.getFileById(ScriptApp.getScriptId()).moveTo(folder); } catch (e) {}

  // เตรียมชีตเริ่มต้น
  _ssCache = {};
  sheet_('People', PCOLS, true);
  sheet_('Config', null, false);
  sheet_(leaveSheetName_(new Date()), LCOLS, true, rec);

  // แท็บใบลาที่ยังว่างในไฟล์บุคลากร (จากการตั้งค่าแบบเดิม) ย้ายไปอยู่ไฟล์บันทึกใบลาแล้ว — ลบทิ้ง
  leave.getSheets().forEach(sh => {
    if (sh.getName().indexOf(LEAVE_PREFIX) === 0 && sh.getLastRow() <= 1 && leave.getSheets().length > 1) leave.deleteSheet(sh);
  });
  getAppData();   // สร้างชีตคลัง + หัวตาราง

  // ลบแผ่นงานว่าง "Sheet1/ชีต1" ที่ Google สร้างมาให้
  [leave, rec, xray].forEach(ss => ss.getSheets().forEach(sh => {
    if (ss.getSheets().length > 1 && /^(Sheet|ชีต|แผ่นงาน)\s*1$/.test(sh.getName()) && sh.getLastRow() === 0) ss.deleteSheet(sh);
  }));

  Logger.log('✅ ตั้งระบบเรียบร้อย');
  Logger.log('📁 โฟลเดอร์: ' + folder.getUrl());
  Logger.log('📗 ข้อมูลบุคลากรและตั้งค่า: ' + leave.getUrl());
  Logger.log('📗 บันทึกใบลา: ' + rec.getUrl());
  Logger.log('📗 ข้อมูลคลังสินค้า X-ray: ' + xray.getUrl());
}

// อ่าน ID ชีตจาก Script Properties (จำไว้ระหว่างการทำงานรอบเดียวกัน)
let _ssCache = {};
function propSs_(key) {
  if (_ssCache[key]) return _ssCache[key];
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) throw new Error('ยังไม่ได้ตั้งระบบ: เปิด Apps Script แล้วรันฟังก์ชัน setupAll ก่อน');
  return (_ssCache[key] = SpreadsheetApp.openById(id));
}

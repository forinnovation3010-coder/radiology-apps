// ====== ตัวกลางของเว็บรวม: ใบลา + คลังสินค้า X-ray (ใช้ลิงก์เดียว) ======
// เปิดหน้าไหนดูจาก ?page=  เช่น  .../exec?page=leave  หรือ  .../exec?page=xray

const PAGES = {
  leave: { file: 'LeavePage', title: 'ระบบใบลา โรงพยาบาลระยอง', viewport: 'width=device-width, initial-scale=1' },
  xray:  { file: 'XrayPage', title: 'ระบบจัดการคลังสินค้า X-ray', viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' },
  qa:    { file: 'QAPage', title: 'Daily QA ห้อง X-ray', viewport: 'width=device-width, initial-scale=1' }
};
const DEFAULT_PAGE = 'leave';   // เปิดลิงก์เปล่าๆ จะเข้าหน้านี้

// รายการในเมนูขีด 3 ขีด (เพิ่มเว็บอื่นได้ที่นี่ เช่นใส่ url ของเว็บ Intervention)
const MENU = [
  { key: 'leave', icon: '📅', title: 'ระบบใบลา', sub: 'ปฏิทินการลา · พิมพ์ใบลา PDF', tone: 'violet' },
  { key: 'xray',  icon: '📦', title: 'คลังสินค้า X-ray', sub: 'รับเข้า · เบิกใช้ · ของรออบ', tone: 'peach' },
  { key: 'qa',    icon: '✅', title: 'Daily QA ห้อง X-ray', sub: 'เช็กเครื่องรายวัน · ดูย้อนหลัง', tone: 'mint' }
  // ,{ url: 'https://script.google.com/macros/s/xxxx/exec', icon: '🩺', title: 'ระบบ Intervention', sub: 'คิวหัตถการ · คลังอุปกรณ์', tone: 'mint' }
];

function doGet(e) {
  const key = (e && e.parameter && PAGES[e.parameter.page]) ? e.parameter.page : DEFAULT_PAGE;
  const p = PAGES[key];
  const baseUrl = ScriptApp.getService().getUrl();
  const t = HtmlService.createTemplateFromFile(p.file);
  t.page = key;
  t.baseUrl = baseUrl;
  t.menu = MENU.map(m => Object.assign({}, m, { href: m.url || (baseUrl + '?page=' + m.key) }));
  return t.evaluate()
    .setTitle(p.title)
    .addMetaTag('viewport', p.viewport)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ใช้ในไฟล์ HTML:  <?!= include('Nav', {page, menu}) ?>
function include(name, vars) {
  const t = HtmlService.createTemplateFromFile(name);
  Object.assign(t, vars || {});
  return t.evaluate().getContent();
}

// ลิงก์ของเว็บ (เผื่อหน้าเว็บต้องใช้)
function getScriptUrl() { return ScriptApp.getService().getUrl(); }

// ====== API สำหรับหน้าเว็บที่โฮสต์บน GitHub Pages ======
// หน้าเว็บบน github.io เรียกฟังก์ชันผ่าน fetch (ไม่ส่งคุกกี้) จึงไม่เจอปัญหาล็อกอิน Google หลายบัญชี
// เรียกได้เฉพาะฟังก์ชันในรายการนี้ (ชุดเดียวกับที่หน้าเว็บเรียกผ่าน google.script.run อยู่แล้ว)
const API_FUNCS = [
  'login', 'getData', 'savePerson', 'deletePerson', 'saveLeave', 'deleteLeave', 'saveConfig',
  'uploadPdfTemplate', 'getPdfTemplateBase64',
  'getAppData', 'processStockTransaction', 'returnFromSterile', 'deleteInventoryItem',
  'linkBarcode', 'unlinkBarcode', 'getHistory', 'saveEmergencyCheck', 'getEmergencyLogs',
  'qaInit', 'qaGetDay', 'qaSave', 'qaGetMonth',
  'saveEmergencyShiftCheck', 'exportEmergencyMonth'
];

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (API_FUNCS.indexOf(req.fn) < 0) throw new Error('ไม่พบคำสั่ง: ' + req.fn);
    out = { ok: true, result: globalThis[req.fn].apply(null, req.args || []) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/****************************************************************
 * Daily QA ห้อง X-ray  (เพิ่มเข้าโปรเจกต์ "เว็บงานรังสีวิทยา")
 * เปิดหน้า:  <ลิงก์ /exec>?page=qa   หรือ GitHub: web/qa.html
 * หน้าเว็บ = QAPage.html (เปิดผ่าน doGet ใน Router.gs, เมนู ☰ ใช้ร่วมกับหน้าอื่น)
 *
 * ชีตที่ใช้ (สร้างให้อัตโนมัติครั้งแรก):
 *   QA_Rooms           : ห้อง | สถานะ (ใช้งาน / ปิด)
 *   QA_Items           : หมวด | รายการ | ใช้เฉพาะห้อง (เว้นว่าง = ทุกห้อง, หลายห้องคั่นด้วย ,)
 *   QA_บันทึก_<ปีงบ>    : แยกแท็บตามปีงบประมาณ (เริ่ม 1 ต.ค.)
 ****************************************************************/

// ใส่ ID ไฟล์ Google Sheet ถ้าอยากเก็บในไฟล์ที่มีอยู่แล้ว
// เว้นว่าง = ระบบสร้างไฟล์ใหม่ชื่อ "Daily QA ห้อง X-ray" ใน Drive ของเจ้าของสคริปต์ให้เอง
const QA_SHEET_ID = '';
const QA_TZ = 'Asia/Bangkok';
const QA_CACHE_KEY = 'qa_cfg_v1';
const QA_LOG_HEAD = ['บันทึกเมื่อ', 'วันที่', 'ห้อง', 'ผู้ปฏิบัติงาน', 'สรุป', 'รายการไม่ผ่าน', 'หมายเหตุ', 'ผล (ข้อมูลระบบ)'];

/* ---------- ไฟล์ชีต ---------- */
function qaSS_() {
  if (QA_SHEET_ID) return SpreadsheetApp.openById(QA_SHEET_ID);
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('QA_SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    id = props.getProperty('QA_SHEET_ID');
    if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
    const ss = SpreadsheetApp.create('Daily QA ห้อง X-ray');
    ss.setSpreadsheetTimeZone(QA_TZ);
    props.setProperty('QA_SHEET_ID', ss.getId());
    return ss;
  } finally {
    lock.releaseLock();
  }
}

function qaEnsure_(ss) {
  if (!ss.getSheetByName('QA_Rooms')) {
    const sh = ss.insertSheet('QA_Rooms');
    sh.getRange(1, 1, 4, 2).setValues([
      ['ห้อง', 'สถานะ (ใช้งาน / ปิด)'],
      ['ห้อง X-ray 1', 'ใช้งาน'],
      ['ห้อง X-ray 2', 'ใช้งาน'],
      ['ห้อง X-ray 3', 'ใช้งาน']
    ]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#efe7ff');
    sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 160);
  }
  if (!ss.getSheetByName('QA_Items')) {
    const sh = ss.insertSheet('QA_Items');
    const rows = [
      ['หมวด', 'รายการ', 'ใช้เฉพาะห้อง (เว้นว่าง = ทุกห้อง)'],
      ['1. TUBE', 'การเคลื่อนไหว tube : เข้า-ออก', ''],
      ['1. TUBE', 'การเคลื่อนไหว tube : ขึ้น-ลง', ''],
      ['1. TUBE', 'การเคลื่อนไหว tube : ซ้าย-ขวา', ''],
      ['1. TUBE', 'ความสะอาดของ tube', ''],
      ['1. TUBE', 'การ warm tube', ''],
      ['1. TUBE', 'Exposure', ''],
      ['2. เตียง', 'table up-down', ''],
      ['2. เตียง', 'table left-right', ''],
      ['2. เตียง', 'angle table', ''],
      ['2. เตียง', 'ความสะอาดของเตียง', ''],
      ['3. แผ่น FD', 'สัญญาณไฟแผ่น FD', ''],
      ['3. แผ่น FD', 'ความสะอาดแผ่น FD', ''],
      ['4. สัญญาณไฟ', 'สัญญาณไฟหน้าห้อง x-ray', ''],
      ['4. สัญญาณไฟ', 'สัญญาณไฟตู้เครื่อง', ''],
      ['4. สัญญาณไฟ', 'Time (com + เครื่อง)', '']
    ];
    sh.getRange(1, 1, rows.length, 3).setValues(rows);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#efe7ff');
    sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 230);
  }
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1') || ss.getSheetByName('ชีต1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
}

/* ---------- ตั้งค่า (cache 5 นาที) ---------- */
function qaConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(QA_CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const ss = qaSS_();
  qaEnsure_(ss);
  const rv = ss.getSheetByName('QA_Rooms').getDataRange().getValues().slice(1);
  const rooms = rv
    .filter(r => String(r[0]).trim() && String(r[1]).trim() !== 'ปิด')
    .map(r => String(r[0]).trim());
  const iv = ss.getSheetByName('QA_Items').getDataRange().getValues().slice(1);
  const items = iv
    .filter(r => String(r[1]).trim())
    .map(r => ({
      g: String(r[0]).trim() || 'อื่น ๆ',
      n: String(r[1]).trim(),
      rooms: String(r[2] || '').split(',').map(s => s.trim()).filter(String)
    }));
  const cfg = { rooms: rooms, items: items };
  cache.put(QA_CACHE_KEY, JSON.stringify(cfg), 300);
  return cfg;
}

/** รันเองจาก editor หลังแก้ชีต QA_Rooms / QA_Items ถ้าอยากให้เห็นผลทันที */
function qaClearCache() {
  CacheService.getScriptCache().remove(QA_CACHE_KEY);
}

function qaKey_(it) { return it.g + ' › ' + it.n; }

function qaItemsFor_(cfg, room) {
  return cfg.items.filter(it => !it.rooms.length || it.rooms.indexOf(room) >= 0);
}

/* ---------- ชีตบันทึกแยกปีงบ ---------- */
function qaFiscalYearBE_(d) {
  return d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0); // ต.ค. = เดือน 9
}

function qaLogSheet_(ss, d, create) {
  const name = 'QA_บันทึก_' + qaFiscalYearBE_(d);
  let sh = ss.getSheetByName(name);
  if (!sh && create) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, QA_LOG_HEAD.length).setValues([QA_LOG_HEAD])
      .setFontWeight('bold').setBackground('#efe7ff');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
    sh.getRange('B:B').setNumberFormat('dd/MM/yyyy');
  }
  return sh;
}

function qaParseDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw new Error('รูปแบบวันที่ไม่ถูกต้อง');
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function qaFmt_(d, f) {
  return d instanceof Date ? Utilities.formatDate(d, QA_TZ, f) : String(d || '');
}

function qaRowObj_(r) {
  let data = { r: {}, n: {} };
  try { data = JSON.parse(r[7] || '{}'); } catch (e) {}
  return {
    date: qaFmt_(r[1], 'yyyy-MM-dd'),
    time: qaFmt_(r[0], 'HH:mm'),
    room: String(r[2]),
    by: String(r[3]),
    summary: String(r[4]),
    failed: String(r[5] || ''),
    note: String(r[6] || ''),
    results: data.r || {},
    notes: data.n || {}
  };
}

/* ---------- เรียกจากหน้าเว็บ ---------- */

/** โหลดครั้งเดียวตอนเปิดหน้า */
function qaInit() {
  const cfg = qaConfig_();
  const now = new Date();
  const today = qaFmt_(now, 'yyyy-MM-dd');
  const sh = qaLogSheet_(qaSS_(), qaParseDate_(today), false);
  const todayRec = {};
  if (sh && sh.getLastRow() > 1) {
    const last = sh.getLastRow();
    const start = Math.max(2, last - 299); // วันนี้อยู่ท้ายชีตเสมอ อ่านแค่ 300 แถวล่าง
    sh.getRange(start, 1, last - start + 1, QA_LOG_HEAD.length).getValues().forEach(r => {
      if (qaFmt_(r[1], 'yyyy-MM-dd') === today) todayRec[String(r[2])] = qaRowObj_(r);
    });
  }
  return { rooms: cfg.rooms, items: cfg.items, today: today, todayRec: todayRec };
}

/** ดึงบันทึกของห้อง+วันที่ (ใช้ตอนเลือกวันย้อนหลัง) */
function qaGetDay(room, dateStr) {
  const d = qaParseDate_(dateStr);
  const sh = qaLogSheet_(qaSS_(), d, false);
  if (!sh || sh.getLastRow() < 2) return null;
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, QA_LOG_HEAD.length).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (String(v[i][2]) === room && qaFmt_(v[i][1], 'yyyy-MM-dd') === dateStr) return qaRowObj_(v[i]);
  }
  return null;
}

/** บันทึก (ห้องเดียวกัน วันเดียวกัน = แก้ทับของเดิม) */
function qaSave(p) {
  const cfg = qaConfig_();
  if (!p || cfg.rooms.indexOf(p.room) < 0) throw new Error('ไม่พบห้องนี้ในระบบ');
  const d = qaParseDate_(p.date);
  const today = qaFmt_(new Date(), 'yyyy-MM-dd');
  if (p.date > today) throw new Error('บันทึกล่วงหน้าไม่ได้');
  const by = String(p.by || '').trim().slice(0, 60);
  if (!by) throw new Error('กรุณาใส่ชื่อผู้ปฏิบัติงาน');

  const res = {}, notes = {}, failed = [];
  qaItemsFor_(cfg, p.room).forEach(it => {
    const k = qaKey_(it);
    const v = p.results && p.results[k];
    if (v !== 'P' && v !== 'F') throw new Error('ยังไม่ได้เช็ก: ' + it.n);
    res[k] = v;
    if (v === 'F') {
      const t = String((p.notes || {})[k] || '').trim().slice(0, 200);
      if (t) notes[k] = t;
      failed.push(it.n + (t ? ' (' + t + ')' : ''));
    }
  });
  const summary = failed.length ? 'ไม่ผ่าน ' + failed.length + ' รายการ' : 'ผ่านทั้งหมด';
  const row = [new Date(), d, p.room, by, summary, failed.join(', '),
    String(p.note || '').trim().slice(0, 300), JSON.stringify({ r: res, n: notes })];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = qaLogSheet_(qaSS_(), d, true);
    const last = sh.getLastRow();
    let target = 0;
    if (last > 1) {
      const v = sh.getRange(2, 2, last - 1, 2).getValues(); // วันที่, ห้อง
      for (let i = v.length - 1; i >= 0; i--) {
        if (String(v[i][1]) === p.room && qaFmt_(v[i][0], 'yyyy-MM-dd') === p.date) { target = i + 2; break; }
      }
    }
    if (target) sh.getRange(target, 1, 1, row.length).setValues([row]);
    else sh.getRange(last + 1, 1, 1, row.length).setValues([row]);
  } finally {
    lock.releaseLock();
  }
  return qaRowObj_(row);
}

/** ตารางรายเดือนของห้อง  ym = 'yyyy-MM' */
function qaGetMonth(room, ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym))) throw new Error('รูปแบบเดือนไม่ถูกต้อง');
  const d1 = qaParseDate_(ym + '-01');
  const sh = qaLogSheet_(qaSS_(), d1, false);
  const days = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, QA_LOG_HEAD.length).getValues().forEach(r => {
      const ds = qaFmt_(r[1], 'yyyy-MM-dd');
      if (String(r[2]) === room && ds.indexOf(ym) === 0) days[Number(ds.slice(8))] = qaRowObj_(r);
    });
  }
  return { room: room, ym: ym, days: days };
}
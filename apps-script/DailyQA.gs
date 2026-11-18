/****************************************************************
 * Daily QA ห้อง X-ray  (อยู่ในโปรเจกต์ "เว็บงานรังสีวิทยา")
 * เปิดหน้า:  <ลิงก์ /exec>?page=qa   หรือ GitHub: web/qa.html
 * หน้าเว็บ = QAPage.html (เปิดผ่าน doGet ใน Router.gs, เมนู ☰ ใช้ร่วมกับหน้าอื่น)
 *
 * ไฟล์ที่ระบบสร้างให้เอง (ในโฟลเดอร์ "ระบบงานรังสีวิทยา" › "Daily QA ห้อง X-ray"):
 *   📗 Daily QA - ตั้งค่า   : แท็บ QA_Rooms (ห้อง | สถานะ) และ QA_Items (หมวด | รายการ | ใช้เฉพาะห้อง)
 *   📗 Daily QA - <ชื่อห้อง> : 1 ไฟล์ต่อ 1 ห้อง · 1 แท็บต่อ 1 เดือน (เช่น "พ.ย. 2569")
 *        หน้าตาเหมือนฟอร์มกระดาษ: แถว = รายการเช็ก, คอลัมน์ = วันที่ 1–31, ช่อง ✓ / ✗
 *        ข้อที่ ✗ มีโน้ตปัญหาติดที่ช่องนั้น · ท้ายตาราง = ผู้ปฏิบัติงาน / เวลาบันทึก / หมายเหตุ
 ****************************************************************/

const QA_TZ = 'Asia/Bangkok';
const QA_CACHE_KEY = 'qa_cfg_v2';
const QA_FOLDER_NAME = 'Daily QA ห้อง X-ray';
const QA_TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const QA_ROW_BY = 'ผู้ปฏิบัติงาน', QA_ROW_TIME = 'เวลาบันทึก', QA_ROW_NOTE = 'หมายเหตุ';
const QA_FIRST_ITEM_ROW = 3;   // แถว 1 = หัวเรื่อง, แถว 2 = หัวตาราง
const QA_DAY_COL0 = 2;         // วันที่ 1 อยู่คอลัมน์ C (= 2 + 1)
const QA_HEAD_BG = '#efe7ff', QA_BAD_BG = '#fde6ea';

/* ---------- โฟลเดอร์ / ไฟล์ ---------- */
function qaProps_() { return PropertiesService.getScriptProperties(); }

function qaFolder_() {
  const P = qaProps_();
  const id = P.getProperty('QA_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  let parent = null;
  try { parent = DriveApp.getFolderById(P.getProperty('FOLDER_ID')); } catch (e) {}
  const f = parent ? parent.createFolder(QA_FOLDER_NAME) : DriveApp.createFolder(QA_FOLDER_NAME);
  P.setProperty('QA_FOLDER_ID', f.getId());
  return f;
}

function qaNewSS_(title) {
  const ss = SpreadsheetApp.create(title);
  ss.setSpreadsheetTimeZone(QA_TZ);
  try { DriveApp.getFileById(ss.getId()).moveTo(qaFolder_()); } catch (e) {}
  return ss;
}

function qaDropDefault_(ss) {
  ss.getSheets().forEach(sh => {
    if (ss.getSheets().length > 1 && /^(Sheet|ชีต|แผ่นงาน|แผ่น)\s*1$/.test(sh.getName()) && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

/** ไฟล์ตั้งค่า (ห้อง + รายการเช็ก) */
function qaSS_() {
  const P = qaProps_();
  let id = P.getProperty('QA_SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    id = P.getProperty('QA_SHEET_ID');
    if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
    const ss = qaNewSS_('Daily QA - ตั้งค่า (ห้อง/รายการเช็ก)');
    P.setProperty('QA_SHEET_ID', ss.getId());
    return ss;
  } finally {
    lock.releaseLock();
  }
}

/** ไฟล์ของห้อง (1 ห้อง = 1 ไฟล์) */
function qaRoomSS_(room, create) {
  const P = qaProps_(), key = 'QA_ROOM_' + room;
  const id = P.getProperty(key);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  if (!create) return null;
  const ss = qaNewSS_('Daily QA - ' + room);
  P.setProperty(key, ss.getId());
  return ss;
}

function qaEnsure_(ss) {
  if (!ss.getSheetByName('QA_Rooms')) {
    const sh = ss.insertSheet('QA_Rooms');
    const rooms = ['ห้อง 2', 'ห้อง 3', 'ห้อง 6', 'ห้องฟลู', 'ห้องฟัน', 'เกาะหวาย', 'เนินพระ', 'ตะพง'];
    sh.getRange(1, 1, rooms.length + 1, 2).setValues(
      [['ห้อง', 'สถานะ (ใช้งาน / ปิด)']].concat(rooms.map(r => [r, 'ใช้งาน'])));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground(QA_HEAD_BG);
    sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 160);
    sh.getRange('B2:B100').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['ใช้งาน', 'ปิด']).build());
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
    sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground(QA_HEAD_BG);
    sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 230);
  }
  qaDropDefault_(ss);
}

/* ---------- ตั้งค่า (cache 5 นาที) ---------- */
function qaConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(QA_CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const ss = qaSS_();
  qaEnsure_(ss);
  const rooms = ss.getSheetByName('QA_Rooms').getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() && String(r[1]).trim() !== 'ปิด')
    .map(r => String(r[0]).trim());
  const items = ss.getSheetByName('QA_Items').getDataRange().getValues().slice(1)
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

/* ---------- วันที่ ---------- */
function qaParseDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw new Error('รูปแบบวันที่ไม่ถูกต้อง');
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function qaFmt_(d, f) { return Utilities.formatDate(d, QA_TZ, f); }
function qaMonthName_(d) { return QA_TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543); }
function qaDays_(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

/* ---------- แท็บรายเดือน (หน้าตาแบบฟอร์มกระดาษ) ---------- */
function qaMonthSheet_(room, d, create) {
  const ss = qaRoomSS_(room, create);
  if (!ss) return null;
  const name = qaMonthName_(d);
  let sh = ss.getSheetByName(name);
  if (sh || !create) return sh;

  const items = qaItemsFor_(qaConfig_(), room);
  const nDays = qaDays_(d), nCol = QA_DAY_COL0 + nDays;
  sh = ss.insertSheet(name, 0);   // เดือนล่าสุดอยู่แท็บแรก
  sh.getRange(1, 1).setValue('Daily Check list ' + room + ' ประจำเดือน ' + QA_TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543))
    .setFontWeight('bold').setFontSize(13);
  const head = ['หมวด', 'รายการ'];
  for (let i = 1; i <= nDays; i++) head.push(i);
  const rows = [head].concat(items.map(it => [it.g, it.n].concat(new Array(nDays).fill(''))));
  [QA_ROW_BY, QA_ROW_TIME, QA_ROW_NOTE].forEach(l => rows.push(['', l].concat(new Array(nDays).fill(''))));
  sh.getRange(2, 1, rows.length, nCol).setValues(rows);

  const last = rows.length + 1;
  sh.getRange(2, 1, 1, nCol).setFontWeight('bold').setBackground(QA_HEAD_BG).setHorizontalAlignment('center');
  sh.getRange(last - 2, 1, 3, 2).setFontWeight('bold').setBackground(QA_HEAD_BG);
  sh.getRange(2, 1, rows.length, nCol).setBorder(true, true, true, true, true, true, '#d9cff2', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(3, QA_DAY_COL0 + 1, rows.length - 1, nDays).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(last - 2, QA_DAY_COL0 + 1, 3, nDays).setFontSize(8).setWrap(true);
  sh.getRange(last - 2, QA_DAY_COL0 + 1, 1, nDays).setTextRotation(90);
  sh.setColumnWidth(1, 95); sh.setColumnWidth(2, 210);
  sh.setColumnWidths(QA_DAY_COL0 + 1, nDays, 30);
  sh.setRowHeight(last - 2, 80);
  sh.setFrozenRows(2); sh.setFrozenColumns(2);
  qaDropDefault_(ss);
  return sh;
}

/** อ่านแท็บเดือน → { rowOf: {key: row}, byRow, timeRow, noteRow, vals, notes } */
function qaGrid_(sh) {
  const last = sh.getLastRow(), lastCol = sh.getLastColumn();
  const rng = sh.getRange(1, 1, last, lastCol);
  const vals = rng.getValues(), notes = rng.getNotes();
  const g = { rowOf: {}, byRow: 0, timeRow: 0, noteRow: 0, vals: vals, notes: notes, nDays: lastCol - QA_DAY_COL0 };
  for (let r = QA_FIRST_ITEM_ROW - 1; r < vals.length; r++) {
    const a = String(vals[r][0]).trim(), b = String(vals[r][1]).trim();
    if (!a && b === QA_ROW_BY) g.byRow = r + 1;
    else if (!a && b === QA_ROW_TIME) g.timeRow = r + 1;
    else if (!a && b === QA_ROW_NOTE) g.noteRow = r + 1;
    else if (b) g.rowOf[a + ' › ' + b] = r + 1;
  }
  return g;
}

/** ข้อมูลของวันที่ day จากตาราง (null = ยังไม่ได้เช็ก) */
function qaDayRec_(g, room, ym, day, items) {
  const c = QA_DAY_COL0 + day - 1;   // index ใน array (0-based)
  const by = g.byRow ? String(g.vals[g.byRow - 1][c] || '').trim() : '';
  if (!by) return null;
  const results = {}, notes = {}, failed = [];
  (items || Object.keys(g.rowOf).map(k => ({ key: k }))).forEach(it => {
    const k = it.key || qaKey_(it), r = g.rowOf[k];
    if (!r) return;
    const v = String(g.vals[r - 1][c]).trim();
    if (v === '✓') results[k] = 'P';
    else if (v === '✗') {
      results[k] = 'F';
      const t = String(g.notes[r - 1][c] || '').trim();
      if (t) notes[k] = t;
      failed.push(k.split(' › ').pop() + (t ? ' (' + t + ')' : ''));
    }
  });
  const time = g.timeRow ? g.vals[g.timeRow - 1][c] : '';
  return {
    date: ym + '-' + ('0' + day).slice(-2),
    time: time instanceof Date ? qaFmt_(time, 'HH:mm') : String(time || ''),
    room: room, by: by,
    summary: failed.length ? 'ไม่ผ่าน ' + failed.length + ' รายการ' : 'ผ่านทั้งหมด',
    failed: failed.join(', '),
    note: g.noteRow ? String(g.vals[g.noteRow - 1][c] || '') : '',
    results: results, notes: notes
  };
}

/* ---------- สถานะวันนี้ (จำไว้ ไม่ต้องเปิดทุกไฟล์ห้อง) ---------- */
function qaTodayStore_(today) {
  try {
    const o = JSON.parse(qaProps_().getProperty('QA_TODAY') || '{}');
    return o.date === today ? o.recs || {} : {};
  } catch (e) { return {}; }
}

/* ---------- เรียกจากหน้าเว็บ ---------- */

/** โหลดครั้งเดียวตอนเปิดหน้า */
function qaInit() {
  const cfg = qaConfig_();
  const today = qaFmt_(new Date(), 'yyyy-MM-dd');
  return { rooms: cfg.rooms, items: cfg.items, today: today, todayRec: qaTodayStore_(today), staff: qaStaff_() };
}

/** ดึงบันทึกของห้อง+วันที่ */
function qaGetDay(room, dateStr) {
  const d = qaParseDate_(dateStr);
  const sh = qaMonthSheet_(room, d, false);
  if (!sh) return null;
  return qaDayRec_(qaGrid_(sh), room, dateStr.slice(0, 7), d.getDate());
}

/** รายชื่อเจ้าหน้าที่ (ชีต People ของระบบใบลา) ใช้เป็นตัวเลือก "ผู้ปฏิบัติงาน" */
function qaStaff_() {
  try {
    const names = read_('People', PCOLS).map(p => String(p.name || '').trim()).filter(Boolean);
    return names.filter((n, i) => names.indexOf(n) === i).sort((a, b) => a.localeCompare(b, 'th'));
  } catch (e) { return []; }
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
  const items = qaItemsFor_(cfg, p.room);
  items.forEach(it => {
    const v = p.results && p.results[qaKey_(it)];
    if (v !== 'P' && v !== 'F') throw new Error('ยังไม่ได้เช็ก: ' + it.n);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let rec;
  try {
    const sh = qaMonthSheet_(p.room, d, true);
    let g = qaGrid_(sh);
    // รายการที่เพิ่มใหม่ภายหลัง → แทรกแถวก่อน "ผู้ปฏิบัติงาน"
    const missing = items.filter(it => !g.rowOf[qaKey_(it)]);
    if (missing.length && g.byRow) {
      sh.insertRowsBefore(g.byRow, missing.length);
      sh.getRange(g.byRow, 1, missing.length, 2).setValues(missing.map(it => [it.g, it.n]))
        .setFontWeight('normal').setBackground(null);
      g = qaGrid_(sh);
    }
    const col = QA_DAY_COL0 + d.getDate(), R0 = QA_FIRST_ITEM_ROW;   // อ่าน/เขียนเฉพาะคอลัมน์ของวันนั้น ตั้งแต่แถวรายการแรก
    const cell = sh.getRange(R0, col, sh.getLastRow() - R0 + 1, 1);
    const v = cell.getValues(), nt = cell.getNotes(), bg = cell.getBackgrounds();
    items.forEach(it => {
      const k = qaKey_(it), r = g.rowOf[k] - R0, res = p.results[k];
      v[r][0] = res === 'P' ? '✓' : '✗';
      nt[r][0] = res === 'F' ? String((p.notes || {})[k] || '').trim().slice(0, 200) : '';
      bg[r][0] = res === 'F' ? QA_BAD_BG : '#ffffff';
    });
    if (g.byRow) v[g.byRow - R0][0] = by;
    if (g.timeRow) v[g.timeRow - R0][0] = qaFmt_(new Date(), 'HH:mm');
    if (g.noteRow) v[g.noteRow - R0][0] = String(p.note || '').trim().slice(0, 300);
    cell.setNumberFormat('@').setValues(v).setNotes(nt).setBackgrounds(bg);
    SpreadsheetApp.flush();
    rec = qaDayRec_(qaGrid_(sh), p.room, p.date.slice(0, 7), d.getDate(), items);

    if (p.date === today) {
      const recs = qaTodayStore_(today);
      recs[p.room] = { date: rec.date, time: rec.time, room: rec.room, by: rec.by, summary: rec.summary,
        failed: rec.failed, note: rec.note, results: rec.results, notes: rec.notes };
      qaProps_().setProperty('QA_TODAY', JSON.stringify({ date: today, recs: recs }));
    }
  } finally {
    lock.releaseLock();
  }
  return rec;
}

/** ตารางรายเดือนของห้อง  ym = 'yyyy-MM' */
function qaGetMonth(room, ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym))) throw new Error('รูปแบบเดือนไม่ถูกต้อง');
  const d1 = qaParseDate_(ym + '-01');
  const sh = qaMonthSheet_(room, d1, false);
  const days = {};
  if (sh) {
    const g = qaGrid_(sh);
    for (let day = 1; day <= qaDays_(d1); day++) {
      const rec = qaDayRec_(g, room, ym, day);
      if (rec) days[day] = rec;
    }
  }
  return { room: room, ym: ym, days: days };
}

/** (ไม่บังคับ) รันเองจาก editor: สร้างไฟล์ทุกห้อง + แท็บเดือนนี้ไว้ล่วงหน้า แล้วดูลิงก์ใน Log */
function qaSetupFiles() {
  qaClearCache();
  const cfg = qaConfig_(), d = new Date();
  Logger.log('📁 ' + qaFolder_().getUrl());
  Logger.log('⚙️ ตั้งค่า: ' + qaSS_().getUrl());
  cfg.rooms.forEach(room => {
    qaMonthSheet_(room, d, true);
    Logger.log('📗 ' + room + ': ' + qaRoomSS_(room, false).getUrl());
  });
}

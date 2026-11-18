// ====== รถ Emergency: เช็กรายเวร (ด/ช/บ) + แบบฟอร์มรายเดือนใน Google Sheet ======
// หน้าเว็บ (XrayPage.html) เรียก:
//   saveEmergencyShiftCheck({date, shift, operator, items:[{name, qty, ok, missing}], note})
//   exportEmergencyMonth('2026-11')  → คืนลิงก์แท็บรายเดือน
// ข้อมูลดิบเก็บในแท็บ EmergencyChecks (ไฟล์คลัง X-ray) 1 แถว = 1 รายการ ต่อ 1 เวร
// แบบฟอร์มรายเดือนอยู่ไฟล์ "รถ Emergency - แบบฟอร์มการตรวจสอบรายเดือน" (สร้างให้เอง, ID เก็บใน EMER_SS_ID)
// แท็บรายเดือนถูกสร้างใหม่จากข้อมูลดิบทุกครั้งที่บันทึก — อย่าแก้ในแท็บรายเดือนโดยตรง (จะถูกเขียนทับ)

const EMER_SHIFTS = ['ด', 'ช', 'บ'];
const EMER_COLS = ['วันที่', 'เวร', 'ผู้ตรวจสอบ', 'รายการ', 'จำนวนในระบบ', 'ผล', 'ขาด', 'หมายเหตุ', 'เวลาบันทึก'];
const EMER_TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EMER_EXP_DAYS = 60; // แสดงของที่หมดอายุแล้ว หรือจะหมดภายในกี่วัน

/** บันทึกผลเช็ก 1 เวร (บันทึกเวรเดิมซ้ำได้ ผลล่าสุดจะแทนของเดิมในแบบฟอร์ม) */
function saveEmergencyShiftCheck(p) {
  p = p || {};
  const date = String(p.date || '').trim();
  const shift = String(p.shift || '').trim();
  const operator = String(p.operator || '').trim();
  const items = Array.isArray(p.items) ? p.items : [];
  const note = String(p.note || '').trim().slice(0, 500);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  if (date > today) throw new Error('ยังบันทึกวันล่วงหน้าไม่ได้');
  if (EMER_SHIFTS.indexOf(shift) < 0) throw new Error('กรุณาเลือกเวร ด/ช/บ');
  if (!operator) throw new Error('กรุณาเลือกผู้ตรวจสอบ');
  if (!items.length) throw new Error('ไม่มีรายการให้เช็ก');

  // บันทึกลง EmergencyLogs แบบเดิมด้วย (ประวัติรวม)
  const okN = items.filter(it => it.ok).length;
  const miss = items.filter(it => !it.ok);
  const text = 'เวร ' + shift + ' วันที่ ' + date + '\n' +
    'ครบ: ' + (okN ? okN + ' รายการ' : 'ไม่มี') + '\n' +
    'ขาด:' + (miss.length ? '\n' + miss.map(it => '- ' + it.name + ' (ขาด ' + (it.missing || 'ไม่ระบุจำนวน') + ' ชิ้น)').join('\n') : ' ไม่มี') +
    (note ? '\nหมายเหตุ: ' + note : '');
  try { saveEmergencyCheck(operator, text); } catch (e) {}

  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const rows = items.map(it => [
    date, shift, operator, String(it.name || '').trim(), Number(it.qty) || 0,
    it.ok ? '✓' : '✗', it.ok ? '' : String(it.missing || ''), note, stamp
  ]).filter(r => r[3]);
  xlock_(() => {
    const sh = emerSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, EMER_COLS.length).setValues(rows);
  });
  const out = emerBuildMonth_(date.slice(0, 7));
  return { success: true, message: 'บันทึกเวร' + shift + ' วันที่ ' + date + ' แล้ว' + (miss.length ? ' (ขาด ' + miss.length + ' รายการ)' : ' ครบทุกรายการ'), url: out.url };
}

/** สร้าง/อัปเดตแท็บรายเดือน แล้วคืนลิงก์ (ym = 'yyyy-MM' ปี ค.ศ.) */
function exportEmergencyMonth(ym) {
  ym = String(ym || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new Error('รูปแบบเดือนไม่ถูกต้อง (เช่น 2026-11)');
  return emerBuildMonth_(ym);
}

function emerSheet_() {
  const ss = xss_();
  let sh = ss.getSheetByName('EmergencyChecks');
  if (!sh) {
    sh = ss.insertSheet('EmergencyChecks');
    sh.getRange(1, 1, 1, EMER_COLS.length).setValues([EMER_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
  }
  return sh;
}

function emerFile_() {
  const P = PropertiesService.getScriptProperties();
  const id = P.getProperty('EMER_SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('รถ Emergency - แบบฟอร์มการตรวจสอบรายเดือน');
  ss.setSpreadsheetTimeZone('Asia/Bangkok');
  const f = DriveApp.getFileById(ss.getId());
  const fid = P.getProperty('FOLDER_ID');
  if (fid) { try { f.moveTo(DriveApp.getFolderById(fid)); } catch (e) {} }
  // ให้เจ้าหน้าที่เปิดดูแบบฟอร์มจากลิงก์ได้ (ดูได้อย่างเดียว แก้ไม่ได้)
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  P.setProperty('EMER_SS_ID', ss.getId());
  return ss;
}

function emerMonthName_(ym) {
  return EMER_TH_MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + (Number(ym.slice(0, 4)) + 543);
}

function emerIsEmer_(room) {
  room = String(room || '');
  return room.indexOf('Emergency') >= 0 || room.indexOf('รถฉุกเฉิน') >= 0;
}

// อ่านวันหมดอายุหลายรูปแบบ (yyyy-mm-dd, dd/mm/yyyy, ปี พ.ศ.) → Date หรือ null
function emerParseDate_(s) {
  s = String(s || '').trim();
  let y, m, d, a;
  if ((a = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +a[1]; m = +a[2]; d = +a[3]; }
  else if ((a = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { d = +a[1]; m = +a[2]; y = +a[3]; }
  else return null;
  if (y > 2400) y -= 543;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt) ? null : dt;
}

function emerFmt_(dt) {
  return Utilities.formatDate(dt, 'Asia/Bangkok', 'd/M/') + (Number(Utilities.formatDate(dt, 'Asia/Bangkok', 'yyyy')) + 543);
}

function emerBuildMonth_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const days = new Date(y, m, 0).getDate();
  const W = 2 + days * 3;

  // ของในคลังรถ Emergency ตอนนี้ (ลำดับตามชีต)
  const inv = (getAppData().inventory || []).filter(it => emerIsEmer_(it.room));
  const names = [], qty = {};
  inv.forEach(it => {
    if (!(it.name in qty)) { qty[it.name] = 0; names.push(it.name); }
    qty[it.name] += Number(it.qty) || 0;
  });

  // ผลเช็กของเดือนนี้ (แถวหลังทับแถวก่อน = ผลล่าสุดของเวรนั้น)
  const sh = emerSheet_();
  const last = sh.getLastRow();
  const raw = last > 1 ? sh.getRange(2, 1, last - 1, EMER_COLS.length).getDisplayValues() : [];
  const rec = {}, by = {}, shiftNote = {}, shiftItems = {};
  raw.forEach(r => {
    const d = String(r[0]);
    if (d.slice(0, 7) !== ym || !r[3]) return;
    const k = Number(d.slice(8, 10)) + '|' + r[1];
    if (shiftItems[k] !== r[8]) { // รอบบันทึกใหม่ของเวรนี้ → ล้างผลรอบก่อน
      Object.keys(rec).forEach(x => { if (x.indexOf(k + '|') === 0) delete rec[x]; });
      shiftItems[k] = r[8];
    }
    if (!(r[3] in qty)) { qty[r[3]] = r[4]; names.push(r[3]); }
    rec[k + '|' + r[3]] = { ok: r[5] === '✓', missing: r[6] };
    by[k] = r[2];
    shiftNote[k] = r[7];
  });

  const blank = () => new Array(W).fill('');
  const grid = [];
  const r1 = blank(); r1[0] = 'แบบฟอร์มการตรวจสอบรถ Emergency ประจำเดือน ' + emerMonthName_(ym) + '  ·  งานรังสีวิทยา โรงพยาบาลระยอง'; grid.push(r1);
  const r2 = blank(); r2[0] = 'รายการ'; r2[1] = 'จำนวน';
  const r3 = blank();
  for (let d = 1; d <= days; d++) { r2[2 + (d - 1) * 3] = d; EMER_SHIFTS.forEach((s, i) => r3[2 + (d - 1) * 3 + i] = s); }
  grid.push(r2, r3);
  const bad = [];
  names.forEach((n, i) => {
    const r = blank(); r[0] = n; r[1] = qty[n];
    for (let d = 1; d <= days; d++) EMER_SHIFTS.forEach((s, j) => {
      const v = rec[d + '|' + s + '|' + n];
      if (!v) return;
      const c = 2 + (d - 1) * 3 + j;
      r[c] = v.ok ? '✓' : '✗';
      if (!v.ok) bad.push([grid.length + 1, c + 1]);
    });
    grid.push(r);
  });
  const rBy = blank(); rBy[0] = 'ผู้ตรวจสอบ';
  for (let d = 1; d <= days; d++) EMER_SHIFTS.forEach((s, j) => { rBy[2 + (d - 1) * 3 + j] = by[d + '|' + s] || ''; });
  grid.push(rBy);
  const gridRows = grid.length;

  // ส่วนท้าย: ของหมดอายุ / ของขาด / หมายเหตุ
  const foot = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lim = new Date(today.getTime() + EMER_EXP_DAYS * 864e5);
  const expLines = inv.map(it => ({ it: it, dt: emerParseDate_(it.exp) }))
    .filter(x => x.dt && x.dt <= lim)
    .sort((a, b) => a.dt - b.dt)
    .map(x => '• ' + x.it.name + ' (' + x.it.qty + ' ชิ้น) หมดอายุ ' + emerFmt_(x.dt) + (x.dt < today ? '  ⚠️ หมดอายุแล้ว' : ''));
  foot.push('ของหมดอายุแล้ว / จะหมดอายุภายใน ' + EMER_EXP_DAYS + ' วัน (ข้อมูลจากคลัง ณ ' + emerFmt_(new Date()) + ')');
  (expLines.length ? expLines : ['• ไม่มี']).forEach(t => foot.push(t));
  foot.push('');
  foot.push('ของขาดจากการเช็กเดือนนี้');
  const missLines = [];
  Object.keys(rec).sort((a, b) => { const pa = a.split('|'), pb = b.split('|'); return (pa[0] - pb[0]) || (EMER_SHIFTS.indexOf(pa[1]) - EMER_SHIFTS.indexOf(pb[1])); })
    .forEach(k => { const v = rec[k]; if (v.ok) return; const p = k.split('|'); missLines.push('• วันที่ ' + p[0] + ' เวร' + p[1] + ': ' + p.slice(2).join('|') + ' ขาด ' + (v.missing || 'ไม่ระบุจำนวน') + ' ชิ้น'); });
  (missLines.length ? missLines : ['• ไม่มี']).forEach(t => foot.push(t));
  foot.push('');
  foot.push('หมายเหตุจากการเช็ก');
  const noteLines = Object.keys(shiftNote).filter(k => shiftNote[k])
    .sort((a, b) => { const pa = a.split('|'), pb = b.split('|'); return (pa[0] - pb[0]) || (EMER_SHIFTS.indexOf(pa[1]) - EMER_SHIFTS.indexOf(pb[1])); })
    .map(k => { const p = k.split('|'); return '• วันที่ ' + p[0] + ' เวร' + p[1] + ' (' + (by[k] || '') + '): ' + shiftNote[k]; });
  (noteLines.length ? noteLines : ['• ไม่มี']).forEach(t => foot.push(t));
  foot.push('');
  foot.push('ด = เวรดึก · ช = เวรเช้า · บ = เวรบ่าย · ✓ ครบ · ✗ ไม่ครบ   (แท็บนี้สร้างจากระบบอัตโนมัติ แก้ที่หน้าเว็บ ไม่ต้องแก้ในชีต)');
  foot.forEach(t => { const r = blank(); r[0] = t; grid.push(r); });

  return xlock_(() => {
    const ss = emerFile_();
    const name = emerMonthName_(ym);
    let tab = ss.getSheetByName(name);
    if (!tab) {
      tab = ss.insertSheet(name, 0);
      ss.getSheets().forEach(s => {
        if (ss.getSheets().length > 1 && /^(Sheet|ชีต|แผ่นงาน)\s*1$/.test(s.getName()) && s.getLastRow() === 0) ss.deleteSheet(s);
      });
    }
    tab.getRange(1, 1, tab.getMaxRows(), tab.getMaxColumns()).breakApart();
    tab.clear();
    if (tab.getMaxColumns() < W) tab.insertColumnsAfter(tab.getMaxColumns(), W - tab.getMaxColumns());
    if (tab.getMaxRows() < grid.length) tab.insertRowsAfter(tab.getMaxRows(), grid.length - tab.getMaxRows());
    tab.getRange(1, 1, grid.length, W).setValues(grid).setFontSize(9).setVerticalAlignment('middle');

    tab.getRange(1, 1, 1, W).merge().setFontSize(13).setFontWeight('bold').setBackground('#efe6ff');
    tab.getRange(2, 1, 2, 1).merge(); tab.getRange(2, 2, 2, 1).merge();
    for (let d = 1; d <= days; d++) tab.getRange(2, 3 + (d - 1) * 3, 1, 3).merge();
    tab.getRange(2, 1, 2, W).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#f6f0ff');
    tab.getRange(2, 1, gridRows - 1, W).setBorder(true, true, true, true, true, true, '#c9b6f2', SpreadsheetApp.BorderStyle.SOLID);
    if (gridRows > 4) tab.getRange(4, 2, gridRows - 4, W - 1).setHorizontalAlignment('center');
    tab.getRange(gridRows, 1, 1, W).setFontWeight('bold').setBackground('#fff4ea');
    tab.getRange(gridRows, 3, 1, W - 2).setTextRotation(90).setFontSize(8).setFontWeight('normal');
    bad.forEach(rc => tab.getRange(rc[0], rc[1]).setBackground('#ffd9e0').setFontColor('#b4234a').setFontWeight('bold'));
    for (let i = gridRows + 1; i <= grid.length; i++) {
      tab.getRange(i, 1, 1, W).merge();
      const t = String(grid[i - 1][0]);
      if (t && t.indexOf('•') !== 0) tab.getRange(i, 1).setFontWeight('bold').setFontSize(10);
    }
    tab.setColumnWidth(1, 200); tab.setColumnWidth(2, 44);
    tab.setColumnWidths(3, W - 2, 20);
    tab.setRowHeight(gridRows, 90);
    tab.setFrozenColumns(0); tab.setFrozenRows(3); // ตรึงแค่แถวหัว (ตรึงคอลัมน์ไม่ได้เพราะหัวเรื่องผสานเซลล์ทั้งแถว)
    SpreadsheetApp.flush();
    return { url: ss.getUrl() + '#gid=' + tab.getSheetId(), name: name };
  });
}

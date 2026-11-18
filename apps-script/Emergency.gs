// ====== รถ Emergency: เช็กเดือนละครั้ง + แบบฟอร์มรายปีงบใน Google Sheet ======
// หน้าเว็บ (XrayPage.html) เรียก:
//   saveEmergencyShiftCheck({date, operator, items:[{name, qty, ok, missing}], note})  → บันทึกผลเช็กของเดือนนั้น
//   exportEmergencyMonth('2570')  → คืนลิงก์แท็บ "ปีงบ 2570" (ส่ง 'yyyy-MM' ก็ได้ จะเปิดปีงบของเดือนนั้น)
// ข้อมูลดิบเก็บในแท็บ EmergencyChecks (ไฟล์คลัง X-ray) 1 แถว = 1 รายการ ต่อ 1 ครั้งที่เช็ก
// แบบฟอร์มอยู่ไฟล์ "รถ Emergency - แบบฟอร์มการตรวจสอบรายเดือน" (สร้างให้เอง, ID เก็บใน EMER_SS_ID)
// 1 แท็บต่อปีงบ (ต.ค.–ก.ย.) คอลัมน์ = 12 เดือน · เช็กซ้ำในเดือนเดียวกัน ผลล่าสุดจะแทนของเดิม
// แท็บถูกสร้างใหม่จากข้อมูลดิบทุกครั้งที่บันทึก — อย่าแก้ในแท็บแบบฟอร์มโดยตรง (จะถูกเขียนทับ)

const EMER_COLS = ['วันที่', 'เวร', 'ผู้ตรวจสอบ', 'รายการ', 'จำนวนในระบบ', 'ผล', 'ขาด', 'หมายเหตุ', 'เวลาบันทึก'];
const EMER_TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EMER_EXP_DAYS = 60; // แสดงของที่หมดอายุแล้ว หรือจะหมดภายในกี่วัน

/** บันทึกผลเช็กของเดือนนั้น (เช็กซ้ำในเดือนเดียวกันได้ ผลล่าสุดจะแทนของเดิมในแบบฟอร์ม) */
function saveEmergencyShiftCheck(p) {
  p = p || {};
  const date = String(p.date || '').trim();
  const operator = String(p.operator || '').trim();
  const items = Array.isArray(p.items) ? p.items : [];
  const note = String(p.note || '').trim().slice(0, 500);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  if (date > today) throw new Error('ยังบันทึกวันล่วงหน้าไม่ได้');
  if (!operator) throw new Error('กรุณาเลือกผู้ตรวจสอบ');
  if (!items.length) throw new Error('ไม่มีรายการให้เช็ก');

  // บันทึกลง EmergencyLogs แบบเดิมด้วย (ประวัติรวม)
  const okN = items.filter(it => it.ok).length;
  const miss = items.filter(it => !it.ok);
  const text = 'เช็กประจำเดือน ' + emerMonthName_(date.slice(0, 7)) + ' (วันที่ ' + date + ')\n' +
    'ครบ: ' + (okN ? okN + ' รายการ' : 'ไม่มี') + '\n' +
    'ขาด:' + (miss.length ? '\n' + miss.map(it => '- ' + it.name + (it.missing ? ' (ขาด ' + it.missing + ' ชิ้น)' : ' (ขาด ไม่ระบุจำนวน)')).join('\n') : ' ไม่มี') +
    (note ? '\nหมายเหตุ: ' + note : '');
  try { saveEmergencyCheck(operator, text); } catch (e) {}

  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  const rows = items.map(it => [
    date, '', operator, String(it.name || '').trim(), Number(it.qty) || 0,
    it.ok ? '✓' : '✗', it.ok ? '' : String(it.missing || ''), note, stamp
  ]).filter(r => r[3]);
  xlock_(() => {
    const sh = emerSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, EMER_COLS.length).setValues(rows);
  });
  const out = emerBuildYear_(emerFiscalBE_(date));
  return { success: true, message: 'บันทึกการเช็กเดือน ' + emerMonthName_(date.slice(0, 7)) + ' แล้ว' + (miss.length ? ' (ขาด ' + miss.length + ' รายการ)' : ' ครบทุกรายการ'), url: out.url };
}

/** สร้าง/อัปเดตแท็บปีงบ แล้วคืนลิงก์ (รับ 'yyyy' ปีงบ พ.ศ. หรือ 'yyyy-MM' ค.ศ.) */
function exportEmergencyMonth(v) {
  v = String(v || '').trim();
  let fy;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) fy = emerFiscalBE_(v + '-01');
  else if (/^25\d\d$/.test(v)) fy = Number(v);
  else throw new Error('ระบุปีงบประมาณ พ.ศ. เช่น 2570');
  return emerBuildYear_(fy);
}

// ปีงบ พ.ศ. ของวันที่ 'yyyy-MM-dd' (ปีงบเริ่ม 1 ต.ค.)
function emerFiscalBE_(date) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return (m >= 10 ? y + 1 : y) + 543;
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

function emerBuildYear_(fyBE) {
  const yCE = fyBE - 543; // ปีงบ 2570 = ต.ค. 2569 – ก.ย. 2570 (ค.ศ. Oct 2026 – Sep 2027)
  // 12 เดือนของปีงบ: ต.ค.(ปีก่อน) → ก.ย.
  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = (9 + i) % 12 + 1, y = m >= 10 ? yCE - 1 : yCE;
    months.push(y + '-' + String(m).padStart(2, '0'));
  }
  const W = 2 + 12;

  // ของในคลังรถ Emergency ตอนนี้ (ลำดับตามชีต)
  const inv = (getAppData().inventory || []).filter(it => emerIsEmer_(it.room));
  const names = [], qty = {};
  inv.forEach(it => {
    if (!(it.name in qty)) { qty[it.name] = 0; names.push(it.name); }
    qty[it.name] += Number(it.qty) || 0;
  });

  // ผลเช็กของปีงบนี้ — แต่ละเดือนใช้รอบบันทึกล่าสุด
  const sh = emerSheet_();
  const last = sh.getLastRow();
  const raw = last > 1 ? sh.getRange(2, 1, last - 1, EMER_COLS.length).getDisplayValues() : [];
  const latest = {}; // ym -> stamp ล่าสุด
  raw.forEach(r => { const ym = String(r[0]).slice(0, 7); if (months.indexOf(ym) >= 0 && r[3] && (!latest[ym] || r[8] > latest[ym])) latest[ym] = r[8]; });
  const rec = {}, info = {};
  raw.forEach(r => {
    const ym = String(r[0]).slice(0, 7);
    if (!latest[ym] || r[8] !== latest[ym] || !r[3]) return;
    if (!(r[3] in qty)) { qty[r[3]] = r[4]; names.push(r[3]); }
    rec[ym + '|' + r[3]] = { ok: r[5] === '✓', missing: r[6] };
    info[ym] = { date: r[0], by: r[2], note: r[7] };
  });

  const blank = () => new Array(W).fill('');
  const grid = [];
  const r1 = blank(); r1[0] = 'แบบฟอร์มการตรวจสอบรถ Emergency ปีงบประมาณ ' + fyBE + '  ·  งานรังสีวิทยา โรงพยาบาลระยอง'; grid.push(r1);
  const r2 = blank(); r2[0] = 'รายการ'; r2[1] = 'จำนวน';
  const r3 = blank(); r3[0] = ''; r3[1] = '';
  months.forEach((ym, i) => {
    r2[2 + i] = EMER_TH_MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + String(Number(ym.slice(0, 4)) + 543).slice(2);
    const d = info[ym] && emerParseDate_(info[ym].date);
    r3[2 + i] = d ? 'เช็ก ' + Utilities.formatDate(d, 'Asia/Bangkok', 'd/M') : '';
  });
  grid.push(r2, r3);
  const bad = [];
  names.forEach(n => {
    const r = blank(); r[0] = n; r[1] = qty[n];
    months.forEach((ym, i) => {
      const v = rec[ym + '|' + n];
      if (!v) return;
      r[2 + i] = v.ok ? '✓' : ('✗' + (v.missing ? ' ขาด ' + v.missing : ''));
      if (!v.ok) bad.push([grid.length + 1, 3 + i]);
    });
    grid.push(r);
  });
  const rBy = blank(); rBy[0] = 'ผู้ตรวจสอบ';
  months.forEach((ym, i) => { rBy[2 + i] = info[ym] ? info[ym].by : ''; });
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
  foot.push('ของขาดจากการเช็ก');
  const missLines = [];
  months.forEach(ym => names.forEach(n => {
    const v = rec[ym + '|' + n];
    if (v && !v.ok) missLines.push('• ' + emerMonthName_(ym) + ': ' + n + (v.missing ? ' ขาด ' + v.missing + ' ชิ้น' : ' ขาด (ไม่ระบุจำนวน)'));
  }));
  (missLines.length ? missLines : ['• ไม่มี']).forEach(t => foot.push(t));
  foot.push('');
  foot.push('หมายเหตุ');
  const noteLines = months.filter(ym => info[ym] && info[ym].note)
    .map(ym => '• ' + emerMonthName_(ym) + ' (' + info[ym].by + '): ' + info[ym].note);
  (noteLines.length ? noteLines : ['• ไม่มี']).forEach(t => foot.push(t));
  foot.push('');
  foot.push('✓ ครบ · ✗ ไม่ครบ · เช็กเดือนละครั้ง (เช็กซ้ำในเดือนเดียวกัน ระบบใช้ผลล่าสุด) · แท็บนี้สร้างจากระบบอัตโนมัติ แก้ที่หน้าเว็บ ไม่ต้องแก้ในชีต');
  foot.forEach(t => { const r = blank(); r[0] = t; grid.push(r); });

  return xlock_(() => {
    const ss = emerFile_();
    const name = 'ปีงบ ' + fyBE;
    let tab = ss.getSheetByName(name);
    if (!tab) {
      tab = ss.insertSheet(name, 0);
      ss.getSheets().forEach(s => {
        if (ss.getSheets().length > 1 && /^(Sheet|ชีต|แผ่นงาน)\s*1$/.test(s.getName()) && s.getLastRow() === 0) ss.deleteSheet(s);
      });
    }
    tab.setFrozenRows(0); tab.setFrozenColumns(0);
    tab.getRange(1, 1, tab.getMaxRows(), tab.getMaxColumns()).breakApart();
    tab.clear();
    if (tab.getMaxColumns() < W) tab.insertColumnsAfter(tab.getMaxColumns(), W - tab.getMaxColumns());
    if (tab.getMaxRows() < grid.length) tab.insertRowsAfter(tab.getMaxRows(), grid.length - tab.getMaxRows());
    tab.getRange(1, 1, grid.length, W).setValues(grid).setFontSize(10).setVerticalAlignment('middle');

    tab.getRange(1, 1, 1, W).merge().setFontSize(13).setFontWeight('bold').setBackground('#efe6ff');
    tab.getRange(2, 1, 2, 1).merge(); tab.getRange(2, 2, 2, 1).merge();
    tab.getRange(2, 1, 1, W).setFontWeight('bold');
    tab.getRange(2, 1, 2, W).setHorizontalAlignment('center').setBackground('#f6f0ff');
    tab.getRange(3, 3, 1, 12).setFontSize(8).setFontColor('#7a6aa0');
    tab.getRange(2, 1, gridRows - 1, W).setBorder(true, true, true, true, true, true, '#c9b6f2', SpreadsheetApp.BorderStyle.SOLID);
    if (gridRows > 4) tab.getRange(4, 2, gridRows - 4, W - 1).setHorizontalAlignment('center');
    tab.getRange(gridRows, 1, 1, W).setBackground('#fff4ea');
    tab.getRange(gridRows, 1).setFontWeight('bold');
    tab.getRange(gridRows, 3, 1, 12).setFontSize(8).setWrap(true).setHorizontalAlignment('center');
    bad.forEach(rc => tab.getRange(rc[0], rc[1]).setBackground('#ffd9e0').setFontColor('#b4234a').setFontWeight('bold'));
    for (let i = gridRows + 1; i <= grid.length; i++) {
      tab.getRange(i, 1, 1, W).merge();
      const t = String(grid[i - 1][0]);
      if (t && t.indexOf('•') !== 0 && t.indexOf('✓') !== 0) tab.getRange(i, 1).setFontWeight('bold').setFontSize(11);
    }
    tab.setColumnWidth(1, 240); tab.setColumnWidth(2, 56);
    tab.setColumnWidths(3, 12, 72);
    tab.setRowHeight(gridRows, 40);
    tab.setFrozenRows(3);
    SpreadsheetApp.flush();
    return { url: ss.getUrl() + '#gid=' + tab.getSheetId(), name: name };
  });
}

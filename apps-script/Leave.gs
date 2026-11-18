// ระบบใบลา โรงพยาบาลระยอง - Google Apps Script + Google Sheets + PDF Overlay (แก้ปัญหาพิมพ์ PDF)
// ID ของชีตใบลาเก็บใน Script Properties (LEAVE_SS_ID) — สร้างให้อัตโนมัติด้วย setupAll() ใน Setup.gs

// ====== ตั้งค่าก่อนใช้งาน ======
const ADMIN_ID = 'Admin';        // ID ของผู้ดูแลระบบ (ไม่สนตัวพิมพ์เล็กใหญ่)
const ADMIN_PIN = 'ใส่รหัสจริงใน Apps Script เท่านั้น';     // รหัสผู้ดูแลระบบ
const SALT = 'change-me-ryh';    // ข้อความเข้ารหัส PIN (ตั้งแล้วอย่าเปลี่ยน)
const MAX_FAIL = 5;              // ใส่รหัสผิดได้กี่ครั้งก่อนถูกล็อก 15 นาที
const CACHE_TTL = 300;           // แคชข้อมูล (วินาที) ถ้าแก้ชีตตรงๆ จะเห็นผลภายใน 5 นาที
const MAX_PDF_BYTES = 8 * 1024 * 1024; // ขนาดไฟล์ PDF ต้นฉบับสูงสุดที่ยอมรับ

const PCOLS = ['id', 'name', 'pos', 'dept', 'type', 'carry', 'contact', 'sub', 'pin'];
const LCOLS = ['id', 'name', 'dept', 'type', 'cty', 's', 'e', 'days', 'dt', 'rs', 'ctc', 'sb', 'cancelled', 'ex'];

const ss_ = () => propSs_('LEAVE_SS_ID');          // ไฟล์ "ข้อมูลบุคลากรและตั้งค่า" (People, Config)
const recSs_ = () => propSs_('LEAVE_REC_SS_ID');   // ไฟล์ "บันทึกใบลา" (แท็บ ใบลา_ปีงบXXXX)

// ---------- แคช (แบ่งก้อนเพราะ 1 key เก็บได้ ~100KB) ----------
function cachePut_(key, str, ttl, size) {
  try {
    const c = CacheService.getScriptCache(), N = size || 20000, parts = Math.ceil(str.length / N) || 1, o = {};
    for (let i = 0; i < parts; i++) o[key + ':' + i] = str.substr(i * N, N);
    o[key + ':n'] = String(parts);
    c.putAll(o, ttl || CACHE_TTL);
  } catch (e) {}
}
function cacheGet_(key) {
  try {
    const c = CacheService.getScriptCache(), n = +c.get(key + ':n');
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + ':' + i);
    const m = c.getAll(keys);
    let s = '';
    for (let i = 0; i < n; i++) { const p = m[key + ':' + i]; if (p == null) return null; s += p; }
    return s;
  } catch (e) { return null; }
}
function cacheDel_(key) {
  try {
    const c = CacheService.getScriptCache(), n = +c.get(key + ':n') || 0, ks = [key + ':n'];
    for (let i = 0; i < n; i++) ks.push(key + ':' + i);
    c.removeAll(ks);
  } catch (e) {}
}
function clearCache_() { cacheDel_('DATA'); cacheDel_('PPL'); }

// ---------- ชีต ----------
function sheet_(name, cols, writeHeader, ssIn) {
  const ss = ssIn || ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@');
    sh.setFrozenRows(1);
    if (cols) sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  } else if (writeHeader && cols && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  }
  return sh;
}

function normDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    let y = v.getFullYear();
    if (y > 2400) y -= 543;
    return y + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    let y = +m[1];
    if (y > 2400) y -= 543;
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m2) {
    let y = +m2[3];
    if (y > 2400) y -= 543;
    return y + '-' + ('0' + m2[2]).slice(-2) + '-' + ('0' + m2[1]).slice(-2);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    let y = d.getFullYear();
    if (y > 2400) y -= 543;
    return y + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  return s;
}

function cleanStr_(v) {
  if (v === undefined || v === null) return '';
  // ลบอักขระควบคุมที่ซ่อนอยู่ซึ่งทำให้ google.script.run พัง
  return String(v).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim();
}

function readFromSs_(ss, name, cols) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const lastRow = Math.min(sh.getLastRow(), 5000);
  if (lastRow < 2) return [];
  const v = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
  const out = [];
  for (let r = 0; r < v.length; r++) {
    const row = v[r];
    if (row[0] === '' || row[0] === null) continue;
    const o = {};
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      o[c] = (c === 's' || c === 'e' || c === 'dt') ? normDate_(row[i]) : cleanStr_(row[i]);
    }
    if (o.cancelled !== undefined) o.cancelled = String(o.cancelled).toUpperCase() === 'TRUE';
    out.push(o);
  }
  return out;
}

const read_ = (name, cols) => readFromSs_(ss_(), name, cols);

function rowOf_(cols, o) {
  return cols.map(c => c === 'cancelled' ? (o[c] ? 'TRUE' : '') : (o[c] == null ? '' : String(o[c])));
}

function upsert_(name, cols, o) {
  const sh = sheet_(name, cols, true), n = sh.getLastRow();
  let row = 0;
  if (n > 1) {
    const ids = sh.getRange(2, 1, n - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(o.id).trim()) { row = i + 2; break; }
    }
  }
  if (!row) row = Math.max(n + 1, 2);
  const rng = sh.getRange(row, 1, 1, cols.length);
  rng.setNumberFormat('@');
  rng.setValues([rowOf_(cols, o)]);
  clearCache_();
}

function remove_(name, cols, id) {
  const sh = sheet_(name, cols, false), n = sh.getLastRow();
  if (n < 2) return;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]).trim() === String(id).trim()) sh.deleteRow(i + 2);
  }
  clearCache_();
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- ยืนยันตัวตน ----------
function hash_(pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SALT + String(pin), Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

const norm_ = s => String(s == null ? '' : s).trim().toLowerCase();

// รายชื่อ (รวม PIN แฮช) แบบแคช เพื่อไม่ต้องอ่านชีตทุกครั้งที่เรียก API
function peopleFull_() {
  const s = cacheGet_('PPL');
  if (s) { try { return JSON.parse(s); } catch (e) {} }
  const arr = read_('People', PCOLS);
  cachePut_('PPL', JSON.stringify(arr));
  return arr;
}

function auth_(a) {
  a = a || {};
  const cache = CacheService.getScriptCache(), key = 'f:' + norm_(a.id).slice(0, 80);
  const fails = +(cache.get(key) || 0);
  if (fails >= MAX_FAIL) throw new Error('ใส่รหัสผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่');
  const me = peopleFull_().find(x => norm_(x.id) === norm_(a.id));
  let ok = null;
  if (norm_(a.id) === norm_(ADMIN_ID)) {
    if (String(a.p) === ADMIN_PIN) ok = { admin: true, name: me ? me.name : 'ผู้ดูแลระบบ', id: ADMIN_ID };
  } else if (me && me.pin && me.pin === hash_(a.p)) {
    ok = { admin: false, name: me.name, id: me.id };
  }
  if (!ok) { cache.put(key, String(fails + 1), 900); throw new Error('ID หรือรหัสผ่านไม่ถูกต้อง'); }
  if (fails) cache.remove(key);
  return ok;
}

// ---------- API ----------
function login(a) { const u = auth_(a); return { admin: u.admin, name: u.name, id: u.id }; }

function getData() {
  const hit = cacheGet_('DATA');
  if (hit) return hit;
  try {
    const ss = ss_();
    let cfg = {};
    try {
      const sh = ss.getSheetByName('Config');
      if (sh) {
        const rawCfg = cleanStr_(sh.getRange('A1').getValue());
        if (rawCfg) cfg = JSON.parse(rawCfg);
      }
    } catch (e) {}

    const people = readFromSs_(ss, 'People', PCOLS).map(p => {
      const q = Object.assign({}, p);
      q.hasPin = !!q.pin;
      delete q.pin;
      return q;
    });
    const leaves = readAllLeaves_(recSs_());
    const out = JSON.stringify({ people: people, leaves: leaves, cfg: cfg });
    cachePut_('DATA', out);
    return out;
  } catch (err) {
    throw new Error('Server Error: ' + (err && err.message ? err.message : String(err)));
  }
}

function savePerson(a, p) {
  const u = auth_(a);
  return locked_(() => {
    const all = read_('People', PCOLS), old = all.find(x => norm_(x.id) === norm_(p.id));
    let n;
    if (u.admin) {
      if (!p.name || !norm_(p.id)) throw new Error('กรอก ID และชื่อก่อน');
      if (old && old.name !== p.name) throw new Error('เปลี่ยนชื่อไม่ได้ (ใบลาเก่าอ้างอิงชื่อเดิม) ให้ลบแล้วเพิ่มใหม่');
      if (all.some(x => x.name === p.name && norm_(x.id) !== norm_(p.id))) throw new Error('มีชื่อนี้อยู่แล้ว');
      if (!old && !p.newPin) throw new Error('ต้องตั้งรหัสผ่านให้บุคลากรใหม่');
      n = Object.assign({}, old || {}, { id: old ? old.id : String(p.id).trim(), name: p.name, pos: p.pos, dept: p.dept, type: p.type, carry: p.carry, contact: p.contact, sub: p.sub });
    } else {
      if (!old || norm_(old.id) !== norm_(u.id)) throw new Error('แก้ไขได้เฉพาะข้อมูลของตนเอง');
      n = Object.assign({}, old, { pos: p.pos, dept: p.dept, type: p.type, contact: p.contact, sub: p.sub });
    }
    if (p.newPin) {
      if (String(p.newPin).length < 4) throw new Error('รหัสผ่านต้องมีอย่างน้อย 4 ตัว');
      n.pin = hash_(p.newPin);
    }
    upsert_('People', PCOLS, n);
    return true;
  });
}

function deletePerson(a, id) {
  const u = auth_(a);
  if (!u.admin) throw new Error('เฉพาะผู้ดูแลระบบ');
  locked_(() => remove_('People', PCOLS, id));
  return true;
}

// อ่านชีตครั้งเดียว เขียนเฉพาะแถวที่เปลี่ยน
// ---------- แยกชีตใบลาตามปีงบประมาณ (เริ่ม 1 ต.ค.) ----------
// ใบลาวันที่ 17 พ.ย. 2569 → ชีต "ใบลา_ปีงบ2570" / ระบบสร้างชีตปีใหม่ให้เองเมื่อมีใบลาแรกของปีนั้น
const LEAVE_PREFIX = 'ใบลา_ปีงบ';
const LEAVE_LEGACY = 'Leaves';   // ชีตแบบเดิม (ถ้ามี) ยังอ่านได้ตามปกติ

function fiscalYearBE_(d) {
  const k = normDate_(d) || normDate_(new Date());
  const y = +k.slice(0, 4), m = +k.slice(5, 7);
  return (m >= 10 ? y + 1 : y) + 543;
}
const leaveSheetName_ = d => LEAVE_PREFIX + fiscalYearBE_(d);

// ชีตใบลาทั้งหมด เรียงจากปีเก่าไปใหม่ (ชีตแบบเดิมอยู่ก่อนสุด)
function leaveSheets_(ss) {
  return ss.getSheets().filter(sh => {
    const n = sh.getName();
    return n === LEAVE_LEGACY || (n.indexOf(LEAVE_PREFIX) === 0 && /^\d{4}$/.test(n.slice(LEAVE_PREFIX.length)));
  }).sort((a, b) => (a.getName() === LEAVE_LEGACY ? 0 : +a.getName().slice(LEAVE_PREFIX.length)) - (b.getName() === LEAVE_LEGACY ? 0 : +b.getName().slice(LEAVE_PREFIX.length)));
}

// เว็บโหลดใบลาเฉพาะปีงบปัจจุบัน + ปีก่อนหน้า (และปีถัดไปถ้ามีคนลาล่วงหน้า) ให้เปิดเว็บเร็วเท่าเดิมตลอด
// ชีตปีเก่ากว่านั้นยังอยู่ในไฟล์ครบ เปิดดูในชีตได้ตามปกติ
const LEAVE_YEARS_SHOWN = 2;
function readAllLeaves_(ss) {
  const minYear = fiscalYearBE_(new Date()) - (LEAVE_YEARS_SHOWN - 1);
  let out = [];
  leaveSheets_(ss).forEach(sh => {
    const n = sh.getName();
    if (n !== LEAVE_LEGACY && +n.slice(LEAVE_PREFIX.length) < minYear) return;
    out = out.concat(readFromSs_(ss, n, LCOLS));
  });
  return out;
}

// ทุกคนสร้างใบลาใหม่ได้โดยไม่ต้องเข้าสู่ระบบ / แก้ไขใบลาเดิม หรือทำใบยกเลิกวันลา ต้องเข้าสู่ระบบ (เจ้าของใบลาหรือแอดมิน)
function saveLeave(a, l) {
  const guest = !(a && a.id);
  const u = guest ? null : auth_(a);
  if (guest && l.type === 'cancel') throw new Error('ใบยกเลิกวันลาต้องเข้าสู่ระบบก่อน (เพื่อยืนยันว่าเป็นเจ้าของใบลา)');
  if (!String(l.name || '').trim() || !l.s || !l.e) throw new Error('กรอกชื่อ วันที่เริ่มและวันที่สิ้นสุดก่อน');
  return locked_(() => {
    const ss = recSs_(), W = LCOLS.length, id = String(l.id).trim();
    const readAll = () => leaveSheets_(ss).map(sh => { const n = sh.getLastRow(); return { sh, v: n > 1 ? sh.getRange(2, 1, n - 1, W).getValues() : [] }; });

    // หาใบลาเดิม (อาจอยู่ชีตปีไหนก็ได้)
    let found = null;
    readAll().some(t => t.v.some((r, i) => {
      if (String(r[0]).trim() !== id) return false;
      found = { sh: t.sh, row: i + 2, name: cleanStr_(r[1]) };
      return true;
    }));

    if (guest) {
      if (found) throw new Error('แก้ไขใบลาเดิมต้องเข้าสู่ระบบก่อน');
    } else if (!u.admin && found && found.name !== u.name) {
      throw new Error('แก้ไขได้เฉพาะใบลาของตนเอง');
    } else if (!u.admin && !found && l.name !== u.name) {
      throw new Error('บันทึกได้เฉพาะใบลาของตนเอง');
    }

    // ชีตของปีงบตามวันที่เริ่มลา (แก้วันที่ข้ามปีงบ = ย้ายไปชีตปีใหม่)
    const target = sheet_(leaveSheetName_(l.s), LCOLS, true, ss);
    if (found && found.sh.getSheetId() !== target.getSheetId()) { found.sh.deleteRow(found.row); found = null; }
    const row = found ? found.row : Math.max(target.getLastRow() + 1, 2);
    const rng = target.getRange(row, 1, 1, W);
    rng.setNumberFormat('@');
    rng.setValues([rowOf_(LCOLS, l)]);

    // ใบยกเลิกวันลา: ทำเครื่องหมายยกเลิกใบลาเดิมที่ช่วงวันซ้อนกัน (ทุกปีงบ)
    if (l.type === 'cancel') {
      const ls = normDate_(l.s), le = normDate_(l.e), ci = LCOLS.indexOf('cancelled') + 1;
      readAll().forEach(t => t.v.forEach((r, i) => {
        if (String(r[0]).trim() === id || r[0] === '' || String(r[12]).toUpperCase() === 'TRUE') return;
        if (cleanStr_(r[1]) === l.name && cleanStr_(r[3]) === l.cty && normDate_(r[5]) <= le && normDate_(r[6]) >= ls) {
          t.sh.getRange(i + 2, ci).setValue('TRUE');
        }
      }));
    }
    clearCache_();
    return true;
  });
}

function deleteLeave(a, id) {
  const u = auth_(a);
  return locked_(() => {
    leaveSheets_(recSs_()).forEach(sh => {
      const n = sh.getLastRow();
      if (n < 2) return;
      const ids = sh.getRange(2, 1, n - 1, 2).getValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0]).trim() === String(id).trim()) {
          if (!u.admin && cleanStr_(ids[i][1]) !== u.name) throw new Error('ลบได้เฉพาะใบลาของตนเอง');
          sh.deleteRow(i + 2);
        }
      }
    });
    clearCache_();
    return true;
  });
}

function saveConfig(a, cfg) {
  const u = auth_(a);
  if (!u.admin) throw new Error('เฉพาะผู้ดูแลระบบ');
  locked_(() => {
    sheet_('Config', null, false).getRange('A1').setValue(JSON.stringify(cfg));
    clearCache_();
  });
  return true;
}

// ====================== ส่วน PDF (แก้ไขแล้ว) ======================

// แยก File ID ออกจากลิงก์ Drive หรือรับ ID ตรงๆ
function pdfId_(v) {
  const id = String(v == null ? '' : v).trim();
  const m = id.match(/[-\w]{25,}/);
  return m ? m[0] : id;
}

// รายการ ID ไฟล์ PDF ที่ตั้งค่าไว้ใน Config (ทุก key ใน cfg.pdf ไม่จำกัดเฉพาะ vac/sick/cancel)
function configuredPdfIds_() {
  let cfg = {};
  try { cfg = JSON.parse(getData()).cfg || {}; } catch (e) {}
  const p = cfg.pdf || {};
  return Object.keys(p).map(k => pdfId_(p[k])).filter(Boolean);
}

// อัปโหลด PDF ต้นฉบับ (เฉพาะแอดมิน) คืนค่า File ID
function uploadPdfTemplate(a, key, base64Data, filename) {
  const u = auth_(a);
  if (!u.admin) throw new Error('เฉพาะผู้ดูแลระบบ');
  if (!base64Data) throw new Error('ไม่พบข้อมูลไฟล์');
  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length > MAX_PDF_BYTES) throw new Error('ไฟล์ใหญ่เกิน 8 MB กรุณาบีบอัดไฟล์ก่อนอัปโหลด');
  const head = String.fromCharCode.apply(null, bytes.slice(0, 4).map(b => b & 255));
  if (head !== '%PDF') throw new Error('ไฟล์ที่เลือกไม่ใช่ PDF');
  const blob = Utilities.newBlob(bytes, 'application/pdf', filename || (key + '.pdf'));
  const file = DriveApp.createFile(blob);
  // เก็บไฟล์ PDF ต้นฉบับไว้ในโฟลเดอร์เดียวกับระบบ
  try { const fid = PropertiesService.getScriptProperties().getProperty('FOLDER_ID'); if (fid) file.moveTo(DriveApp.getFolderById(fid)); } catch (e) {}
  return file.getId();
}

// โหลด PDF ต้นฉบับเป็น base64 (เฉพาะไฟล์ที่ตั้งค่าไว้ในระบบ) และแคชไว้ 6 ชั่วโมง
function getPdfTemplateBase64(fileIdOrUrl) {
  if (!fileIdOrUrl) throw new Error('ยังไม่ได้ตั้งค่าไฟล์ PDF ต้นฉบับ');
  const id = pdfId_(fileIdOrUrl);
  if (!configuredPdfIds_().includes(id)) throw new Error('ไฟล์นี้ไม่ได้ตั้งค่าไว้ในระบบ (ตรวจ ID ในหน้าตั้งค่า)');
  const hit = cacheGet_('PDF:' + id);
  if (hit) return hit;
  let file;
  try {
    file = DriveApp.getFileById(id);
  } catch (e) {
    throw new Error('เปิดไฟล์ PDF ไม่ได้ ตรวจว่า ID ถูกต้องและไฟล์แชร์ให้เจ้าของสคริปต์แล้ว');
  }
  if (file.getSize() > MAX_PDF_BYTES) throw new Error('ไฟล์ PDF ต้นฉบับใหญ่เกิน 8 MB กรุณาบีบอัดไฟล์');
  const b64 = Utilities.base64Encode(file.getBlob().getBytes());
  cachePut_('PDF:' + id, b64, 21600, 90000);
  return b64;
}

// ---------- ตัวช่วยตรวจระบบ (รันใน Apps Script editor แล้วดู Execution log) ----------

// รันครั้งแรกครั้งเดียว เพื่อกดอนุญาตสิทธิ์ Drive
function authorizeDrive() {
  DriveApp.getRootFolder();
  Logger.log('อนุญาตสิทธิ์ Drive เรียบร้อย');
}

// ตรวจว่าไฟล์ PDF ที่ตั้งค่าไว้เปิดได้จริงหรือไม่
function checkPdfSetup() {
  let cfg = {};
  try { cfg = JSON.parse(getData()).cfg || {}; } catch (e) { Logger.log('อ่าน Config ไม่ได้: ' + e.message); return; }
  const p = cfg.pdf || {}, keys = Object.keys(p);
  if (!keys.length) { Logger.log('ยังไม่มี cfg.pdf ในชีต Config (ช่อง A1) ต้องตั้งค่าในหน้าแอดมินก่อน'); return; }
  keys.forEach(k => {
    try {
      const f = DriveApp.getFileById(pdfId_(p[k]));
      const kb = Math.round(f.getSize() / 1024);
      Logger.log(k + ' OK | ' + f.getName() + ' | ' + kb + ' KB | ' + f.getMimeType() + (f.getSize() > MAX_PDF_BYTES ? ' | ใหญ่เกินไป!' : ''));
    } catch (e) {
      Logger.log(k + ' ERROR | ' + pdfId_(p[k]) + ' | ' + e.message);
    }
  });
}
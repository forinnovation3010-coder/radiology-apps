// ====== ระบบจัดการคลังสินค้า X-ray (ฝั่งเซิร์ฟเวอร์) ======
// หน้าเว็บเปิดผ่าน Router.gs ด้วย ?page=xray

// ID ของชีตคลัง X-ray เก็บใน Script Properties (XRAY_SS_ID) — สร้างให้อัตโนมัติด้วย setupAll() ใน Setup.gs
const xss_ = () => propSs_('XRAY_SS_ID');

// ชีตใหม่ที่ระบบสร้างให้เอง
const X_HIST = 'History';     // ชื่อชีตประวัติแบบเดิม (ถ้ามี ยังอ่านได้)
const X_HIST_PREFIX = 'ประวัติ_ปีงบ';   // ประวัติแยกตามปีงบประมาณ (เริ่ม 1 ต.ค.) เช่น ประวัติ_ปีงบ2570
const X_BC = 'Barcodes';      // บาร์โค้ด → ชื่อรายการ (สแกนครั้งเดียว ระบบจำไว้)
const X_HIST_HEAD = ['เวลาบันทึก', 'วันที่ทำรายการ', 'ประเภท', 'ชื่อรายการ', 'คลัง', 'จำนวน', 'วันหมดอายุ', 'ผู้ทำรายการ', 'ใช้ที่ห้อง / หมายเหตุ'];
const X_INV_HEAD = ['ID', 'ชื่อรายการ', 'คลัง', 'จำนวน', 'วันหมดอายุ', 'ส่งอบได้', 'สถานที่ส่งอบ', 'ใช้ที่ห้อง', 'ผู้ทำรายการ', 'วันที่ทำรายการ', 'ขั้นต่ำ (แจ้งเตือนใกล้หมด)'];
const X_SQ_HEAD = ['ID', 'ชื่อรายการ', 'คลังต้นทาง', 'สถานที่ส่งอบ', 'ผู้ส่ง', 'วันที่ส่ง'];
const X_CFG_HEAD = ['ผู้ทำรายการ', 'ห้องที่นำไปใช้', 'คลัง'];
const X_TYPE = { IN: 'รับเข้า', OUT: 'เบิกใช้', RETURN: 'รับคืนจากอบ', DELETE: 'ลบออก' };

// ค้นหาชีตแบบเร็ว (ตรงชื่อก่อน ค่อยวนหาแบบไม่สนตัวพิมพ์) ถ้าไม่มีจึงสร้างใหม่
function getSheetSafely(ss, searchName) {
  let s = ss.getSheetByName(searchName);
  if (s) return s;
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === searchName.toLowerCase()) return sheets[i];
  }
  return ss.insertSheet(searchName);
}

// ชีตพร้อมหัวตาราง (ใส่หัวตารางให้ถ้ายังว่าง)
function sheetWithHead_(ss, name, head) {
  const sh = getSheetSafely(ss, name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// อ่านเฉพาะช่วงที่มีข้อมูลจริง (ไม่รวมหัวตาราง)
function readRows_(sheet, cols) {
  const lr = sheet.getLastRow();
  if (lr < 2) return [];
  return sheet.getRange(2, 1, lr - 1, cols).getDisplayValues();
}

// ลบแถว "ของหมด" (จำนวน 0) ของสินค้าเดียวกันในคลังเดียวกัน — ใช้ตอนรับของเข้ามาใหม่
function clearZeroRows_(invSheet, name, room) {
  const rows = readRows_(invSheet, 4);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === name && rows[i][2] === room && (parseInt(rows[i][3]) || 0) <= 0) invSheet.deleteRow(i + 2);
  }
}

const normCode_ = s => String(s == null ? '' : s).trim().replace(/^'/, '').replace(/^0+/, '');

function xlock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ปีงบ พ.ศ. ของวันที่ (yyyy-mm-dd) — ต.ค.-ธ.ค. นับเป็นปีงบถัดไป
function xFiscalBE_(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{1,2})/);
  let y, mo;
  if (m) { y = +m[1]; mo = +m[2]; if (y > 2400) y -= 543; }
  else { const t = new Date(); y = t.getFullYear(); mo = t.getMonth() + 1; }
  return (mo >= 10 ? y + 1 : y) + 543;
}

function historySheets_(ss) {
  return ss.getSheets().filter(sh => {
    const n = sh.getName();
    return n === X_HIST || (n.indexOf(X_HIST_PREFIX) === 0 && /^\d{4}$/.test(n.slice(X_HIST_PREFIX.length)));
  });
}

function logHistory_(ss, type, o) {
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  sheetWithHead_(ss, X_HIST_PREFIX + xFiscalBE_(o.date || now), X_HIST_HEAD).appendRow([
    now, o.date || now.slice(0, 10), X_TYPE[type] || type, o.name || '', o.room || '',
    o.qty === undefined ? '' : o.qty, o.exp || '', o.operator || '', o.note || ''
  ]);
}

function saveBarcode_(ss, code, name) {
  const nb = normCode_(code);
  if (!nb || !name) return;
  const sh = sheetWithHead_(ss, X_BC, ['Barcode', 'ชื่อรายการ']);
  const rows = readRows_(sh, 2);
  for (let i = 0; i < rows.length; i++) {
    if (normCode_(rows[i][0]) === nb) {
      if (rows[i][1] !== name) sh.getRange(i + 2, 2).setValue(name);
      return;
    }
  }
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, 2).setNumberFormat('@').setValues([[nb, name]]);   // เก็บเป็นข้อความ กันชีตแปลงเลขยาวเป็นเลขวิทยาศาสตร์
}

function getAppData() {
  try {
    const ss = xss_();
    if (!ss) return { success: false, error: "ไม่พบ Google Sheet" };

    const cfg = readRows_(sheetWithHead_(ss, "optionsConfig", X_CFG_HEAD), 3);
    let operators = [], roomsUsed = [], warehouses = [];
    cfg.forEach(r => {
      if (String(r[0]).trim()) operators.push(String(r[0]).trim());
      if (String(r[1]).trim()) roomsUsed.push(String(r[1]).trim());
      if (String(r[2]).trim()) warehouses.push(String(r[2]).trim());
    });

    // ชื่อผู้ทำรายการ = รายชื่อเจ้าหน้าที่ในระบบใบลา (แท็บ People) ถ้ายังไม่มีใครค่อยใช้รายชื่อใน optionsConfig
    try { const staff = (typeof qaStaff_ === "function") ? qaStaff_() : []; if (staff.length) operators = staff; } catch (e) {}
    if (!operators.length) operators = ["ณิชนันทน์", "ธิติ"];
    if (!roomsUsed.length) roomsUsed = ["ห้องฟลู", "ห้อง 2", "ห้อง 3", "ห้อง 6"];
    if (!warehouses.length) warehouses = ["คลังใหญ่", "คลังห้องMammogram", "คลังห้องFluoroscopy"];
    if (!warehouses.some(w => w.toLowerCase().includes("emergency"))) warehouses.push("รถ Emergency");

    const inventory = readRows_(sheetWithHead_(ss, "Inventory", X_INV_HEAD), 11).map(r => {
      let minQ = parseInt(r[10]);
      if (isNaN(minQ)) minQ = 0;
      return {
        id: r[0], name: r[1], room: r[2], qty: parseInt(r[3]) || 0, exp: r[4],
        canSterile: r[5], sterileLoc: r[6], usedRoom: r[7], operator: r[8], date: r[9],
        minQty: minQ
      };
    }).filter(i => String(i.id).trim() !== '');

    const sterileQueue = readRows_(sheetWithHead_(ss, "sterileQueue", X_SQ_HEAD), 6).map(r => ({
      id: r[0], name: r[1], originalRoom: r[2], sterileLoc: r[3], operator: r[4], sendDate: r[5]
    }));

    const barcodes = {};
    const bcSh = ss.getSheetByName(X_BC);
    if (bcSh) readRows_(bcSh, 2).forEach(r => { const nb = normCode_(r[0]); if (nb && r[1]) barcodes[nb] = r[1]; });

    return { success: true, operators, roomsUsed, warehouses, inventory, sterileQueue, barcodes };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function processStockTransaction(data) {
  try {
    const ss = xss_();
    const res = xlock_(() => {
      const invSheet = getSheetSafely(ss, "Inventory");
      const sterileSheet = getSheetSafely(ss, "sterileQueue");
      const qty = parseInt(data.qty);
      if (!(qty > 0)) return { success: false, message: "❌ จำนวนต้องมากกว่า 0" };

      if (data.actionType === "IN") {
        // ใช้ค่า "ขั้นต่ำ" (คอลัมน์ K) เดิมของรายการเดียวกันในคลังเดียวกัน ถ้ามี
        let minQ = '';
        readRows_(invSheet, 11).some(r => {
          if (r[1] === data.name && r[2] === data.room && String(r[10]).trim() !== '') { minQ = r[10]; return true; }
          return false;
        });
        clearZeroRows_(invSheet, data.name, data.room);
        invSheet.appendRow([
          new Date().getTime(), data.name, data.room, qty, data.expiryDate,
          data.canSterile ? "YES" : "NO", data.sterileLocation || "", data.usedRoom || "", data.operator, data.transactionDate, minQ
        ]);
        if (data.barcode) saveBarcode_(ss, data.barcode, data.name);
        logHistory_(ss, 'IN', { date: data.transactionDate, name: data.name, room: data.room, qty: qty, exp: data.expiryDate, operator: data.operator });
        return { success: true, message: "รับเข้าเรียบร้อย ✨" };
      }

      const lr = invSheet.getLastRow();
      const invData = lr < 1 ? [] : invSheet.getRange(1, 1, lr, 11).getValues();
      let foundRow = -1;
      let currentQty = 0;
      for (let i = 1; i < invData.length; i++) {
        if (String(invData[i][0]).trim() === String(data.id).trim()) {
          foundRow = i + 1;
          currentQty = parseInt(invData[i][3]) || 0;
          break;
        }
      }

      if (foundRow === -1) return { success: false, message: "❌ ไม่พบรายการนี้ในคลัง (อาจมีคนเบิกไปแล้ว) ลองโหลดข้อมูลใหม่" };
      if (currentQty < qty) return { success: false, message: "❌ ของไม่พอเบิก (เหลือ " + currentQty + ")" };

      const row = invData[foundRow - 1];
      const newQty = currentQty - qty;
      if (newQty > 0) invSheet.getRange(foundRow, 4).setValue(newQty);
      else {
        // ล็อตสุดท้ายของสินค้านี้ในคลังนี้: เก็บแถวไว้เป็นจำนวน 0 เพื่อให้หน้าเว็บแจ้งเตือนว่า "หมด"
        // ถ้ายังมีล็อตอื่นเหลือ ลบแถวนี้ทิ้งตามเดิม
        const hasOther = invData.some((r, i) => i > 0 && i !== foundRow - 1 && r[1] === row[1] && r[2] === row[2]);
        if (hasOther) invSheet.deleteRow(foundRow);
        else invSheet.getRange(foundRow, 4).setValue(0);
      }

      const expTxt = row[4] instanceof Date ? Utilities.formatDate(row[4], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(row[4] || '');
      logHistory_(ss, 'OUT', { date: data.transactionDate, name: row[1], room: data.room, qty: qty, exp: expTxt, operator: data.operator, note: data.usedRoom || '' });

      let triggerSterile = false;
      const targetSterileLoc = row[6] || "ศูนย์เครื่องมือกลาง";
      if ((data.room.includes("ฟลู") || data.room.includes("Fluoroscopy")) && row[5] === "YES") {
        triggerSterile = true;
        sterileSheet.appendRow([new Date().getTime(), row[1], data.room, targetSterileLoc, data.operator, data.transactionDate]);
      }
      return { success: true, message: "เบิกใช้สำเร็จ ✨", triggerSterile: triggerSterile, sterileLoc: targetSterileLoc };
    });
    if (res.success) res.data = getAppData();
    return res;
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  }
}

function returnFromSterile(id, newExpiryDate, returnOperator) {
  try {
    const ss = xss_();
    const res = xlock_(() => {
      const sterileSheet = getSheetSafely(ss, "sterileQueue");
      const invSheet = getSheetSafely(ss, "Inventory");

      const lr = sterileSheet.getLastRow();
      const sterileData = lr < 1 ? [] : sterileSheet.getRange(1, 1, lr, 6).getValues();
      let targetRow = -1, itemInfo = null;
      for (let i = 1; i < sterileData.length; i++) {
        if (sterileData[i][0] == id) {
          targetRow = i + 1;
          itemInfo = { name: sterileData[i][1], originalRoom: sterileData[i][2], sterileLoc: sterileData[i][3] };
          break;
        }
      }

      if (targetRow === -1) return { success: false, message: "ไม่พบรายการรออบ" };
      sterileSheet.deleteRow(targetRow);

      const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
      clearZeroRows_(invSheet, itemInfo.name, itemInfo.originalRoom);
      invSheet.appendRow([new Date().getTime(), itemInfo.name, itemInfo.originalRoom, 1, newExpiryDate, "YES", itemInfo.sterileLoc, "", returnOperator || "ไม่ระบุ", todayStr]);
      logHistory_(ss, 'RETURN', { date: todayStr, name: itemInfo.name, room: itemInfo.originalRoom, qty: 1, exp: newExpiryDate, operator: returnOperator || 'ไม่ระบุ', note: 'อบจาก ' + itemInfo.sterileLoc });
      return { success: true, message: "รับคืนเข้าคลังเรียบร้อย ✨" };
    });
    if (res.success) res.data = getAppData();
    return res;
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  }
}

function deleteInventoryItem(id, operator) {
  try {
    const ss = xss_();
    const res = xlock_(() => {
      const invSheet = getSheetSafely(ss, "Inventory");
      const lr = invSheet.getLastRow();
      if (lr < 2) return { success: false, message: 'ไม่พบรายการ' };
      const rows = invSheet.getRange(1, 1, lr, 5).getDisplayValues();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) {
          invSheet.deleteRow(i + 1);
          logHistory_(ss, 'DELETE', { name: rows[i][1], room: rows[i][2], qty: rows[i][3], exp: rows[i][4], operator: operator || '', note: 'ลบล็อตออกจากคลัง' });
          return { success: true };
        }
      }
      return { success: false, message: 'ไม่พบรายการ' };
    });
    if (res.success) res.data = getAppData();
    return res;
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ผูกบาร์โค้ดกับชื่อสินค้า (ใช้กับของที่มีในคลังแล้วแต่ยังไม่เคยสแกน)
function linkBarcode(code, name) {
  try {
    const nb = normCode_(code), nm = String(name || '').trim();
    if (!nb) return { success: false, message: 'ไม่มีเลขบาร์โค้ด' };
    if (!nm) return { success: false, message: 'กรุณาระบุชื่อสินค้า' };
    const ss = xss_();
    xlock_(() => saveBarcode_(ss, nb, nm));
    return { success: true, barcodes: getAppData().barcodes || {} };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ยกเลิกการผูกบาร์โค้ด
function unlinkBarcode(code) {
  try {
    const nb = normCode_(code);
    const ss = xss_();
    xlock_(() => {
      const sh = ss.getSheetByName(X_BC);
      if (!sh) return;
      const rows = readRows_(sh, 1);
      for (let i = rows.length - 1; i >= 0; i--) if (normCode_(rows[i][0]) === nb) sh.deleteRow(i + 2);
    });
    return { success: true, barcodes: getAppData().barcodes || {} };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// ประวัติล่าสุด (ใหม่สุดก่อน) อ่านต่อกันจากชีตปีงบล่าสุดย้อนลงไป
function getHistory(limit) {
  try {
    const max = Math.max(50, Math.min(+limit || 500, 3000));
    const rows = [];
    let total = 0;
    historySheets_(xss_()).forEach(sh => {
      const lr = sh.getLastRow();
      if (lr < 2) return;
      total += lr - 1;
      const n = Math.min(lr - 1, max);
      const v = sh.getRange(lr - n + 1, 1, n, 9).getDisplayValues();
      v.forEach(r => { if (r[2]) rows.push({ ts: r[0], date: r[1], type: r[2], name: r[3], room: r[4], qty: r[5], exp: r[6], operator: r[7], note: r[8] }); });
    });
    rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return { success: true, rows: rows.slice(0, max), total: total };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function saveEmergencyCheck(operator, checkResults) {
  try {
    const ss = xss_();
    const logSheet = getSheetSafely(ss, "EmergencyLogs");
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(["วันที่ตรวจ", "ผู้ตรวจสอบ", "สถานะ", "รายละเอียดการตรวจ (เช็คลิสต์)"]);
    }

    let status = "✅ ของครบถ้วน";
    if (checkResults.includes("ขาด:") && !checkResults.endsWith("ขาด:\nไม่มี")) status = "⚠️ ของไม่ครบ";
    else if (checkResults === "ไม่มีรายการสินค้าให้ตรวจ") status = "⚪ ไม่มีสินค้า";

    logSheet.appendRow([todayStr, operator, status, checkResults]);
    return { success: true, message: "บันทึกการตรวจสต๊อกรถ Emergency เรียบร้อยแล้ว 🚑✨" };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function getEmergencyLogs(targetYear) {
  try {
    const ss = xss_();
    const logSheet = getSheetSafely(ss, "EmergencyLogs");
    const lr = logSheet.getLastRow();
    if (lr < 2) return { success: true, logs: [] };
    const data = logSheet.getRange(2, 1, lr - 1, 4).getDisplayValues();

    const logs = [];
    for (let i = 0; i < data.length; i++) {
      const dateStr = data[i][0];
      if (!targetYear || dateStr.includes(targetYear)) {
        logs.push({ date: dateStr, operator: data[i][1], status: data[i][2], details: data[i][3] });
      }
    }
    return { success: true, logs: logs };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

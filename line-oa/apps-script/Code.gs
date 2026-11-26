/**
 * ====== LINE OA ตอบอัตโนมัติ — NEURO INTERVENTION รพ.ระยอง (โปรเจกต์แยก) ======
 * - แชต 1:1 (คนทั่วไป/ผู้ป่วย/ญาติ)  → ตอบอัตโนมัติตามคำค้น / ข้อความค่าเริ่มต้น (ส่งรูปได้)
 * - แชตกลุ่ม / ห้องแชต               → ไม่ตอบ (ยกเว้นพิมพ์ #groupid เพื่อขอ Group ID)
 * - ส่งต่อข้อความระหว่างกลุ่มด้วยคำสั่ง เช่น #ส่งต่อ (MT Rayong → INR)
 * - ลิงก์ /exec เดียวใช้ได้ 2 อย่าง: Webhook URL ของ LINE (doPost) + หน้าตั้งค่า (doGet)
 * - ข้อมูลเก็บในชีต "ข้อมูล LINE OA" (ระบบสร้างเองใน My Drive ครั้งแรกที่ใช้)
 *
 * ติดตั้ง: ดู README.md ในโฟลเดอร์ line-oa/ บน GitHub
 *
 * Script properties:
 *   LINE_TOKEN     = Channel access token (long-lived) ของ OA  ← ต้องใส่เอง ห้ามใส่ในโค้ด
 *   LINE_ADMIN_PIN = (ไม่บังคับ) PIN เข้าหน้าตั้งค่า ถ้าว่าง = ไม่ต้องใส่ PIN
 *   LINE_SS_ID     = ID ชีตข้อมูล (ระบบตั้งให้เอง)
 */

const LINE_CFG = {
  TZ: 'Asia/Bangkok',
  SH_RULES: 'AutoReply',
  SH_SETTINGS: 'Settings',
  SH_GROUPS: 'Groups',
  SH_LOG: 'Log',
  SH_FORWARD: 'Forward',
  CACHE_KEY: 'line_config_v1',
  MATCH_CONTAINS: 'มีคำนี้อยู่',
  MATCH_EXACT: 'ตรงทั้งคำ'
};

const LINE_HEADERS = {
  RULES: ['คำค้น (คั่นด้วย ,)', 'วิธีจับคู่', 'ข้อความตอบกลับ', 'เปิดใช้', 'ลิงก์รูป (บรรทัดละ 1 รูป)'],
  SETTINGS: ['key', 'value', 'คำอธิบาย'],
  GROUPS: ['ID', 'ประเภท', 'ชื่อกลุ่ม', 'พบล่าสุด'],
  LOG: ['เวลา', 'แหล่ง', 'เหตุการณ์', 'ผลลัพธ์'],
  FORWARD: ['ต้นทาง ID', 'ชื่อต้นทาง', 'ปลายทาง ID', 'ชื่อปลายทาง', 'คำสั่งขึ้นต้น (ว่าง = ทุกข้อความ)', 'เปิดใช้']
};

const LINE_DEFAULT_SETTINGS = [
  ['WELCOME_MSG',
    'สวัสดีค่ะ ขอบคุณที่เพิ่มเพื่อนกับ NEURO INTERVENTION รพ.ระยอง 😊\nกดเมนูด้านล่างเพื่อดูข้อมูลก่อน ระหว่าง และหลังทำหัตถการได้เลยค่ะ',
    'ข้อความเมื่อมีคนเพิ่มเพื่อน'],
  ['DEFAULT_MSG',
    'ขอบคุณที่ติดต่อมาค่ะ 🙏\nกดเมนูด้านล่างเพื่อดูข้อมูลได้เลย\nหากต้องการสอบถามเพิ่มเติม เจ้าหน้าที่จะตอบกลับในเวลาราชการค่ะ',
    'ข้อความเมื่อไม่ตรงกับคำค้นไหนเลย'],
  ['DEFAULT_ON', 'TRUE', 'TRUE = ตอบข้อความค่าเริ่มต้น / FALSE = ไม่ตอบ'],
  ['COOLDOWN_MIN', '30', 'ตอบข้อความค่าเริ่มต้นซ้ำคนเดิมได้ทุกกี่นาที (0 = ตอบทุกครั้ง)'],
  ['LOG_ON', 'TRUE', 'บันทึกประวัติลงชีต Log (ไม่บันทึกเนื้อหาข้อความ)'],
  ['FORWARD_ACK', 'TRUE', 'TRUE = บอทตอบในกลุ่มต้นทางว่า "ส่งต่อแล้ว"']
];

const LINE_SAMPLE_RULES = [
  ['ก่อนทำหัตถการ', LINE_CFG.MATCH_CONTAINS, 'ข้อมูลการเตรียมตัวก่อนทำหัตถการ\n(แก้ข้อความนี้ในหน้าแอดมิน)', true, ''],
  ['ระหว่างทำหัตถการ', LINE_CFG.MATCH_CONTAINS, 'ข้อมูลระหว่างทำหัตถการ\n(แก้ข้อความนี้ในหน้าแอดมิน)', true, ''],
  ['หลังทำหัตถการ', LINE_CFG.MATCH_CONTAINS, 'การดูแลตัวเองหลังทำหัตถการ\n(แก้ข้อความนี้ในหน้าแอดมิน)', true, ''],
  ['ติดต่อ, เบอร์โทร, โทร', LINE_CFG.MATCH_CONTAINS, 'ติดต่อเจ้าหน้าที่\n(ใส่เบอร์โทร/เวลาทำการ)', true, '']
];

const LINE_EDITABLE_KEYS = ['WELCOME_MSG', 'DEFAULT_MSG', 'DEFAULT_ON', 'COOLDOWN_MIN', 'LOG_ON', 'FORWARD_ACK'];
const LINE_FORWARD_PREFIX = '#ส่งต่อ';

/* ============================================================
 * ชีตข้อมูล: สร้างให้เองครั้งแรก (ไม่ต้องกด Run อะไร)
 * ============================================================ */
let _lineSs = null;
function lineSs_() {
  if (_lineSs) return _lineSs;
  const P = PropertiesService.getScriptProperties();
  const id = P.getProperty('LINE_SS_ID');
  if (id) { try { return (_lineSs = SpreadsheetApp.openById(id)); } catch (e) {} }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id2 = P.getProperty('LINE_SS_ID');
    if (id2) { try { return (_lineSs = SpreadsheetApp.openById(id2)); } catch (e) {} }
    const ss = SpreadsheetApp.create('ข้อมูล LINE OA');
    lineEnsureSheet_(ss, LINE_CFG.SH_RULES, LINE_HEADERS.RULES, LINE_SAMPLE_RULES);
    lineEnsureSheet_(ss, LINE_CFG.SH_SETTINGS, LINE_HEADERS.SETTINGS, LINE_DEFAULT_SETTINGS);
    lineEnsureSheet_(ss, LINE_CFG.SH_FORWARD, LINE_HEADERS.FORWARD, []);
    lineEnsureSheet_(ss, LINE_CFG.SH_GROUPS, LINE_HEADERS.GROUPS, []);
    lineEnsureSheet_(ss, LINE_CFG.SH_LOG, LINE_HEADERS.LOG, []);
    ss.getSheets().forEach(sh => {
      if (ss.getSheets().length > 1 && /^(Sheet|ชีต|แผ่นงาน)\s*1$/.test(sh.getName()) && sh.getLastRow() === 0) ss.deleteSheet(sh);
    });
    P.setProperty('LINE_SS_ID', ss.getId());
    return (_lineSs = ss);
  } finally {
    lock.releaseLock();
  }
}

/** กด Run ครั้งเดียวหลังอัปเดต: อนุญาตสิทธิ์เชื่อมต่อภายนอก + เช็ก token + สร้างชีต */
function lineAuthorize() {
  const ss = lineSs_();
  Logger.log('📗 ชีตข้อมูล LINE OA: ' + ss.getUrl());
  const t = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
  if (!t) { Logger.log('⚠️ ยังไม่ได้ใส่ LINE_TOKEN ใน Script properties'); return; }
  const info = lineApiGet_('https://api.line.me/v2/bot/info');
  Logger.log('✅ เชื่อมต่อ LINE OA ได้: ' + (info.displayName || '') + ' ' + (info.basicId || ''));
  Logger.log('🔗 Webhook URL: ' + ScriptApp.getService().getUrl());
}

function lineEnsureSheet_(ss, name, headers, rows) {
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows && rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  return sh;
}

/* ============================================================
 * WEBHOOK จาก LINE
 * ============================================================ */
/* ============================================================
 * ทางเข้า: doGet = หน้าตั้งค่า, doPost = Webhook จาก LINE
 * ============================================================ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('LINE OA ตอบอัตโนมัติ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  // หน้าตั้งค่าบน GitHub Pages เรียกผ่าน fetch (เลี่ยงปัญหาล็อกอิน Google หลายบัญชี)
  if (body && body.fn) return lineApi_(body);
  return lineWebhook_(body);   // Webhook จาก LINE
}

const LINE_API_FUNCS = ['lineAdminLoad', 'lineAdminSave', 'lineAdminTestPush', 'lineAdminChangePin'];

function lineApi_(req) {
  let out;
  try {
    if (LINE_API_FUNCS.indexOf(req.fn) < 0) throw new Error('ไม่พบคำสั่ง: ' + req.fn);
    out = { ok: true, result: globalThis[req.fn].apply(null, req.args || []) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function lineWebhook_(body) {
  try {
    const events = (body && body.events) || [];
    if (events.length) {
      const conf = lineGetConfig_();
      const logRows = [];
      events.forEach(function (ev) {
        let result = '';
        try {
          result = lineHandleEvent_(ev, conf);
        } catch (err) {
          result = 'error: ' + String(err && err.message || err).slice(0, 200);
        }
        if (result) logRows.push([new Date(), (ev.source && ev.source.type) || '', ev.type || '', result]);
      });
      lineWriteLog_(conf, logRows);
    }
  } catch (err) {
    console.error('LINE webhook error: ' + err);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** คืนค่าข้อความสั้น ๆ สำหรับ Log (ห้ามใส่เนื้อหาข้อความผู้ใช้) */
function lineHandleEvent_(ev, conf) {
  const src = ev.source || {};

  // ---------- กลุ่ม / ห้องแชต : ไม่ตอบอัตโนมัติ ----------
  if (src.type === 'group' || src.type === 'room') {
    const id = src.groupId || src.roomId;
    lineRememberGroup_(id, src.type);
    if (ev.type === 'message' && ev.message && ev.message.type === 'text' &&
        lineNorm_(ev.message.text) === '#groupid') {
      lineReply_(ev.replyToken, [{ type: 'text', text: (src.type === 'group' ? 'Group ID' : 'Room ID') + ':\n' + id }]);
      return 'groupid';
    }
    if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
      const fw = lineForward_(ev, id, conf);
      if (fw) return fw;
    }
    return ev.type === 'join' ? 'joined-group' : ''; // ข้อความปกติในกลุ่ม ไม่ตอบ ไม่ log
  }

  if (src.type !== 'user') return '';

  // ---------- แชต 1:1 ----------
  if (ev.type === 'follow') {
    const msg = conf.settings.WELCOME_MSG;
    if (msg) { lineReply_(ev.replyToken, lineToMessages_(msg)); return 'welcome'; }
    return 'welcome-empty';
  }

  if (ev.type === 'message') {
    if (ev.message && ev.message.type === 'text') {
      const rule = lineFindRule_(ev.message.text, conf.rules);
      if (rule) { lineReply_(ev.replyToken, lineRuleMessages_(rule)); return 'rule: ' + rule.keywords; }
    }
    return lineReplyDefault_(ev, conf); // ไม่ตรงคำค้น หรือส่งสติกเกอร์/รูป
  }

  if (ev.type === 'postback' && ev.postback) {
    const rule = lineFindRule_(ev.postback.data, conf.rules);
    if (rule) { lineReply_(ev.replyToken, lineRuleMessages_(rule)); return 'postback: ' + rule.keywords; }
    return 'postback-nomatch';
  }

  return '';
}

function lineReplyDefault_(ev, conf) {
  const s = conf.settings;
  if (!lineIsTrue_(s.DEFAULT_ON)) return 'default-off';
  if (!s.DEFAULT_MSG) return 'default-empty';
  const uid = (ev.source && ev.source.userId) || '';
  const min = Math.max(0, Number(s.COOLDOWN_MIN) || 0);
  if (min > 0 && uid) {
    const cache = CacheService.getScriptCache();
    const key = 'line_cd_' + uid;
    if (cache.get(key)) return 'default-cooldown';
    cache.put(key, '1', Math.min(21600, Math.round(min * 60)));
  }
  lineReply_(ev.replyToken, lineToMessages_(s.DEFAULT_MSG));
  return 'default';
}

/* ============================================================
 * ส่งต่อข้อความระหว่างกลุ่ม
 * ============================================================ */
function lineForward_(ev, fromId, conf) {
  const rules = (conf.forwards || []).filter(function (f) { return f.active && f.fromId === fromId && f.toId; });
  if (!rules.length) return '';
  const raw = String(ev.message.text || '').trim();
  const sent = [], failed = [];
  let needText = false;

  rules.forEach(function (f) {
    let body = raw;
    if (f.prefix) {
      if (lineNorm_(raw).indexOf(lineNorm_(f.prefix)) !== 0) return;
      body = raw.slice(f.prefix.length).trim();
      if (!body) { needText = true; return; }
    }
    const who = lineMemberName_(fromId, ev.source.userId);
    const head = '📨 ส่งต่อจาก ' + (f.fromName || 'กลุ่ม') + (who ? ' • ' + who : '');
    try {
      lineApiPost_('https://api.line.me/v2/bot/message/push', {
        to: f.toId,
        messages: [{ type: 'text', text: (head + '\n' + body).slice(0, 5000) }]
      });
      sent.push(f.toName || 'ปลายทาง');
    } catch (err) {
      failed.push(f.toName || 'ปลายทาง');
      console.error('forward error: ' + err);
    }
  });

  if (sent.length || failed.length) {
    const lines = [];
    if (sent.length && lineIsTrue_(conf.settings.FORWARD_ACK)) lines.push('✅ ส่งต่อไป ' + sent.join(', ') + ' แล้ว');
    if (failed.length) lines.push('⚠️ ส่งต่อไป ' + failed.join(', ') + ' ไม่สำเร็จ (โควตาข้อความอาจหมด หรือบอทไม่ได้อยู่ในกลุ่มนั้น)');
    if (lines.length) { try { lineReply_(ev.replyToken, [{ type: 'text', text: lines.join('\n') }]); } catch (e) {} }
    return 'forward ok ' + sent.length + ' fail ' + failed.length;
  }
  if (needText) {
    try { lineReply_(ev.replyToken, [{ type: 'text', text: 'พิมพ์ข้อความต่อท้ายคำสั่งด้วยนะคะ เช่น\n' + rules[0].prefix + ' ห้อง 2 ขอ sheath 6F' }]); } catch (e) {}
    return 'forward-empty';
  }
  return '';
}

/** ชื่อคนส่งในกลุ่ม (cache 6 ชม.) */
function lineMemberName_(groupId, userId) {
  if (!groupId || !userId) return '';
  const cache = CacheService.getScriptCache();
  const key = 'line_m_' + groupId.slice(-10) + userId.slice(-12);
  const hit = cache.get(key);
  if (hit) return hit === '-' ? '' : hit;
  let name = '';
  try { name = lineApiGet_('https://api.line.me/v2/bot/group/' + groupId + '/member/' + userId).displayName || ''; } catch (e) {}
  cache.put(key, name || '-', 21600);
  return name;
}

/* ============================================================
 * จับคู่คำค้น
 * ============================================================ */
function lineNorm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function lineFindRule_(text, rules) {
  const t = lineNorm_(text);
  if (!t) return null;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r.active) continue;
    const kws = String(r.keywords).split(/[,，]/).map(lineNorm_).filter(Boolean);
    const hit = r.match === LINE_CFG.MATCH_EXACT
      ? kws.some(function (k) { return t === k; })
      : kws.some(function (k) { return t.indexOf(k) > -1; });
    if (hit) return r;
  }
  return null;
}

/** แยกข้อความด้วยบรรทัด --- เป็นหลายบับเบิล (LINE รับสูงสุด 5) */
function lineToMessages_(text) {
  return String(text || '')
    .split(/\r?\n\s*---\s*\r?\n/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean)
    .slice(0, 5)
    .map(function (s) { return { type: 'text', text: s.slice(0, 5000) }; });
}

/** ข้อความ + รูปของคำตอบหนึ่งข้อ (รวมไม่เกิน 5 บับเบิล ข้อความก่อน รูปตาม) */
function lineRuleMessages_(rule) {
  const msgs = lineToMessages_(rule.reply);
  lineParseImages_(rule.images).forEach(function (u) {
    msgs.push({ type: 'image', originalContentUrl: u, previewImageUrl: u });
  });
  return msgs.slice(0, 5);
}

/** แปลงข้อความหลายบรรทัดเป็นรายการลิงก์รูป https (รองรับลิงก์แชร์ Google Drive) */
function lineParseImages_(text) {
  return String(text || '').split(/[\r\n]+/).map(function (s) { return s.trim(); }).filter(Boolean)
    .map(lineImageUrl_).filter(Boolean);
}

function lineImageUrl_(u) {
  u = String(u || '').trim();
  if (/drive\.google\.com|docs\.google\.com/.test(u)) {
    const m = u.match(/\/d\/([\w-]{10,})/) || u.match(/[?&]id=([\w-]{10,})/);
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : '';
  }
  return /^https:\/\/\S+$/i.test(u) ? u : '';
}

function lineIsTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/* ============================================================
 * อ่านการตั้งค่า (cache 10 นาที)
 * ============================================================ */
function lineGetConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(LINE_CFG.CACHE_KEY);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const conf = lineReadConfig_();
  try { cache.put(LINE_CFG.CACHE_KEY, JSON.stringify(conf), 600); } catch (e) {}
  return conf;
}

function lineReadConfig_() {
  const ss = lineSs_();
  const settings = {};
  LINE_DEFAULT_SETTINGS.forEach(function (r) { settings[r[0]] = String(r[1]); });
  const st = ss.getSheetByName(LINE_CFG.SH_SETTINGS);
  if (st && st.getLastRow() > 1) {
    st.getRange(2, 1, st.getLastRow() - 1, 2).getValues().forEach(function (r) {
      const k = String(r[0] || '').trim();
      if (k) settings[k] = String(r[1] == null ? '' : r[1]);
    });
  }
  const rules = [];
  const sr = ss.getSheetByName(LINE_CFG.SH_RULES);
  if (sr && sr.getLastRow() > 1) {
    sr.getRange(2, 1, sr.getLastRow() - 1, 5).getValues().forEach(function (r) {
      const kw = String(r[0] || '').trim();
      const reply = String(r[2] || '').trim();
      const images = String(r[4] || '').trim();
      if (!kw || (!reply && !images)) return;
      const m = String(r[1] || '').trim() === LINE_CFG.MATCH_EXACT ? LINE_CFG.MATCH_EXACT : LINE_CFG.MATCH_CONTAINS;
      rules.push({ keywords: kw, match: m, reply: reply, active: r[3] === '' ? true : lineIsTrue_(r[3]), images: images });
    });
  }
  const forwards = [];
  const sf = ss.getSheetByName(LINE_CFG.SH_FORWARD);
  if (sf && sf.getLastRow() > 1) {
    sf.getRange(2, 1, sf.getLastRow() - 1, 6).getValues().forEach(function (r) {
      const fromId = String(r[0] || '').trim(), toId = String(r[2] || '').trim();
      if (!fromId || !toId) return;
      forwards.push({
        fromId: fromId, fromName: String(r[1] || ''),
        toId: toId, toName: String(r[3] || ''),
        prefix: String(r[4] || '').trim(),
        active: r[5] === '' ? true : lineIsTrue_(r[5])
      });
    });
  }
  return { settings: settings, rules: rules, forwards: forwards };
}

/* ============================================================
 * จำกลุ่มไลน์ (เขียนชีตไม่เกิน 1 ครั้ง / กลุ่ม / 6 ชม.)
 * ============================================================ */
function lineRememberGroup_(id, type) {
  if (!id) return;
  const cache = CacheService.getScriptCache();
  if (cache.get('line_g_' + id)) return;
  cache.put('line_g_' + id, '1', 21600);

  let name = '';
  if (type === 'group') {
    try { name = lineApiGet_('https://api.line.me/v2/bot/group/' + id + '/summary').groupName || ''; } catch (e) {}
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = lineEnsureSheet_(lineSs_(), LINE_CFG.SH_GROUPS, LINE_HEADERS.GROUPS, []);
    const last = sh.getLastRow();
    const data = last > 1 ? sh.getRange(2, 1, last - 1, 4).getValues() : [];
    const idx = data.findIndex(function (r) { return String(r[0]) === id; });
    if (idx > -1) {
      sh.getRange(idx + 2, 2, 1, 3).setValues([[type, name || data[idx][2], new Date()]]);
    } else {
      sh.appendRow([id, type, name, new Date()]);
    }
  } finally {
    lock.releaseLock();
  }
}

function lineWriteLog_(conf, rows) {
  if (!rows.length || !lineIsTrue_(conf.settings.LOG_ON)) return;
  try {
    const sh = lineEnsureSheet_(lineSs_(), LINE_CFG.SH_LOG, LINE_HEADERS.LOG, []);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  } catch (e) {
    console.error('log error: ' + e);
  }
}

/* ============================================================
 * LINE API
 * ============================================================ */
function lineToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
  if (!t) throw new Error('ยังไม่ได้ตั้ง LINE_TOKEN ใน Script properties');
  return t;
}

function lineReply_(replyToken, messages) {
  if (!replyToken || !messages || !messages.length) return;
  lineApiPost_('https://api.line.me/v2/bot/message/reply', { replyToken: replyToken, messages: messages });
}

function lineApiPost_(url, payload) {
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + lineToken_() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error('LINE ' + code + ': ' + res.getContentText().slice(0, 300));
  return res.getContentText();
}

function lineApiGet_(url) {
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + lineToken_() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('LINE ' + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

/* ============================================================
 * หน้าแอดมิน
 * ============================================================ */
function lineCheckPin_(pin) {
  const p = PropertiesService.getScriptProperties().getProperty('LINE_ADMIN_PIN') || '';
  if (p && String(pin || '') !== p) {
    Utilities.sleep(800); // กันเดา PIN รัว ๆ
    throw new Error('PIN ไม่ถูกต้อง');
  }
  return p;
}

/** โหลดครั้งเดียวได้ทุกอย่างที่หน้าแรกต้องใช้ */
function lineAdminLoad(pin) {
  const p = lineCheckPin_(pin);
  const conf = lineReadConfig_();
  const settings = {};
  LINE_EDITABLE_KEYS.forEach(function (k) { settings[k] = conf.settings[k]; });
  settings.DEFAULT_ON = lineIsTrue_(settings.DEFAULT_ON);
  settings.LOG_ON = lineIsTrue_(settings.LOG_ON);
  settings.FORWARD_ACK = lineIsTrue_(settings.FORWARD_ACK);
  settings.COOLDOWN_MIN = Number(settings.COOLDOWN_MIN) || 0;

  const sh = lineSs_().getSheetByName(LINE_CFG.SH_GROUPS);
  const groups = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
      if (!r[0]) return;
      groups.push({
        id: String(r[0]),
        type: String(r[1] || ''),
        name: String(r[2] || ''),
        lastSeen: r[3] instanceof Date ? Utilities.formatDate(r[3], LINE_CFG.TZ, 'dd/MM/yyyy HH:mm') : String(r[3] || '')
      });
    });
  }
  return {
    settings: settings,
    rules: conf.rules,
    forwards: conf.forwards,
    forwardPrefix: LINE_FORWARD_PREFIX,
    groups: groups,
    tokenSet: !!PropertiesService.getScriptProperties().getProperty('LINE_TOKEN'),
    webhookUrl: ScriptApp.getService().getUrl() || '',
    pinSet: !!p,
    sheetUrl: lineSs_().getUrl()
  };
}

function lineAdminSave(pin, data) {
  lineCheckPin_(pin);
  if (!data || !Array.isArray(data.rules)) throw new Error('ข้อมูลไม่ถูกต้อง');

  const rules = data.rules.map(function (r) {
    return [
      String(r.keywords || '').trim(),
      r.match === LINE_CFG.MATCH_EXACT ? LINE_CFG.MATCH_EXACT : LINE_CFG.MATCH_CONTAINS,
      String(r.reply || '').trim(),
      !!r.active,
      String(r.images || '').split(/[\r\n]+/).map(function (s) { return s.trim(); }).filter(Boolean).join('\n')
    ];
  }).filter(function (r) { return r[0] || r[2] || r[4]; });
  rules.forEach(function (r, i) {
    if (!r[0]) throw new Error('คำตอบข้อ ' + (i + 1) + ' ยังไม่มีคำค้น');
    if (!r[2] && !r[4]) throw new Error('คำตอบข้อ ' + (i + 1) + ' ต้องมีข้อความหรือรูปอย่างน้อย 1 อย่าง');
    r[4].split('\n').filter(Boolean).forEach(function (u) {
      if (!lineImageUrl_(u)) throw new Error('คำตอบข้อ ' + (i + 1) + ' ลิงก์รูปไม่ถูกต้อง: ' + u.slice(0, 60) + ' (ต้องขึ้นต้นด้วย https://)');
    });
  });

  const s = data.settings || {};
  const cooldown = Math.max(0, Math.min(360, Math.round(Number(s.COOLDOWN_MIN) || 0)));
  const newSettings = {
    WELCOME_MSG: String(s.WELCOME_MSG || '').trim(),
    DEFAULT_MSG: String(s.DEFAULT_MSG || '').trim(),
    DEFAULT_ON: s.DEFAULT_ON ? 'TRUE' : 'FALSE',
    COOLDOWN_MIN: String(cooldown),
    LOG_ON: s.LOG_ON ? 'TRUE' : 'FALSE',
    FORWARD_ACK: s.FORWARD_ACK ? 'TRUE' : 'FALSE'
  };

  // --- ส่งต่อข้อความ: เติมชื่อกลุ่มจากชีต Groups ---
  const gsh = lineSs_().getSheetByName(LINE_CFG.SH_GROUPS);
  const gname = {};
  if (gsh && gsh.getLastRow() > 1) {
    gsh.getRange(2, 1, gsh.getLastRow() - 1, 3).getValues().forEach(function (r) { gname[String(r[0])] = String(r[2] || ''); });
  }
  const forwards = (Array.isArray(data.forwards) ? data.forwards : []).map(function (f) {
    return [String(f.fromId || '').trim(), '', String(f.toId || '').trim(), '', String(f.prefix || '').trim(), !!f.active];
  }).filter(function (f) { return f[0] || f[2]; });
  forwards.forEach(function (f, i) {
    if (!f[0] || !f[2]) throw new Error('การส่งต่อข้อ ' + (i + 1) + ' ต้องเลือกทั้งกลุ่มต้นทางและปลายทาง');
    if (f[0] === f[2]) throw new Error('การส่งต่อข้อ ' + (i + 1) + ' กลุ่มต้นทางกับปลายทางเป็นกลุ่มเดียวกัน');
    f[1] = gname[f[0]] || '';
    f[3] = gname[f[2]] || '';
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = lineSs_();

    // --- คำตอบอัตโนมัติ ---
    const sr = lineEnsureSheet_(ss, LINE_CFG.SH_RULES, LINE_HEADERS.RULES, []);
    const oldRows = Math.max(0, sr.getLastRow() - 1);
    if (oldRows) sr.getRange(2, 1, oldRows, 5).clearContent();
    if (rules.length) {
      sr.getRange(2, 1, rules.length, 1).setNumberFormat('@');
      sr.getRange(2, 3, rules.length, 1).setNumberFormat('@');
      sr.getRange(2, 5, rules.length, 1).setNumberFormat('@');
      sr.getRange(2, 1, rules.length, 5).setValues(rules);
    }

    // --- ตั้งค่า (คง key อื่นที่มีอยู่ไว้) ---
    const st = lineEnsureSheet_(ss, LINE_CFG.SH_SETTINGS, LINE_HEADERS.SETTINGS, []);
    const last = st.getLastRow();
    const rows = last > 1 ? st.getRange(2, 1, last - 1, 3).getValues() : [];
    Object.keys(newSettings).forEach(function (k) {
      const i = rows.findIndex(function (r) { return String(r[0]).trim() === k; });
      if (i > -1) rows[i][1] = newSettings[k];
      else {
        const d = LINE_DEFAULT_SETTINGS.find(function (x) { return x[0] === k; });
        rows.push([k, newSettings[k], d ? d[2] : '']);
      }
    });
    st.getRange(2, 2, rows.length, 1).setNumberFormat('@');
    st.getRange(2, 1, rows.length, 3).setValues(rows);

    // --- ส่งต่อข้อความ ---
    const sf = lineEnsureSheet_(ss, LINE_CFG.SH_FORWARD, LINE_HEADERS.FORWARD, []);
    const oldF = Math.max(0, sf.getLastRow() - 1);
    if (oldF) sf.getRange(2, 1, oldF, 6).clearContent();
    if (forwards.length) {
      sf.getRange(2, 1, forwards.length, 5).setNumberFormat('@');
      sf.getRange(2, 1, forwards.length, 6).setValues(forwards);
    }
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove(LINE_CFG.CACHE_KEY);
  return lineAdminLoad(pin);
}

function lineAdminTestPush(pin, groupId, text) {
  lineCheckPin_(pin);
  groupId = String(groupId || '').trim();
  text = String(text || '').trim();
  if (!groupId) throw new Error('กรุณาเลือกกลุ่ม');
  if (!text) throw new Error('กรุณาพิมพ์ข้อความ');
  lineApiPost_('https://api.line.me/v2/bot/message/push', { to: groupId, messages: lineToMessages_(text) });
  return 'ok';
}

function lineAdminChangePin(pin, newPin) {
  lineCheckPin_(pin);
  newPin = String(newPin || '').trim();
  const P = PropertiesService.getScriptProperties();
  if (!newPin) { P.deleteProperty('LINE_ADMIN_PIN'); return 'ok'; }   // เว้นว่าง = ยกเลิก PIN
  if (!/^\S{4,20}$/.test(newPin)) throw new Error('PIN ต้องยาว 4–20 ตัว ไม่มีช่องว่าง');
  P.setProperty('LINE_ADMIN_PIN', newPin);
  return 'ok';
}

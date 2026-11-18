/****************************************************************
 * ตัวอัปเดตเว็บอัตโนมัติ (โปรเจกต์ Apps Script แยก — ไม่ใช่โปรเจกต์เว็บ)
 * ทุก 10 นาที: ถ้าโฟลเดอร์ apps-script/ ใน GitHub มีโค้ดใหม่
 *   → วางโค้ดลงโปรเจกต์ "เว็บงานรังสีวิทยา" → สร้างเวอร์ชันใหม่ → Deploy ลิงก์เดิม
 *
 * ตั้งค่าครั้งเดียว:
 *   1) เปิด https://script.google.com/home/usersettings → Google Apps Script API = เปิด
 *   2) ใส่ MAIN_SCRIPT_ID ด้านล่าง (โปรเจกต์เว็บ → ⚙️ Project Settings → Script ID)
 *   3) เลือกฟังก์ชัน setup → กด Run → อนุญาตสิทธิ์
 ****************************************************************/

const MAIN_SCRIPT_ID = 'ใส่ Script ID ของโปรเจกต์เว็บ';
const DEPLOYMENT_ID  = 'AKfycbxAFHfMwW_2rIuu4WTVpXhDxJfyp8MUlMkOG56onP9SHURg9g0G4Y4zuTdbKcmpNLdOpA'; // ตัวเดียวกับในลิงก์ /exec
const REPO = 'forinnovation3010-coder/radiology-apps', BRANCH = 'main', DIR = 'apps-script';

// บรรทัดที่ต้องเก็บค่าจริงจากโปรเจกต์เว็บไว้ ไม่ให้ค่าแทนใน GitHub ทับ
const KEEP = { Leave: [/^const ADMIN_PIN\b.*$/m] };

/** รันครั้งเดียว: ตั้งเวลาเช็กทุก 10 นาที แล้วอัปเดตทันที 1 รอบ */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncFromGitHub').timeBased().everyMinutes(10).create();
  PropertiesService.getScriptProperties().deleteProperty('LAST_SHA');
  syncFromGitHub();
}

/** อัปเดตทันทีโดยไม่สนว่าเคยอัปเดตแล้วหรือยัง */
function forceUpdate() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_SHA');
  syncFromGitHub();
}

function syncFromGitHub() {
  const props = PropertiesService.getScriptProperties();
  const sha = gh_('/commits/' + BRANCH).sha;
  if (props.getProperty('LAST_SHA') === sha) return;

  // ไฟล์โค้ดใน GitHub
  const list = gh_('/contents/' + DIR + '?ref=' + sha)
    .filter(f => f.type === 'file' && /\.(gs|html)$/.test(f.name));
  if (!list.length) throw new Error('ไม่พบไฟล์โค้ดใน ' + DIR);
  const repoFiles = list.map(f => ({
    name: f.name.replace(/\.(gs|html)$/, ''),
    type: /\.gs$/.test(f.name) ? 'SERVER_JS' : 'HTML',
    source: UrlFetchApp.fetch(f.download_url).getContentText('UTF-8')
  }));

  // โค้ดปัจจุบันในโปรเจกต์เว็บ
  const cur = api_('get', '/projects/' + MAIN_SCRIPT_ID + '/content').files;
  const curBy = {};
  cur.forEach(f => curBy[f.name + '|' + f.type] = f);

  // เก็บบรรทัดค่าจริง (เช่นรหัสผู้ดูแล)
  repoFiles.forEach(f => {
    const old = curBy[f.name + '|' + f.type];
    (KEEP[f.name] || []).forEach(re => {
      const m = old && old.source.match(re);
      if (m) f.source = f.source.replace(re, () => m[0]);
    });
  });

  // ไฟล์ที่มีในโปรเจกต์แต่ไม่มีใน GitHub (เช่น appsscript.json) เก็บไว้เหมือนเดิม
  const inRepo = {};
  repoFiles.forEach(f => inRepo[f.name + '|' + f.type] = true);
  const files = cur.filter(f => !inRepo[f.name + '|' + f.type]).map(f => ({ name: f.name, type: f.type, source: f.source }))
    .concat(repoFiles);
  files.sort((a, b) => (a.type === 'JSON' ? -1 : b.type === 'JSON' ? 1 : 0));

  api_('put', '/projects/' + MAIN_SCRIPT_ID + '/content', { files: files });
  const desc = 'อัปเดตอัตโนมัติ ' + sha.slice(0, 7);
  const ver = api_('post', '/projects/' + MAIN_SCRIPT_ID + '/versions', { description: desc }).versionNumber;
  api_('put', '/projects/' + MAIN_SCRIPT_ID + '/deployments/' + DEPLOYMENT_ID, {
    deploymentConfig: { scriptId: MAIN_SCRIPT_ID, versionNumber: ver, manifestFileName: 'appsscript', description: desc }
  });
  props.setProperty('LAST_SHA', sha);
  console.log('อัปเดตแล้ว เวอร์ชัน ' + ver + ' (' + sha.slice(0, 7) + ')');
}

function gh_(path) {
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + path,
    { headers: { Accept: 'application/vnd.github+json' }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('GitHub ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText());
}

function api_(method, path, body) {
  const opt = { method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body) opt.payload = JSON.stringify(body);
  const r = UrlFetchApp.fetch('https://script.googleapis.com/v1' + path, opt);
  if (r.getResponseCode() >= 300) {
    const t = r.getContentText();
    if (/has not been used|is disabled|User has not enabled the Apps Script API/i.test(t))
      throw new Error('ยังไม่ได้เปิด Apps Script API → https://script.google.com/home/usersettings');
    throw new Error('Apps Script API ' + r.getResponseCode() + ': ' + t.slice(0, 300));
  }
  return r.getContentText() ? JSON.parse(r.getContentText()) : {};
}

/****************************************************************
 * ตัวอัปเดตเว็บอัตโนมัติ v2 — หลายโปรเจกต์ (โปรเจกต์ Apps Script แยก ไม่ใช่โปรเจกต์เว็บ)
 *
 * ทุก 10 นาที: ถ้าโค้ดใน GitHub เปลี่ยน → วางโค้ดลงโปรเจกต์ที่ตรงกัน → สร้างเวอร์ชันใหม่ → Deploy ลิงก์เดิม
 * รายชื่อโปรเจกต์อยู่ในไฟล์ auto-update/targets.json ใน GitHub (ไม่ต้องแก้ในนี้)
 * ก่อนวางโค้ดทุกครั้ง จะสำรองโค้ดเดิมไว้ใน Drive โฟลเดอร์ "สำรองโค้ด Apps Script (ตัวอัปเดต)"
 *
 * ตั้งค่าครั้งเดียว (ทำในมือถือได้ — Chrome → ⋮ → เวอร์ชันเดสก์ท็อป):
 *   1) https://script.google.com/home/usersettings → Google Apps Script API = เปิด
 *   2) แก้ SHARE_WITH ด้านล่าง = อีเมลที่ต่อกับ Claude (ให้ Claude อ่านโค้ดที่ส่งออกได้)
 *   3) เลือกฟังก์ชัน setup → Run → อนุญาตสิทธิ์
 ****************************************************************/

const SHARE_WITH = 'ใส่อีเมล';   // เช่น yourname@gmail.com
const REPO = 'forinnovation3010-coder/radiology-apps', BRANCH = 'main';
const CONFIG_PATH = 'auto-update/targets.json';
const EXPORT_FOLDER = 'โค้ดส่งให้ Claude';
const BACKUP_FOLDER = 'สำรองโค้ด Apps Script (ตัวอัปเดต)';
const BACKUPS_KEEP = 30;   // เก็บสำรองล่าสุดกี่ชุดต่อโปรเจกต์

/** รันครั้งเดียว: ตั้งเวลาเช็กทุก 10 นาที + ส่งออกโค้ดทุกโปรเจกต์ให้ Claude */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(10).create();
  exportForClaude();
  syncAll();
}

/** อัปเดตทุกโปรเจกต์ทันที แม้โค้ดไม่เปลี่ยน */
function forceUpdate() { syncAll(true); }

/** ชื่อเดิมของ v1 (กันทริกเกอร์เก่าพัง) */
function syncFromGitHub() { syncAll(); }

function syncAll(force) {
  force = force === true;
  const props = PropertiesService.getScriptProperties();
  const head = gh_('/commits/' + BRANCH).sha;
  if (!force && props.getProperty('HEAD_SHA') === head) return;

  const cfg = JSON.parse(fetchText_(rawUrl_(CONFIG_PATH, head)));
  const errors = [];
  cfg.targets.forEach(t => {
    const id = t.scriptId === 'SELF' ? ScriptApp.getScriptId() : t.scriptId;
    if (!id) return;                       // ยังไม่เปิดใช้โปรเจกต์นี้
    try { syncTarget_(t, id, head, force, props); }
    catch (e) { errors.push(t.name + ': ' + e.message); }
  });
  props.setProperty('HEAD_SHA', head);
  props.setProperty('LAST_ERROR', errors.join('\n'));
  if (errors.length) throw new Error('อัปเดตไม่สำเร็จบางโปรเจกต์ (รัน forceUpdate เพื่อลองใหม่)\n' + errors.join('\n'));
}

function syncTarget_(t, id, sha, force, props) {
  const list = gh_('/contents/' + encodeURI(t.dir) + '?ref=' + sha)
    .filter(f => f.type === 'file' && /\.(gs|html)$/.test(f.name));
  if (!list.length) return;                // ยังไม่มีโค้ดใน GitHub → ไม่แตะโปรเจกต์
  const repoFiles = list.map(f => ({
    name: f.name.replace(/\.(gs|html)$/, ''),
    type: /\.gs$/.test(f.name) ? 'SERVER_JS' : 'HTML',
    source: fetchText_(f.download_url)
  }));

  const hashKey = 'HASH_' + t.dir;
  const hash = digest_(repoFiles.map(f => f.name + '|' + f.source).join('\n\u0000'));
  if (!force && props.getProperty(hashKey) === hash) return;

  const cur = api_('get', '/projects/' + id + '/content').files;
  const curBy = {};
  cur.forEach(f => curBy[f.name + '|' + f.type] = f);

  // บรรทัดที่ต้องเก็บค่าจริงจากโปรเจกต์ไว้ ไม่ให้ค่าแทนใน GitHub ทับ (เช่น PIN, token)
  repoFiles.forEach(f => {
    const old = curBy[f.name + '|' + f.type];
    ((t.keep || {})[f.name] || []).forEach(src => {
      const re = new RegExp(src, 'm');
      const m = old && old.source.match(re);
      if (m) f.source = f.source.replace(re, () => m[0]);
    });
  });

  backup_(t.name, id, cur);

  // ไฟล์ที่มีในโปรเจกต์แต่ไม่มีใน GitHub (เช่น appsscript.json) เก็บไว้เหมือนเดิม
  const inRepo = {};
  repoFiles.forEach(f => inRepo[f.name + '|' + f.type] = true);
  const files = cur.filter(f => !inRepo[f.name + '|' + f.type])
    .map(f => ({ name: f.name, type: f.type, source: f.source }))
    .concat(repoFiles);
  files.sort((a, b) => (a.type === 'JSON' ? -1 : b.type === 'JSON' ? 1 : 0));
  api_('put', '/projects/' + id + '/content', { files: files });

  if (t.deploy !== false) {
    const desc = 'อัปเดตอัตโนมัติ ' + sha.slice(0, 7);
    const depId = t.deploymentId || findDeployment_(id);
    const ver = api_('post', '/projects/' + id + '/versions', { description: desc }).versionNumber;
    api_('put', '/projects/' + id + '/deployments/' + depId, {
      deploymentConfig: { scriptId: id, versionNumber: ver, manifestFileName: 'appsscript', description: desc }
    });
    console.log(t.name + ': deploy เวอร์ชัน ' + ver + ' (' + sha.slice(0, 7) + ')');
  } else {
    console.log(t.name + ': อัปเดตโค้ดแล้ว (' + sha.slice(0, 7) + ')');
  }
  props.setProperty(hashKey, hash);
}

/** หา deployment แบบ Web app ที่ไม่ใช่ HEAD — ต้องมีตัวเดียว */
function findDeployment_(id) {
  const deps = (api_('get', '/projects/' + id + '/deployments').deployments || [])
    .filter(d => d.deploymentConfig && d.deploymentConfig.versionNumber &&
      (d.entryPoints || []).some(e => e.entryPointType === 'WEB_APP'));
  if (deps.length === 1) return deps[0].deploymentId;
  throw new Error('มี Web app deployment ' + deps.length + ' ตัว — ใส่ deploymentId ใน targets.json');
}

/** ส่งออกโค้ดทุกโปรเจกต์ที่บัญชีนี้เห็น ไปไว้ในโฟลเดอร์ Drive ที่แชร์ให้ SHARE_WITH */
function exportForClaude() {
  const folder = folder_(EXPORT_FOLDER);
  if (/@/.test(SHARE_WITH)) {
    try { folder.addViewer(SHARE_WITH); } catch (e) { console.warn('แชร์ไม่ได้: ' + e.message); }
  }
  const self = ScriptApp.getScriptId();
  const ids = {};
  const it = DriveApp.getFilesByType(MimeType.GOOGLE_APPS_SCRIPT);
  while (it.hasNext()) { const f = it.next(); ids[f.getId()] = f.getName(); }
  // โปรเจกต์ที่ผูกกับชีต (ไม่โผล่ใน Drive) → ใส่ scriptId ใน targets.json
  try {
    const cfg = JSON.parse(fetchText_(rawUrl_(CONFIG_PATH, BRANCH)));
    cfg.targets.forEach(t => { if (t.scriptId && t.scriptId !== 'SELF' && !ids[t.scriptId]) ids[t.scriptId] = t.name; });
  } catch (e) { console.warn('อ่าน targets.json ไม่ได้: ' + e.message); }

  const done = [];
  Object.keys(ids).forEach(id => {
    if (id === self) return;
    try {
      const files = api_('get', '/projects/' + id + '/content').files || [];
      let deps = [];
      try {
        deps = (api_('get', '/projects/' + id + '/deployments').deployments || []).map(d => ({
          deploymentId: d.deploymentId,
          version: d.deploymentConfig && d.deploymentConfig.versionNumber || 'HEAD',
          description: d.deploymentConfig && d.deploymentConfig.description || '',
          webApp: (d.entryPoints || []).filter(e => e.entryPointType === 'WEB_APP').map(e => e.webApp && e.webApp.url)
        }));
      } catch (e) { deps = [{ error: e.message }]; }
      const text = 'PROJECT: ' + ids[id] + '\nSCRIPT_ID: ' + id + '\nDEPLOYMENTS: ' + JSON.stringify(deps) + '\n\n' +
        files.map(f => '===== FILE: ' + f.name + ext_(f.type) + ' =====\n' + f.source).join('\n\n');
      put_(folder, (ids[id] + '__' + id + '.txt').replace(/[\/\\]/g, '_'), text);
      done.push(ids[id]);
    } catch (e) { console.warn(ids[id] + ': ' + e.message); }
  });
  console.log('ส่งออกแล้ว ' + done.length + ' โปรเจกต์: ' + done.join(', ') + '\nโฟลเดอร์: ' + folder.getUrl());
}

/* ---------- ตัวช่วย ---------- */

function backup_(name, id, files) {
  const folder = sub_(folder_(BACKUP_FOLDER), name);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HHmm');
  folder.createFile(stamp + '.txt',
    'SCRIPT_ID: ' + id + '\n\n' + files.map(f => '===== FILE: ' + f.name + ext_(f.type) + ' =====\n' + f.source).join('\n\n'),
    MimeType.PLAIN_TEXT);
  const all = [];
  const it = folder.getFiles();
  while (it.hasNext()) all.push(it.next());
  all.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  all.slice(BACKUPS_KEEP).forEach(f => f.setTrashed(true));
}

function folder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function put_(folder, name, text) {
  const it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(name, text, MimeType.PLAIN_TEXT);
}
const ext_ = type => type === 'SERVER_JS' ? '.gs' : type === 'HTML' ? '.html' : '.json';

function digest_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function rawUrl_(path, ref) {
  return 'https://raw.githubusercontent.com/' + REPO + '/' + ref + '/' + encodeURI(path);
}
function fetchText_(url) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('โหลด ' + url + ' ไม่ได้ (' + r.getResponseCode() + ')');
  return r.getContentText('UTF-8');
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
    if (r.getResponseCode() === 403 || r.getResponseCode() === 404)
      throw new Error('ไม่มีสิทธิ์แก้โปรเจกต์ ' + path.split('/')[2] + ' — แชร์โปรเจกต์ให้บัญชีนี้เป็นผู้แก้ไข');
    throw new Error('Apps Script API ' + r.getResponseCode() + ': ' + t.slice(0, 300));
  }
  return r.getContentText() ? JSON.parse(r.getContentText()) : {};
}

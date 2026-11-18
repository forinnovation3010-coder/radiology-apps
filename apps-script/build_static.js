// Pre-render the Apps Script HTML templates into static pages for GitHub Pages.
const fs = require('fs'), path = require('path');
const SRC = __dirname, OUT = require('path').join(__dirname, '..', 'web');
const EXEC = 'https://script.google.com/macros/s/AKfycbxAFHfMwW_2rIuu4WTVpXhDxJfyp8MUlMkOG56onP9SHURg9g0G4Y4zuTdbKcmpNLdOpA/exec';
const PAGES = {
  leave: { file: 'LeavePage', out: 'index.html', icons: 'leave', app: 'Leave Online', color: '#ECE5FB', title: 'ระบบใบลา โรงพยาบาลระยอง', viewport: 'width=device-width, initial-scale=1' },
  xray:  { file: 'XrayPage', out: 'xray.html', icons: 'xray', app: 'X-ray General', color: '#FDE9BE', title: 'ระบบจัดการคลังสินค้า X-ray', viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' }
};
const MENU = [
  { key: 'leave', icon: '📅', title: 'ระบบใบลา', sub: 'ปฏิทินการลา · พิมพ์ใบลา PDF', tone: 'violet' },
  { key: 'xray',  icon: '📦', title: 'คลังสินค้า X-ray', sub: 'รับเข้า · เบิกใช้ · ของรออบ', tone: 'peach' }
].map(m => Object.assign({}, m, { href: './' + PAGES[m.key].out.replace('index.html', '') }));

const esc = v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function render(name, vars) {
  const src = fs.readFileSync(path.join(SRC, name + '.html'), 'utf8');
  let code = 'let __o="";with(__v){', i = 0;
  const re = /<\?(!=|=)?([\s\S]*?)\?>/g; let m;
  while ((m = re.exec(src))) {
    code += '__o+=' + JSON.stringify(src.slice(i, m.index)) + ';';
    if (m[1] === '!=') code += '__o+=(' + m[2] + ');';
    else if (m[1] === '=') code += '__o+=__e(' + m[2] + ');';
    else code += m[2] + '\n';
    i = re.lastIndex;
  }
  code += '__o+=' + JSON.stringify(src.slice(i)) + ';}return __o;';
  return new Function('__v', '__e', code)(Object.assign({ include: (n, v) => render(n, v) }, vars), esc);
}

const SHIM = `<script>
// ใช้แทน google.script.run: เรียก Apps Script ผ่าน fetch แบบไม่ส่งคุกกี้ (เลี่ยงปัญหาล็อกอินหลายบัญชี)
(function(){
  var API = ${JSON.stringify(EXEC)};
  function mk(ok, no){
    return new Proxy({}, { get: function(_, k){
      if (k === 'withSuccessHandler') return function(h){ return mk(h, no); };
      if (k === 'withFailureHandler') return function(h){ return mk(ok, h); };
      if (k === 'withUserObject') return function(){ return mk(ok, no); };
      return function(){
        var args = Array.prototype.slice.call(arguments);
        var fail = function(e){ if (no) no(e); else console.error(e); };
        fetch(API, { method: 'POST', body: JSON.stringify({ fn: k, args: args }), credentials: 'omit', redirect: 'follow' })
          .then(function(r){ return r.json(); })
          .then(function(j){ if (j.ok) { if (ok) ok(j.result); } else fail(new Error(j.error)); })
          .catch(function(){ fail(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง')); });
      };
    }});
  }
  window.google = { script: { run: mk() } };
})();
</script>`;

fs.mkdirSync(OUT, { recursive: true });
for (const [key, p] of Object.entries(PAGES)) {
  let html = render(p.file, { page: key, baseUrl: './', menu: MENU });
  const head = `<meta charset="utf-8">\n<meta name="viewport" content="${p.viewport}">\n<title>${p.title}</title>\n` +
    // ไอคอนแยกของแต่ละระบบ (เพิ่มลงหน้าจอโฮมจากหน้านี้ได้เลย)
    `<link rel="icon" type="image/png" href="../${p.icons}/favicon.png">\n` +
    `<link rel="manifest" href="../${p.icons}/manifest.json">\n` +
    `<link rel="apple-touch-icon" href="../${p.icons}/apple-touch-icon.png">\n` +
    `<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n` +
    `<meta name="apple-mobile-web-app-title" content="${p.app}">\n<meta name="theme-color" content="${p.color}">\n${SHIM}\n`;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + '\n' + head);
  else html = '<!DOCTYPE html><html lang="th"><head>' + head + '</head><body>' + html + '</body></html>';
  if (key === 'leave') // ลิงก์เก่า ?page=xray ให้ไปหน้า X-ray
    html = html.replace(SHIM, `<script>if(new URLSearchParams(location.search).get('page')==='xray')location.replace('./xray.html');</script>\n` + SHIM);
  fs.writeFileSync(path.join(OUT, p.out), html);
  console.log(p.out, html.length);
}

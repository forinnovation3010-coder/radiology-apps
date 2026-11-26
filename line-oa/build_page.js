// สร้างหน้าตั้งค่าบน GitHub Pages (line-oa/index.html) จาก Index.html
// ใช้แทน google.script.run ด้วย fetch แบบไม่ส่งคุกกี้ → เปิดได้แม้ล็อกอิน Google หลายบัญชี
// แก้ apps-script/Index.html แล้วรัน:  node line-oa/build_page.js
const fs = require('fs'), path = require('path');
const EXEC = 'https://script.google.com/macros/s/AKfycbyEyp9QTJaZ7hNJwwLWmCKqwAUUDNveeP9xGURI7_PKvmPYLl8emmVmV8q_0mMHXqEn/exec';
const SHIM = `<script>
(function(){
  var API = ${JSON.stringify(EXEC)};
  function mk(ok, no){
    return new Proxy({}, { get: function(_, k){
      if (k === 'withSuccessHandler') return function(h){ return mk(h, no); };
      if (k === 'withFailureHandler') return function(h){ return mk(ok, h); };
      return function(){
        var args = Array.prototype.slice.call(arguments);
        var fail = function(e){ if (no) no(e); else console.error(e); };
        fetch(API, { method: 'POST', body: JSON.stringify({ fn: k, args: args }), credentials: 'omit', redirect: 'follow' })
          .then(function(r){ return r.json(); })
          .then(function(j){ if (j && j.ok) { if (ok) ok(j.result); } else fail(new Error((j && j.error) || 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง — อัปเดต Code.gs ใน Apps Script แล้ว Deploy เวอร์ชันใหม่หรือยัง?')); })
          .catch(function(){ fail(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง')); });
      };
    }});
  }
  window.google = { script: { run: mk() } };
})();
</script>`;
const HEAD = `<link rel="icon" type="image/png" href="../intervention/favicon.png">
<link rel="apple-touch-icon" href="../intervention/apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="LINE OA Bot">
<meta name="theme-color" content="#06C755">
${SHIM}`;
let html = fs.readFileSync(path.join(__dirname, 'apps-script', 'Index.html'), 'utf8');
html = html.replace('<base target="_top">\n', '');
html = html.replace(/<head>/i, m => m + '\n' + HEAD);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('index.html', html.length);

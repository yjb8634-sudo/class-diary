/* 클래스 나우 데스크톱 — 로컬 서버
 * 선생님 PC 안에서만 도는 작은 서버입니다. 하는 일:
 *  1. 관리 화면 · TV 화면(번들된 classroom 화면) 제공
 *  2. 자료 읽고 쓰기 (설치판과 같은 규칙: solo/core.js 가 권한을 지킴)
 *  3. 교실 전자칠판(같은 학교 네트워크)과 숫자 6자리로 짝지음
 *  4. 첨부 파일 제공(/files), 시간표 자료 대신 받아오기(/data)
 * 바깥 인터넷에 여는 것이 아니라, 교실 네트워크 안에서만 쓰입니다.
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CNCORE = require('./core.js');
const { Store, newKey } = require('./store.js');

const PAGES_DATA = 'https://yjb8634-sudo.github.io/class-diary/data/';
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.json': 'application/json;charset=utf-8',
  '.css': 'text/css;charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function lanIps() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) for (const x of ifs[name] || []) {
    if (x.family === 'IPv4' && !x.internal) out.push(x.address);
  }
  return out;
}
function b64url(obj) {
  return 'CN1.' + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function createApp(opts) {
  const dir = opts.dir;
  const screens = opts.screens;
  const store = new Store(dir);
  let port = 0;
  const pairing = { code: '', exp: 0, tries: 0 };
  const dataCache = new Map();   /* name → {at, body, type} */

  const env = store.makeEnv({
    pingExtra() {
      return { desktop: 1, port, lan: lanIps(), dir, appVer: opts.appVer || '' };
    },
    extraOp(op, o, kind) {
      if (op === 'pairstart') {
        if (kind !== 'admin') throw new Error('권한이 없어요');
        const key = (store.docs.get('keys/owner') || {}).boardKey || '';
        if (!key) throw new Error('먼저 관리 화면이 우리 반을 만든 뒤에 연결할 수 있어요.');
        pairing.code = String(100000 + Math.floor(Math.random() * 900000));
        pairing.exp = Date.now() + 10 * 60e3;
        pairing.tries = 0;
        return { code: pairing.code, mins: 10, lan: lanIps(), port };
      }
      return undefined;
    }
  });

  function json(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }
  function html(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }
  function isLocal(req) {
    const a = req.socket.remoteAddress || '';
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  }
  function adminHash() {
    const p = store.props;
    if (!p.claimed || !p.adminKey) return '';
    return '#g=' + b64url({ u: 'http://127.0.0.1:' + port + '/', a: p.adminKey });
  }
  function tvHash() {
    const key = (store.docs.get('keys/owner') || {}).boardKey || '';
    if (!key) return '';
    return '#gc=' + b64url({ u: 'http://127.0.0.1:' + port + '/', t: key });
  }

  /* ---- 화면 꾸밈새 (연결 · 설치 페이지 공용) ---- */
  const CSS = 'body{font-family:"Pretendard Variable",Pretendard,"Malgun Gothic",sans-serif;background:#1D2A25;color:#E4E0D3;margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px;box-sizing:border-box}'
    + '.card{max-width:560px;width:100%;background:#24352E;border:1px solid #3A4F45;border-radius:18px;padding:30px 26px;text-align:center}'
    + 'h1{font-size:26px;margin:0 0 10px;color:#F2D16B}p{line-height:1.7;font-size:16px;margin:8px 0;color:#BFD0C6}'
    + 'input{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1.5px solid #3A4F45;background:#1D2A25;color:#E4E0D3;font-size:28px;text-align:center;letter-spacing:8px;margin-top:14px}'
    + 'input.txt{font-size:17px;letter-spacing:0;text-align:left}label{display:block;text-align:left;margin:14px 0 4px;font-size:14px;color:#BFD0C6}'
    + 'select{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1.5px solid #3A4F45;background:#1D2A25;color:#E4E0D3;font-size:16px}'
    + 'button{margin-top:18px;width:100%;padding:15px;border:0;border-radius:12px;background:#E6B84A;color:#2A2108;font-weight:700;font-size:18px;cursor:pointer}'
    + '.err{color:#F0A08C;font-weight:700;min-height:1.3em;margin-top:10px}.small{font-size:13.5px;opacity:.75}';

  function connectPage() {
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>클래스 나우 — TV 연결</title><style>' + CSS + '</style></head><body><div class="card" id="c">'
      + '<h1>클래스 나우 교실 TV</h1>'
      + '<p>담임 선생님 화면의 <b>[TV 연결]</b>에 나온 <b>숫자 6자리</b>를 넣어 주세요.</p>'
      + '<input id="code" inputmode="numeric" maxlength="6" placeholder="______" autofocus>'
      + '<button id="go">이 화면을 우리 반 TV로 연결</button><p class="err" id="err"></p>'
      + '<p class="small">연결은 처음 한 번만 하면 돼요. 다음부터는 이 주소를 열면 우리 반 화면이 바로 나와요.</p></div>'
      + '<script>'
      + 'try{if(localStorage.getItem("cn_gas_tv")){location.replace("/tv.html");}}catch(e){}'
      + 'function pack(o){var b=btoa(unescape(encodeURIComponent(JSON.stringify(o))));return "CN1."+b.replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");}'
      + 'document.getElementById("go").onclick=function(){'
      + 'var v=(document.getElementById("code").value||"").replace(/\\D/g,"");'
      + 'if(v.length!==6){document.getElementById("err").textContent="숫자 6자리를 넣어 주세요.";return;}'
      + 'fetch("/pair",{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({code:v})}).then(function(r){return r.json();}).then(function(j){'
      + 'if(!j.ok){document.getElementById("err").textContent=j.err||"연결하지 못했어요.";return;}'
      + 'location.replace("/tv.html#gc="+pack({u:location.origin+"/",t:j.t}));'
      + '}).catch(function(){document.getElementById("err").textContent="연결하지 못했어요. 같은 네트워크인지 확인해 주세요.";});};'
      + 'document.getElementById("code").addEventListener("keydown",function(e){if(e.key==="Enter")document.getElementById("go").click();});'
      + '</script></body></html>';
  }

  function setupPage() {
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>클래스 나우 설치</title><style>' + CSS + '</style></head><body><div class="card">'
      + '<h1>클래스 나우</h1><p>거의 다 왔어요! 우리 반 정보를 넣으면 시작돼요.<br><span class="small">모든 자료는 이 컴퓨터 안에만 저장됩니다.</span></p>'
      + '<label>선생님 성함</label><input class="txt" id="nm" maxlength="20" placeholder="예) 유준배">'
      + '<label>학년</label><select id="gr"><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select>'
      + '<label>반</label><input class="txt" id="kl" inputmode="numeric" maxlength="2" placeholder="예) 2">'
      + '<button id="go">시작하기</button><p class="err" id="err"></p></div>'
      + '<script>'
      + 'document.getElementById("go").onclick=function(){'
      + 'fetch("/claim",{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({name:document.getElementById("nm").value,grade:document.getElementById("gr").value,klass:document.getElementById("kl").value})})'
      + '.then(function(r){return r.json();}).then(function(j){'
      + 'if(!j.ok){document.getElementById("err").textContent=j.err||"저장하지 못했어요.";return;}'
      + 'location.replace("/index.html"+j.hash);'
      + '}).catch(function(){document.getElementById("err").textContent="저장하지 못했어요.";});};'
      + '</script></body></html>';
  }

  async function proxyData(name, res) {
    const hit = dataCache.get(name);
    if (hit && Date.now() - hit.at < 5 * 60e3) {
      res.writeHead(200, { 'Content-Type': hit.type, 'Cache-Control': 'no-store' });
      return res.end(hit.body);
    }
    https.get(PAGES_DATA + name, r => {
      if (r.statusCode !== 200) {
        r.resume();
        if (hit) { res.writeHead(200, { 'Content-Type': hit.type }); return res.end(hit.body); }
        res.writeHead(404); return res.end();
      }
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const body = Buffer.concat(chunks);
        const type = r.headers['content-type'] || 'application/json';
        dataCache.set(name, { at: Date.now(), body, type });
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(body);
      });
    }).on('error', () => {
      if (hit) { res.writeHead(200, { 'Content-Type': hit.type }); return res.end(hit.body); }
      res.writeHead(502); res.end();
    });
  }

  async function handle(req, res) {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    try {
      if (req.method === 'POST') {
        const raw = await readBody(req, p === '/' ? 45e6 : 64e3).catch(() => null);
        if (raw == null) return json(res, 413, { ok: false, err: '요청이 너무 커요' });
        let body = {};
        try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch (e) { return json(res, 400, { ok: false, err: '요청을 읽지 못했어요' }); }

        if (p === '/') return json(res, 200, CNCORE.handle(body, env));

        if (p === '/pair') {
          if (!pairing.code || Date.now() > pairing.exp) return json(res, 200, { ok: false, err: '연결 숫자가 없어요. 담임 선생님 화면에서 [TV 연결]을 눌러 주세요.' });
          if (pairing.tries++ > 8) { pairing.code = ''; return json(res, 200, { ok: false, err: '너무 여러 번 틀렸어요. 담임 선생님 화면에서 다시 시작해 주세요.' }); }
          if (String(body.code || '') !== pairing.code) return json(res, 200, { ok: false, err: '숫자가 맞지 않아요.' });
          pairing.code = '';
          const key = (store.docs.get('keys/owner') || {}).boardKey || '';
          if (!key) return json(res, 200, { ok: false, err: '아직 우리 반이 만들어지지 않았어요.' });
          return json(res, 200, { ok: true, t: key });
        }

        if (p === '/claim') {
          if (!isLocal(req)) return json(res, 403, { ok: false, err: '이 컴퓨터에서만 할 수 있어요' });
          try {
            CNCORE.claim(body, env);
            return json(res, 200, { ok: true, hash: adminHash() });
          } catch (e) { return json(res, 200, { ok: false, err: String(e.message || e) }); }
        }
        res.writeHead(404); return res.end();
      }

      /* ---- GET ---- */
      if (p === '/') {
        const q = u.searchParams;
        if (q.get('admin') === '1') {   /* Electron 이 여는 길 */
          if (!isLocal(req)) { res.writeHead(403); return res.end(); }
          if (!store.props.claimed) { res.writeHead(302, { Location: '/setup' }); return res.end(); }
          res.writeHead(302, { Location: '/index.html' + adminHash() }); return res.end();
        }
        if (q.get('tv') === '1') {      /* Electron TV 창 (HDMI 모드) */
          if (!isLocal(req)) { res.writeHead(403); return res.end(); }
          const h = tvHash();
          res.writeHead(302, { Location: h ? '/tv.html' + h : '/setup' }); return res.end();
        }
        return html(res, 200, connectPage());
      }
      if (p === '/setup') {
        if (!isLocal(req)) { res.writeHead(403); return res.end(); }
        if (store.props.claimed) { res.writeHead(302, { Location: '/index.html' + adminHash() }); return res.end(); }
        return html(res, 200, setupPage());
      }
      if (p.startsWith('/files/')) {
        const id = p.slice(7);
        const meta = store.fileMeta(id);
        if (!meta) { res.writeHead(404); return res.end(); }
        const fp = store.filePath(id);
        const st = fs.statSync(fp);
        res.writeHead(200, { 'Content-Type': meta.mime, 'Content-Length': st.size, 'Cache-Control': 'public, max-age=86400', 'Content-Disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(meta.name) });
        fs.createReadStream(fp).pipe(res);
        return;
      }
      if (p.startsWith('/data/')) {
        const name = p.slice(6);
        if (!/^[a-z0-9_.-]{1,60}\.json$/.test(name)) { res.writeHead(404); return res.end(); }
        return proxyData(name, res);
      }
      /* 번들된 화면 파일 */
      const file = p.replace(/^\/+/, '').replace(/\.\./g, '');
      const ext = path.extname(file);
      if (file && MIME[ext]) {
        const fp = path.join(screens, file);
        if (fp.startsWith(screens) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' });
          fs.createReadStream(fp).pipe(res);
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('없는 주소예요');
    } catch (e) {
      try { json(res, 500, { ok: false, err: String(e.message || e) }); } catch (e2) {}
    }
  }

  function listen(prefPort) {
    return new Promise((resolve, reject) => {
      const server = http.createServer(handle);
      let tries = 0;
      function go(pt) {
        server.once('error', err => {
          if (err.code === 'EADDRINUSE' && tries++ < 10) go(pt + 1);
          else reject(err);
        });
        server.listen(pt, '0.0.0.0', () => { port = pt; resolve({ server, port: pt }); });
      }
      go(prefPort || 8537);
    });
  }

  return {
    listen, store, env,
    get port() { return port; },
    adminUrl: () => 'http://127.0.0.1:' + port + '/?admin=1',
    tvUrl: () => 'http://127.0.0.1:' + port + '/?tv=1',
    claimed: () => !!store.props.claimed
  };
}

module.exports = { createApp, lanIps };

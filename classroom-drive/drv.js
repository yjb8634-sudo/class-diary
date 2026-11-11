/* 클래스 나우 — 구글 드라이브판 저장소
 * 제작자 서버 없이, 담임 선생님 본인 구글 드라이브의 '앱 전용 숨은 폴더(appDataFolder)'에만 자료를 둡니다.
 * - 기기(관리 화면 · 교실 TV)마다 자기 파일 하나(cn-dev-<기기>.json)에만 씁니다. 다른 기기 파일은 읽기만 합니다.
 * - 같은 자료를 두 기기가 고치면 나중에 고친 쪽(t)이 이깁니다. 지운 자료는 '지움 표시'만 남깁니다.
 * - 학교 양식 파일(formfiles)은 커서 따로(cn-blob-<기기>.json) 두고, 교실 TV는 받지 않습니다.
 * - 드라이브에서 '숨겨진 앱 데이터 삭제'를 하면, 기기들도 자기 사본을 지우고 다시 올리지 않습니다.
 * 권한 규칙(누가 무엇을 쓸 수 있나)은 설치판과 같은 ../solo/core.js(CNCORE)를 그대로 씁니다. */

const API = 'https://www.googleapis.com/';
const LIST_URL = API + 'drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=files(id,name,version)&q=' + encodeURIComponent("name contains 'cn-' and trashed=false");
const TOMB_MS = 60 * 864e5;          /* 지움 표시 보관 기간 */
const FILE_RE = /^cn-(dev|blob)-([a-z0-9]{4,24})\.json$/;
export const SCOPE_APPDATA = 'https://www.googleapis.com/auth/drive.appdata';
export const SCOPE_FILE = 'https://www.googleapis.com/auth/drive.file';
export const DRV_VER = 'drv-2026-11-11a';

const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
export function rid(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => ABC[b % 32]).join(''); }
const isBlob = p => p.indexOf('/formfiles/') >= 0;
const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
const newer = (a, b) => !b || a.t > b.t || (a.t === b.t && a.dev > b.dev);

/* 권한 규칙 파일(core.js)을 한 번만 불러옵니다 */
export function loadCore(src) {
  if (window.CNCORE) return Promise.resolve(window.CNCORE);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src || new URL('../solo/core.js?v=' + DRV_VER, import.meta.url).href;
    s.onload = () => window.CNCORE ? res(window.CNCORE) : rej(new Error('프로그램 파일을 읽지 못했어요'));
    s.onerror = () => rej(new Error('프로그램 파일을 불러오지 못했어요. 인터넷을 확인해 주세요.'));
    document.head.appendChild(s);
  });
}

/* ================= 저장소 =================
 * o.kind: 'admin' | 'tv'
 * o.token(force): Promise<access_token>  (force=true: 새로 받기, 못 받으면 throw)
 * o.onAuthNeeded(): 구글 연결이 끝났을 때
 * o.email(): 선생님 이메일(관리 화면 표시용)
 * o.every: 동기화 간격(ms), o.fetch: 시험용 */
export async function openStore(o) {
  const kind = o.kind === 'tv' ? 'tv' : 'admin';
  const fetchFn = o.fetch || ((u, x) => fetch(u, x));
  const LS = 'cn_drv_' + kind + '_';
  const lsGet = k => { try { return localStorage.getItem(LS + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(LS + k); else localStorage.setItem(LS + k, v); } catch (e) { /* 저장 공간 부족 등: 무시 */ } };

  let dev = lsGet('dev') || '';
  if (!/^[a-z0-9]{6,20}$/.test(dev)) { dev = kind[0] + rid(9); lsSet('dev', dev); }
  const NAME = { m: 'cn-dev-' + dev + '.json', b: 'cn-blob-' + dev + '.json' };
  const own = { m: { id: '', ver: '', docs: {} }, b: { id: '', ver: '', docs: {} } };
  const other = new Map();      /* 파일 이름 → { id, ver, dev, docs } */
  let idx = new Map();          /* 경로 → { t, dev, x, d } (합친 결과) */
  const dirty = { m: false, b: false };
  let lastT = 0, pushT = null, pushing = null, loopT = null, stopped = false, fails = 0, pushFails = 0;
  const listeners = new Set();
  const st = { online: false, syncedAt: 0, savedAt: 0, err: '', auth: true, wiped: false };

  /* ---- 이 기기 안 사본 (인터넷이 잠깐 끊겨도 이어서 쓰고, 못 올린 변경도 지키기) ---- */
  function saveLocal() {
    lsSet('own', JSON.stringify({ id: own.m.id, ver: own.m.ver, docs: own.m.docs, dirty: dirty.m, bid: own.b.id, bver: own.b.ver }));
  }
  let othT = null;
  function saveOthersNow() {
    clearTimeout(othT); othT = null;
    const a = [];
    for (const [n, f] of other) if (n.indexOf('cn-dev-') === 0) a.push([n, f]);
    lsSet('oth', JSON.stringify(a));
  }
  function saveOthers() { clearTimeout(othT); othT = setTimeout(saveOthersNow, 1500); }
  function loadLocal() {
    try {
      const j = JSON.parse(lsGet('own') || 'null');
      if (j && j.docs) { own.m.id = j.id || ''; own.m.ver = j.ver || ''; own.m.docs = j.docs; dirty.m = !!j.dirty; own.b.id = j.bid || ''; own.b.ver = ''; }
      const a = JSON.parse(lsGet('oth') || '[]');
      if (Array.isArray(a)) a.forEach(([n, f]) => { if (FILE_RE.test(n) && f && f.docs) other.set(n, f); });
    } catch (e) {}
  }

  /* ---- 합치기 ---- */
  function rebuild() {
    const m = new Map();
    const add = (docs, dv) => {
      for (const p in docs) {
        const e = docs[p]; if (!e || typeof e.t !== 'number') continue;
        const c = { t: e.t, dev: dv, x: e.x ? 1 : 0, d: e.d };
        if (newer(c, m.get(p))) m.set(p, c);
      }
    };
    add(own.m.docs, dev); add(own.b.docs, dev);
    for (const f of other.values()) add(f.docs, f.dev);
    idx = m;
    for (const e of m.values()) if (e.t > lastT && e.dev === dev) lastT = e.t;
  }
  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  /* ---- 읽기 · 쓰기 (CNCORE env) ---- */
  function read(p) { const e = idx.get(p); return e && !e.x ? clone(e.d) : null; }
  function list(prefix) {
    const out = [];
    for (const [k, e] of idx) {
      if (e.x || k.indexOf(prefix) !== 0) continue;
      if (k.slice(prefix.length).indexOf('/') >= 0) continue;
      out.push([k, clone(e.d)]);
    }
    return out.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  }
  function write(p, d) {
    const cur = idx.get(p);
    if (d == null && (!cur || cur.x)) return;
    let t = Date.now();
    if (cur && t <= cur.t) t = cur.t + 1;     /* 시계가 늦은 기기라도, 본 것보다 나중으로 */
    if (t <= lastT) t = lastT + 1;
    lastT = t;
    const w = isBlob(p) ? 'b' : 'm';
    own[w].docs[p] = d == null ? { t, x: 1 } : { t, d: clone(d) };
    idx.set(p, { t, dev, x: d == null ? 1 : 0, d: clone(d) });
    dirty[w] = true;
    if (w === 'm') saveLocal();
    schedule(600);
    emit();
  }

  /* ---- 드라이브 API ---- */
  async function api(method, url, body, headers, asText) {
    let tok;
    try { tok = await o.token(false); } catch (e) { authBad(); throw e; }
    for (let i = 0; i < 2; i++) {
      let r;
      try {
        r = await fetchFn(url.indexOf('http') === 0 ? url : API + url, { method, body, headers: Object.assign({ Authorization: 'Bearer ' + tok }, headers || {}) });
      } catch (e) { const er = new Error('인터넷 연결을 확인해 주세요.'); er.net = 1; throw er; }
      if (r.status === 401) {
        if (i === 0) { try { tok = await o.token(true); continue; } catch (e) { authBad(); throw e; } }
        authBad(); throw new Error('구글 연결이 끝났어요.');
      }
      if (!r.ok) {
        let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
        const er = new Error('구글 드라이브 오류 (' + r.status + ') ' + m); er.status = r.status; throw er;
      }
      if (!st.auth) { st.auth = true; if (st.err === 'auth') st.err = ''; setTimeout(emit, 0); }
      if (r.status === 204) return null;
      return asText ? r.text() : r.json();
    }
  }
  function authBad() {
    if (!st.auth) return;
    st.auth = false; st.err = 'auth';
    emit();
    if (o.onAuthNeeded) try { o.onAuthNeeded(); } catch (e) {}
  }
  async function download(id) {
    const t = await api('GET', 'drive/v3/files/' + id + '?alt=media', null, null, true);
    try { const j = JSON.parse(t); return j && typeof j.docs === 'object' ? j : { docs: {} }; } catch (e) { return { docs: {} }; }
  }
  async function create(name, text) {
    const bd = 'cnb' + rid(16);
    const body = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' })
      + '\r\n--' + bd + '\r\nContent-Type: application/json\r\n\r\n' + text + '\r\n--' + bd + '--';
    return api('POST', 'upload/drive/v3/files?uploadType=multipart&fields=id,version', body, { 'Content-Type': 'multipart/related; boundary=' + bd });
  }
  const update = (id, text) => api('PATCH', 'upload/drive/v3/files/' + id + '?uploadType=media&fields=id,version', text, { 'Content-Type': 'application/json' });
  const remove = id => api('DELETE', 'drive/v3/files/' + id, null, null, true).catch(() => {});
  async function gone(id) {
    try { await api('GET', 'drive/v3/files/' + id + '?fields=id'); return false; }
    catch (e) { return e.status === 404; }
  }

  /* 다른 탭(같은 기기)이 먼저 올린 내 파일 내용과 합치기 */
  function mergeOwn(w, remote) {
    const D = own[w].docs; let ch = false;
    for (const p in remote.docs || {}) {
      const e = remote.docs[p]; if (!e || typeof e.t !== 'number') continue;
      if (!D[p] || e.t > D[p].t) { D[p] = e; ch = true; }
    }
    return ch;
  }
  /* 올리기 전 정리: 다른 기기가 더 나중에 고친 내 옛 항목, 오래된 지움 표시 빼기 */
  function compact(w) {
    const D = own[w].docs, now = Date.now();
    for (const p in D) {
      const e = D[p], top = idx.get(p);
      if (top && top.dev !== dev && top.t > e.t) { delete D[p]; continue; }
      if (e.x && now - e.t > TOMB_MS) {
        let live = false;
        for (const f of other.values()) { const y = f.docs[p]; if (y && !y.x) { live = true; break; } }
        if (!live) delete D[p];
      }
    }
  }
  function needsCompact() {
    for (const p in own.m.docs) { const top = idx.get(p); if (top && top.dev !== dev && top.t > own.m.docs[p].t) return true; }
    return false;
  }

  /* 드라이브에서 앱 자료를 통째로 지웠을 때: 이 기기 사본도 지우고 다시 올리지 않기 */
  function wipe() {
    own.m = { id: '', ver: '', docs: {} }; own.b = { id: '', ver: '', docs: {} };
    dirty.m = dirty.b = false; other.clear();
    lsSet('own', null); lsSet('oth', null);
    st.wiped = true; rebuild(); emit();
  }

  const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  async function pushOne(w) {
    const f = own[w];
    if (f.id) {
      let meta = null;
      try { meta = await api('GET', 'drive/v3/files/' + f.id + '?fields=version'); }
      catch (e) {
        if (e.status !== 404) throw e;
        /* 내 파일이 없어졌어요: 드라이브 앱 자료를 통째로 지웠으면 이 기기 사본도 지우기, 아니면 같은 이름 파일로 옮기기 */
        const L = (await api('GET', LIST_URL)).files || [];
        if (!L.length) { wipe(); return; }
        const mine = L.filter(x => x.name === NAME[w]).sort(byId);
        f.id = ''; f.ver = '';
        if (mine.length) { mergeOwn(w, await download(mine[0].id)); f.id = mine[0].id; f.ver = String(mine[0].version); rebuild(); }
      }
      if (meta && String(meta.version) !== f.ver) { const r = await download(f.id); if (mergeOwn(w, r)) rebuild(); f.ver = String(meta.version); }
    }
    compact(w);
    const text = JSON.stringify({ v: 1, dev, kind, part: w, at: Date.now(), docs: f.docs });
    const r = f.id ? await update(f.id, text) : await create(NAME[w], text);
    f.id = r.id; f.ver = String(r.version);
    st.savedAt = Date.now();
  }
  function schedule(ms) {
    if (stopped) return;
    clearTimeout(pushT);
    pushT = setTimeout(() => { push().catch(() => {}); }, ms == null ? 600 : ms);
  }
  async function push() {
    if (pushing) { await pushing.catch(() => {}); }
    if (!dirty.m && !dirty.b) return;
    pushing = (async () => {
      for (const w of ['m', 'b']) {
        if (!dirty[w]) continue;
        dirty[w] = false;
        try { await pushOne(w); pushFails = 0; }
        catch (e) {
          dirty[w] = true; pushFails++;
          st.err = e.message || String(e);
          if (st.auth) schedule(Math.min(60000, 3000 * pushFails));
          throw e;
        } finally { if (w === 'm') saveLocal(); }
      }
    })();
    try { await pushing; } finally { pushing = null; emit(); }
  }

  /* ---- 동기화: 드라이브 목록을 보고, 바뀐 파일만 받기 ---- */
  async function sync() {
    const L = (await api('GET', LIST_URL)).files || [];
    let changed = false;
    const seen = new Set();
    for (const w of ['m', 'b']) {
      const mine = L.filter(x => x.name === NAME[w]).sort(byId);
      if (!mine.length) continue;
      const f = own[w], canon = mine[0];
      if (f.id !== canon.id) {      /* 처음 보는 내 예전 파일(사본을 지운 뒤 등), 또는 두 탭이 따로 만든 파일 */
        if (mergeOwn(w, await download(canon.id))) changed = true;
        f.id = canon.id; f.ver = String(canon.version); dirty[w] = true;
      } else if (String(canon.version) !== f.ver && !pushing) {
        if (mergeOwn(w, await download(canon.id))) changed = true;
        f.ver = String(canon.version);
      }
      for (const x of mine.slice(1)) { if (mergeOwn(w, await download(x.id))) changed = true; dirty[w] = true; remove(x.id); }
    }
    for (const x of L) {
      const m = FILE_RE.exec(x.name);
      if (!m || x.name === NAME.m || x.name === NAME.b) continue;
      if (kind === 'tv' && m[1] === 'blob') continue;
      seen.add(x.name);
      const cur = other.get(x.name);
      if (cur && cur.id === x.id && cur.ver === String(x.version)) continue;
      const j = await download(x.id);
      other.set(x.name, { id: x.id, ver: String(x.version), dev: String(j.dev || m[2]), docs: j.docs || {} });
      changed = true;
    }
    for (const n of [...other.keys()]) if (!seen.has(n)) { other.delete(n); changed = true; }
    if (own.m.id && !L.some(x => x.id === own.m.id) && !pushing && await gone(own.m.id)) {
      if (!L.length) { wipe(); return; }
      own.m.id = ''; own.m.ver = ''; dirty.m = true;
    }
    if (changed) { rebuild(); saveOthers(); saveLocal(); emit(); }
    st.online = true; st.syncedAt = Date.now(); if (st.err !== 'auth') st.err = '';
    if (dirty.m || dirty.b || needsCompact()) { if (needsCompact()) dirty.m = true; schedule(300); }
  }
  async function loop() {
    if (stopped) return;
    try { await sync(); fails = 0; }
    catch (e) { fails++; st.online = false; if (st.auth) st.err = e.message || String(e); emit(); }
    if (stopped) return;
    const base = o.every || 8000;
    const slow = typeof document !== 'undefined' && document.hidden && kind === 'admin' ? 4 : 1;
    loopT = setTimeout(loop, fails ? Math.min(120000, base * (fails + 1)) : base * slow);
  }

  /* ---- 시작 ---- */
  loadLocal(); rebuild();
  const hadCache = own.m.id || other.size;
  try { await sync(); }
  catch (e) {
    if (!st.auth) throw e;
    if (!hadCache) throw e;
    st.online = false; st.err = e.message || String(e);   /* 인터넷이 없어도 이 기기 사본으로 시작 */
  }
  if (dirty.m || dirty.b) schedule(200);
  loopT = setTimeout(loop, o.every || 8000);

  /* ---- CNCORE 가 쓰는 환경 ---- */
  const CACHE = new Map();
  const env = {
    read, list, write,
    props() {
      const p = read('keys/profile') || {};
      return { claimed: p.name ? '1' : '', adminKey: 'drive-admin', name: p.name || '', grade: p.grade || '', klass: p.klass || '', email: o.email ? o.email() : '' };
    },
    propsSet() { throw new Error('드라이브판은 처음 설정을 keys/profile 에 둬요'); },
    cacheGet(k) { const e = CACHE.get(k); if (!e) return null; if (Date.now() > e.exp) { CACHE.delete(k); return null; } return clone(e.v); },
    cachePut(k, v, ms) { CACHE.set(k, { v: clone(v), exp: Date.now() + ms }); },
    now: () => Date.now(),
    newKey: rid,
    ownerEmail: () => o.email ? o.email() : '',
    sheetUrl: () => '',
    driveSave() { throw new Error('드라이브판은 파일을 관리 화면에서 바로 올려요'); },
    tvDoc() { throw new Error('드라이브판은 TV 앱으로 연결해요'); }
  };
  const core = await loadCore(o.coreSrc);
  async function transport(body) {
    const res = core.handle(body, env);
    if (res && Array.isArray(res.r)) {
      for (const x of res.r) if (x.ok && x.r && typeof x.r.then === 'function') {
        try { x.r = await x.r; } catch (e) { x.ok = false; x.err = String(e && e.message || e); delete x.r; }
      }
    }
    return res;
  }

  return {
    dev, kind, env, read, list, write, transport,
    status: () => Object.assign({ dirty: dirty.m || dirty.b, files: other.size + 1 }, st),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    sync: () => sync().then(() => emit()),
    async flush() { clearTimeout(pushT); if (dirty.m || dirty.b) await push(); },
    resume() { st.auth = true; st.err = ''; clearTimeout(loopT); loop(); if (dirty.m || dirty.b) schedule(100); },
    stop() { stopped = true; clearTimeout(loopT); clearTimeout(pushT); if (othT) saveOthersNow(); },
    forgetLocal() { stopped = true; clearTimeout(loopT); clearTimeout(pushT); clearTimeout(othT); lsSet('own', null); lsSet('oth', null); },
    /* 크기 확인용 (관리 화면 저장 위치 카드) */
    size() { let n = 0; for (const e of idx.values()) if (!e.x) n++; return { docs: n, bytes: JSON.stringify(own.m.docs).length } }
  };
}

/* ================= 관리 화면: 구글 로그인(토큰) =================
 * 구글 아이덴티티 서비스(GIS) 팝업으로 한 시간짜리 열쇠(access token)를 받습니다.
 * 열쇠는 이 컴퓨터 안(localStorage)에만 두고, 제작자 서버로는 아무것도 보내지 않습니다. */
export function adminAuth(clientId) {
  const KEY = 'cn_drv_tok';
  const SCOPE = [SCOPE_APPDATA, SCOPE_FILE, 'openid', 'email', 'profile'].join(' ');
  let tok = null;
  try { tok = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  let gisP = null;
  const save = () => { try { if (tok) localStorage.setItem(KEY, JSON.stringify(tok)); else localStorage.removeItem(KEY); } catch (e) {} };
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisP) return gisP;
    gisP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gisP = null; rej(new Error('구글 로그인 창을 불러오지 못했어요. 인터넷을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
    return gisP;
  }
  const left = () => tok && tok.t ? tok.exp - Date.now() : -1;
  async function whoami() {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tok.t } });
      if (r.ok) { const j = await r.json(); tok.email = j.email || tok.email || ''; tok.name = j.name || tok.name || ''; save(); }
    } catch (e) {}
  }
  /* 반드시 단추를 누른 바로 그 순간에 부르세요 (팝업 차단 방지) */
  /* mode: 'first'(계정 고르기) | 'consent'(권한 다시 묻기) | ''(조용히) */
  function request(mode) {
    return new Promise((res, rej) => {
      if (!(window.google && google.accounts && google.accounts.oauth2)) { loadGis(); return rej(new Error('구글 로그인 창을 준비하는 중이에요. 한 번 더 눌러 주세요.')); }
      const c = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE,
        callback: r => {
          if (!r || r.error) return rej(new Error(r && r.error === 'access_denied' ? '구글 연결을 허용해야 쓸 수 있어요.' : '구글 연결 오류: ' + (r && (r.error_description || r.error) || '')));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE_APPDATA)) return rej(new Error('구글 창에서 "클래스 나우 전용 폴더" 권한에 체크해 주세요.'));
          const em = tok && tok.email || '', nm = tok && tok.name || '';
          tok = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3599) * 1000 - 60e3, email: em, name: nm,
            file: google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE_FILE) };
          save();
          whoami().then(() => res(tok.t));
        },
        error_callback: e => rej(new Error(e && e.type === 'popup_closed' ? '구글 창이 닫혔어요. 다시 눌러 주세요.'
          : e && e.type === 'popup_failed_to_open' ? '팝업이 막혔어요. 주소창 오른쪽에서 팝업을 허용해 주세요.' : '구글 연결 오류'))
      });
      const opt = { prompt: mode === 'first' ? 'select_account' : mode === 'consent' ? 'consent' : '' };
      if (mode !== 'first' && tok && tok.email) opt.login_hint = tok.email;
      c.requestAccessToken(opt);
    });
  }
  return {
    loadGis, request,
    valid: (ms) => left() > (ms || 0),
    left,
    email: () => tok && tok.email || '',
    name: () => tok && tok.name || '',
    canFile: () => !!(tok && tok.file),
    has: () => !!(tok && tok.email),
    async token(force) { if (!force && left() > 0) return tok.t; throw new Error('구글 연결이 끝났어요. [구글 다시 연결]을 눌러 주세요.'); },
    signOut() {
      const t = tok && tok.t;
      tok = null; save();
      try { if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, () => {}); } catch (e) {}
    }
  };
}

/* ================= 교실 TV: 앱(ClassNowTV)이 열쇠를 줍니다 =================
 * TV 앱은 구글 기기 코드(google.com/device)로 연결하고, 열쇠는 앱 안에만 둡니다.
 * 브라우저 미리 보기(같은 컴퓨터)에서는 관리 화면이 받아 둔 열쇠를 잠깐 빌려 씁니다. */
export function tvAuth() {
  const B = window.ClassNowTV;
  if (B && typeof B.token === 'function') {
    const W = {}; let n = 0;
    window.__cnTok = (id, t, err) => { const w = W[id]; if (!w) return; delete W[id]; clearTimeout(w.to); t ? w.res(t) : w.rej(new Error(err || '구글 연결이 끊겼어요')); };
    let cur = '', exp = 0;
    return {
      bridge: true,
      token(force) {
        if (!force && cur && Date.now() < exp) return Promise.resolve(cur);
        return new Promise((res, rej) => {
          const id = 'k' + (++n);
          W[id] = { res: t => { cur = t; exp = Date.now() + 40 * 60e3; res(t); }, rej, to: setTimeout(() => { delete W[id]; rej(new Error('TV 앱이 응답하지 않아요')); }, 45000) };
          try { B.token(id, !!force); } catch (e) { delete W[id]; rej(e); }
        });
      },
      relink() { try { B.relink && B.relink(); } catch (e) {} }
    };
  }
  return {
    bridge: false,
    token() {
      try {
        const t = JSON.parse(localStorage.getItem('cn_drv_tok') || 'null');
        if (t && t.t && t.exp > Date.now()) return Promise.resolve(t.t);
      } catch (e) {}
      return Promise.reject(new Error('관리 화면에서 구글 연결을 먼저 해 주세요'));
    },
    relink() {}
  };
}
export const tvDriveMode = () => !!(window.ClassNowTV && typeof window.ClassNowTV.isDrive === 'function' && window.ClassNowTV.isDrive());

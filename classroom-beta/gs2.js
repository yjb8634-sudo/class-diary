/* 클래스 나우 — 각자 설치판 연결층
 * 관리 화면 · 교실 TV가 쓰던 파이어베이스 모양(F.getDoc, F.onSnapshot …)을 그대로 두고,
 * 실제 통신만 '선생님 본인 구글 계정의 앱스 스크립트(설치판 저장소)'로 보냅니다.
 * 실시간 듣기(onSnapshot)는 몇 초마다 한 번에 모아 다시 읽는 방식으로 흉내 냅니다. */

/* ---- 연결 코드 (CN1.base64url{u,a|t|v}) ---- */
export function cnPack(obj) {
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  return 'CN1.' + b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function cnParse(s) {
  const m = String(s || '').trim().match(/CN1\.([A-Za-z0-9_-]{10,})/);
  if (!m) return null;
  try {
    const j = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    if (!j || !/^https:\/\/script\.google(usercontent)?\.com\//.test(String(j.u || ''))) return null;
    return j;
  } catch (e) { return null; }
}

/* ---- 자료 모양: 시각 {__ts} ↔ 화면용 ---- */
const SV_TS = { __sv: 'ts' }, SV_DEL = { __sv: 'del' };
function ts(ms) { return { seconds: Math.floor(ms / 1000), toMillis() { return ms; }, toDate() { return new Date(ms); }, __ts: ms }; }
function inflate(v) {
  if (Array.isArray(v)) return v.map(inflate);
  if (v && typeof v === 'object') {
    if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return ts(v.__ts);
    const o = {}; for (const k in v) o[k] = inflate(v[k]); return o;
  }
  return v;
}
function deflate(v) {
  if (v instanceof Date) return { __ts: v.getTime() };
  if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(deflate);
  if (v && typeof v === 'object') {
    if (v.__sv) return v;
    const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = deflate(v[k]); return o;
  }
  return v;
}

export async function fbGas(conn, opts) {
  opts = opts || {};
  const POLL = opts.poll || 6000;
  const auth = conn.a ? { a: conn.a } : conn.t ? { t: conn.t } : { vk: conn.v };

  async function call(ops) {
    const r = await fetch(conn.u, { method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ v: 1, auth, ops }) });
    if (!r.ok) throw new Error('저장소 연결 오류 (' + r.status + ')');
    const j = await r.json();
    if (!j.ok) throw new Error(j.err || '저장소 오류');
    return j.r;
  }
  async function one(op) {
    const r = (await call([op]))[0];
    if (!r.ok) { const e = new Error(r.err || '안 돼요'); if (/권한/.test(r.err || '')) e.code = 'permission-denied'; throw e; }
    return r.r;
  }

  /* ---- 경로 ---- */
  const join = (base, segs) => (base && base.path ? base.path + '/' : '') + segs.join('/');
  const rnd = n => { const a = new Uint8Array(n), abc = 'abcdefghijkmnpqrstuvwxyz23456789'; crypto.getRandomValues(a); return Array.from(a, b => abc[b % 32]).join(''); };
  function mkRef(path) { const p = path.split('/'); return { type: 'doc', path, id: p[p.length - 1], parent: { path: p.slice(0, -1).join('/') } }; }
  function doc(base, ...segs) { return mkRef(join(base, segs.length ? segs : [rnd(10)])); }
  function collection(base, ...segs) { const path = join(base, segs); return { type: 'col', path, id: path.split('/').pop() }; }
  const where = (f, op, v) => ({ f, op, v });
  const query = (c, ...w) => ({ type: 'col', path: c.path, where: w });
  function snap(path, data) { const r = mkRef(path); return { id: r.id, ref: r, exists: () => data != null, data: () => data == null ? undefined : inflate(data) }; }
  function colSnap(rows) { const docs = rows.map(([p, d]) => snap(p, d)); return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) }; }
  const qOp = q => q.type === 'doc' ? { op: 'get', path: q.path } : { op: 'list', path: q.path, where: (q.where || []).map(w => [w.f, w.op, w.v]) };

  /* ---- 듣기(폴링): 구독을 모아 몇 초마다 한 번만 요청 ---- */
  const SUBS = new Set();
  let timer = null, busy = false, fails = 0;
  function kick(ms) { clearTimeout(timer); timer = setTimeout(tick, ms == null ? POLL : ms); }
  async function tick() {
    if (busy) return kick(700);
    busy = true;
    const subs = [...SUBS];
    try {
      if (subs.length) {
        const res = await call(subs.map(s => qOp(s.q)));
        res.forEach((x, i) => {
          const s = subs[i];
          if (!SUBS.has(s)) return;
          if (!x.ok) { if (s.err && !s.sentErr) { s.sentErr = 1; s.err(Object.assign(new Error(x.err), /권한/.test(x.err || '') ? { code: 'permission-denied' } : {})); } return; }
          const j = JSON.stringify(x.r ?? null);
          if (j !== s.last) { s.last = j; s.q.type === 'doc' ? s.cb(snap(s.q.path, x.r)) : s.cb(colSnap(x.r || [])); }
        });
      }
      fails = 0;
    } catch (e) {
      if (++fails === 3) subs.forEach(s => { if (s.err) s.err(e); });
    }
    busy = false;
    const slow = typeof document !== 'undefined' && document.hidden ? 4 : 1;
    kick(fails ? Math.min(60000, POLL * (fails + 1)) : POLL * slow);
  }
  function onSnapshot(q, cb, err) {
    const s = { q: q.type ? q : { type: 'doc', path: q.path }, cb, err, last: undefined };
    SUBS.add(s); kick(1);
    return () => { SUBS.delete(s); };
  }
  const after = p => p.then(r => { kick(250); return r; });

  const F = {
    doc, collection, where, query, serverTimestamp: () => SV_TS, deleteField: () => SV_DEL,
    getDoc: ref => one({ op: 'get', path: ref.path }).then(d => snap(ref.path, d)),
    getDocs: q => one(qOp(q)).then(rows => colSnap(rows || [])),
    setDoc: (ref, data, opt) => after(one({ op: 'set', path: ref.path, data: deflate(data), merge: !!(opt && opt.merge) })),
    updateDoc: (ref, data) => after(one({ op: 'update', path: ref.path, data: deflate(data) })),
    deleteDoc: ref => after(one({ op: 'del', path: ref.path })),
    addDoc: (c, data) => { const r = doc(c); return after(one({ op: 'set', path: r.path, data: deflate(data) })).then(() => r); },
    writeBatch: () => {
      const ops = [];
      return { set(r, d, o) { ops.push({ op: 'set', path: r.path, data: deflate(d), merge: !!(o && o.merge) }); return this; },
        update(r, d) { ops.push({ op: 'update', path: r.path, data: deflate(d) }); return this; },
        delete(r) { ops.push({ op: 'del', path: r.path }); return this; },
        async commit() { const res = await call(ops); const bad = res.find(x => !x.ok); kick(250); if (bad) { const e = new Error(bad.err); if (/권한|PIN/.test(bad.err || '')) e.code = 'permission-denied'; throw e; } } };
    },
    onSnapshot
  };

  /* ---- 접속 확인 + 로그인 흉내 ---- */
  const info = (await call([{ op: 'ping' }]))[0];
  if (!info.ok) throw new Error(info.err || '저장소에 연결하지 못했어요');
  const I = info.r;
  const USER = conn.a ? { uid: 'owner', email: I.email || '', displayName: I.name || '', isAnonymous: false } : null;
  const A = {
    onAuthStateChanged(a, cb) { setTimeout(() => cb(USER), 0); return () => {}; },
    async getRedirectResult() { return null; },
    GoogleAuthProvider: class { setCustomParameters() {} addScope() {} static credentialFromResult() { return null; } },
    async signInWithPopup() { throw new Error('설치판은 연결 링크(코드)로 들어와요.'); },
    async signInWithRedirect() {}, async reauthenticateWithPopup() { throw new Error('설치판은 드라이브 저장을 저장소가 대신 해요.'); },
    async signOut() { if (opts.onSignOut) opts.onSignOut(); }
  };
  return { db: { path: '' }, F, A, auth: { currentUser: USER }, info: I, call, gasOne: one,
    stop() { clearTimeout(timer); SUBS.clear(); } };
}

/* 파일 하나를 설치판 저장소를 통해 선생님 드라이브에 올립니다 (b64 조각은 저장소가 합치지 않고 한 번에) */
export async function gasDriveSave(gfb, file, extra) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return gfb.gasOne(Object.assign({ op: 'drive', name: file.name, mime: file.type || 'application/octet-stream', b64: btoa(bin) }, extra || {}));
}

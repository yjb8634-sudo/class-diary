/* 클래스 나우 · 각자 설치판 — 연결 도우미
 * 화면(관리 화면 · 교실 TV)은 그대로 두고, 자료 읽고 쓰기만 '내 교실 서버'(선생님의 Apps Script)로 보냅니다.
 * 자료는 선생님 본인 구글 계정의 스프레드시트에만 저장됩니다. */
(function () {
  'use strict';
  var IS_ADMIN = !!window.__SN_ADMIN;
  var QS0 = new URLSearchParams(location.search);

  /* ---- 내 교실 서버 주소 · 관리 비밀번호 ---- */
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  var SN = {
    api: QS0.get('a') || lsGet('sn_api'),
    pw: IS_ADMIN ? lsGet('sn_pw') : '',
    cb: null, user: null
  };
  if (QS0.get('a') && !IS_ADMIN) lsSet('sn_api_last', QS0.get('a'));
  if (!SN.api && !IS_ADMIN) SN.api = lsGet('sn_api_last');
  if (IS_ADMIN && QS0.get('a') && !lsGet('sn_api')) lsSet('sn_api', QS0.get('a'));
  window.__SN = SN;

  function okApi(u) { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(u || '').trim()); }

  function api(fn, args) {
    if (!SN.api) return Promise.reject(new Error('내 교실 서버 주소가 없어요. 관리 화면에서 [TV 연결] 주소로 열어 주세요.'));
    return fetch(SN.api, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ __fn: fn, args: args || [], pw: SN.pw || '' }),
      redirect: 'follow', credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) throw new Error('교실 서버가 응답하지 않아요. (' + r.status + ')');
      return r.text();
    }).then(function (t) {
      var res = null;
      try { res = JSON.parse(t); } catch (e) { throw new Error('교실 서버 응답을 읽지 못했어요. Apps Script를 [새 배포]로 올렸는지, 액세스가 [모든 사용자]인지 확인해 주세요.'); }
      if (!res || !res.ok) throw new Error((res && res.e) || '교실 서버 오류');
      return res.v;
    }, function (e) {
      if (e && /교실 서버|주소가 없어요/.test(String(e.message))) throw e;
      throw new Error('인터넷 연결을 확인해 주세요.');
    });
  }
  window.__snApi = api;

  /* ---- Firestore 모양의 작은 어댑터 (화면 코드가 그대로 돌게) ---- */
  var SV_TS = function () { return { __sv: 'ts' }; };
  function join(base, segs) { return (base && base.path ? base.path + '/' : '') + segs.join('/'); }
  function rnd10() { var a = new Uint8Array(10), abc = 'abcdefghijkmnpqrstuvwxyz23456789'; crypto.getRandomValues(a); return Array.from(a, function (b) { return abc[b % 32]; }).join(''); }
  function mkRef(path) { var p = path.split('/'); return { type: 'doc', path: path, id: p[p.length - 1], parent: { path: p.slice(0, -1).join('/') } }; }
  function ts(ms) { return { seconds: Math.floor(ms / 1000), __ts: ms, toMillis: function () { return ms; }, toDate: function () { return new Date(ms); } }; }
  function inflate(v) {
    if (Array.isArray(v)) return v.map(inflate);
    if (v && typeof v === 'object') {
      if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return ts(v.__ts);
      var o = {}; for (var k in v) o[k] = inflate(v[k]); return o;
    }
    return v;
  }
  function deflate(v) {
    if (v instanceof Date) return { __ts: v.getTime() };
    if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
    if (Array.isArray(v)) return v.map(deflate);
    if (v && typeof v === 'object') {
      if (v.__sv) return v;
      var o = {}; for (var k in v) if (v[k] !== undefined) o[k] = deflate(v[k]); return o;
    }
    return v;
  }
  function snap(path, data) { var r = mkRef(path); return { id: r.id, ref: r, exists: function () { return data != null; }, data: function () { return data == null ? undefined : inflate(data); } }; }
  function store(op, a) { return api('store', [op, a]); }

  /* 실시간 대신: 한 번에 모아 몇 초마다 다시 읽기 */
  var subs = [], pollT = null, quickT = null, seq = 0;
  function reqOf(q) { return q.type === 'doc' ? { op: 'get', path: q.path } : { op: 'list', path: q.path, where: q.where || [] }; }
  function tick() {
    var live = subs.filter(function (s) { return !s.dead; });
    if (!live.length) return;
    store('multi', { reqs: live.map(function (s) { return reqOf(s.q); }) }).then(function (out) {
      live.forEach(function (s, i) {
        var r = out[i];
        if (!r) return;
        if (!r.ok) { if (!s.erred) { s.erred = 1; if (s.err) s.err(new Error(r.e || 'permission-denied')); } return; }
        var j = JSON.stringify(r.v);
        if (j === s.last) return;
        s.last = j;
        if (s.q.type === 'doc') s.cb(snap(s.q.path, r.v));
        else {
          var docs = (r.v || []).map(function (row) { return snap(row[0], row[1]); });
          s.cb({ docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } });
        }
      });
    }, function (e) {
      live.forEach(function (s) { if (!s.warned) { s.warned = 1; if (s.err) s.err(e); } });
    });
  }
  function startPoll() {
    clearInterval(pollT);
    pollT = setInterval(function () { if (!document.hidden) tick(); }, 9000);
  }
  function bump() { clearTimeout(quickT); quickT = setTimeout(tick, 350); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) bump(); });

  var F = {
    db: {},
    serverTimestamp: SV_TS,
    deleteField: function () { return { __sv: 'del' }; },
    doc: function (base) {
      var segs = Array.prototype.slice.call(arguments, 1);
      if (base && base.type === 'col' && !segs.length) return mkRef(base.path + '/' + rnd10());
      return mkRef(join(base && base.path ? base : null, segs));
    },
    collection: function (base) { var segs = Array.prototype.slice.call(arguments, 1); return { type: 'col', path: join(base && base.path ? base : null, segs), id: segs[segs.length - 1] }; },
    where: function (f, op, v) { return { f: f, op: op, v: v }; },
    query: function (c) { return { type: 'col', path: c.path, where: Array.prototype.slice.call(arguments, 1) }; },
    getDoc: function (ref) { return store('get', { path: ref.path }).then(function (d) { return snap(ref.path, d); }); },
    getDocs: function (q) {
      return store('list', { path: q.path, where: q.where || [] }).then(function (rows) {
        var docs = (rows || []).map(function (r) { return snap(r[0], r[1]); });
        return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } };
      });
    },
    setDoc: function (ref, data, opt) { return store('set', { path: ref.path, data: deflate(data), merge: !!(opt && opt.merge) }).then(bump); },
    updateDoc: function (ref, data) { return store('update', { path: ref.path, data: deflate(data) }).then(bump); },
    deleteDoc: function (ref) { return store('del', { path: ref.path }).then(bump); },
    addDoc: function (c, data) { var r = mkRef(c.path + '/' + rnd10()); return F.setDoc(r, data).then(function () { return r; }); },
    writeBatch: function () {
      var ops = [];
      return {
        set: function (r, d, o) { ops.push({ op: 'set', path: r.path, data: deflate(d), merge: !!(o && o.merge) }); return this; },
        update: function (r, d) { ops.push({ op: 'update', path: r.path, data: deflate(d) }); return this; },
        delete: function (r) { ops.push({ op: 'del', path: r.path }); return this; },
        commit: function () { return store('batch', { ops: ops }).then(bump); }
      };
    },
    onSnapshot: function (q, cb, err) {
      var s = { q: q.type ? q : { type: 'doc', path: q.path }, cb: cb, err: err, last: null, id: ++seq };
      if (q.type === 'col' || q.type === 'doc') s.q = q;
      subs.push(s);
      bump(); startPoll();
      return function () { s.dead = true; };
    }
  };

  /* ---- 로그인 모양 흉내: 관리 화면은 '내 교실 서버 연결'(주소 + 관리 비밀번호) ---- */
  var USER = { uid: 'owner', email: '담임 선생님', displayName: '', isAnonymous: false };
  function fire(u) { SN.user = u; if (SN.cb) SN.cb(u); }
  var A = {
    GoogleAuthProvider: function () { this.setCustomParameters = function () {}; this.addScope = function () {}; },
    getRedirectResult: function () { return Promise.resolve(null); },
    onAuthStateChanged: function (auth, cb) {
      SN.cb = cb;
      if (!IS_ADMIN) { setTimeout(function () { cb(null); }, 0); return function () {}; }
      if (SN.api && SN.pw) {
        api('authCheck', []).then(function (v) { fire(v && v.admin ? USER : null); }, function () { fire(null); });
      } else setTimeout(function () { fire(null); }, 0);
      return function () {};
    },
    signInWithPopup: function () { return connectModal().then(function () { fire(USER); return { user: USER }; }); },
    signInWithRedirect: function () { return A.signInWithPopup(); },
    reauthenticateWithPopup: function () { return Promise.reject(new Error('solo')); },
    signOut: function () { lsSet('sn_pw', ''); SN.pw = ''; fire(null); return Promise.resolve(); }
  };
  A.GoogleAuthProvider.credentialFromResult = function () { return null; };

  /* 연결 창 (주소 + 비밀번호) */
  function modal(html) {
    var old = document.getElementById('snModal'); if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'snModal';
    box.innerHTML = '<style>#snModal{position:fixed;inset:0;z-index:400;background:rgba(10,16,13,.74);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}' +
      '#snModal .c{background:#F4F7F5;color:#1D2A25;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.5);width:min(440px,100%);max-height:92vh;overflow:auto;padding:20px}' +
      '#snModal h3{margin:0 0 6px;font-size:19px}#snModal p{margin:0 0 12px;font-size:13.5px;line-height:1.65;color:#4B5F56}' +
      '#snModal label{display:block;font-size:13px;font-weight:700;margin:10px 0 4px}' +
      '#snModal input{display:block;width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #B9CFC4;border-radius:10px;font-size:15px;background:#fff;color:#1D2A25}' +
      '#snModal .e{color:#B33A2B;font-weight:700;font-size:13px;min-height:1.2em;margin:8px 0 0}' +
      '#snModal .bt{display:flex;gap:8px;margin-top:14px}#snModal button{flex:1;padding:11px 8px;border-radius:10px;border:1.5px solid #B9CFC4;background:#fff;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;color:#24453A}' +
      '#snModal button.p{background:#2F6B55;border-color:#2F6B55;color:#fff}</style>' +
      '<div class="c">' + html + '</div>';
    document.body.appendChild(box);
    return box;
  }
  function connectModal() {
    return new Promise(function (res, rej) {
      var box = modal('<h3>🔗 내 교실 서버 연결</h3>' +
        '<p>자료는 <b>선생님 본인 구글 계정</b>(스프레드시트)에만 저장돼요. 설치 안내를 따라 만든 <b>웹 앱 주소</b>를 넣어 주세요.</p>' +
        '<label>내 교실 서버 주소 (https://script.google.com/…/exec)</label><input id="snU" value="' + String(SN.api || '').replace(/"/g, '&quot;') + '" placeholder="설치 안내 3번에서 복사한 주소">' +
        '<label>관리 비밀번호</label><input id="snP" type="password" placeholder="처음이면 여기서 정해져요 (4자 이상)">' +
        '<p class="e" id="snE"></p><div class="bt"><button id="snC">닫기</button><button class="p" id="snGo">연결</button></div>');
      var E = function (m) { box.querySelector('#snE').textContent = m || ''; };
      box.querySelector('#snC').onclick = function () { box.remove(); rej(new Error('popup-closed')); };
      box.querySelector('#snGo').onclick = function () {
        var u = box.querySelector('#snU').value.trim(), p = box.querySelector('#snP').value;
        if (!okApi(u)) return E('주소가 올바르지 않아요. https://script.google.com/macros/s/…/exec 모양이어야 해요.');
        if (!p) return E('관리 비밀번호를 넣어 주세요.');
        E(''); this.textContent = '연결 중…';
        var btn = this;
        SN.api = u; SN.pw = p;
        api('ping', []).then(function (v) {
          return v.needPw ? api('authInit', [p]).then(function () { return { admin: true }; }) : api('authCheck', []);
        }).then(function (v) {
          if (!v.admin) throw new Error('관리 비밀번호가 맞지 않아요.');
          lsSet('sn_api', u); lsSet('sn_pw', p);
          box.remove(); res();
        }).catch(function (e) { btn.textContent = '연결'; E(String(e.message || e)); });
      };
      box.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') box.querySelector('#snGo').click(); });
      setTimeout(function () { var i = box.querySelector(okApi(SN.api) ? '#snP' : '#snU'); if (i) i.focus(); }, 50);
    });
  }
  window.__snChangePw = function () {
    var box = modal('<h3>🔑 관리 비밀번호 바꾸기</h3><p>이 반 관리 화면에 들어올 때 쓰는 비밀번호예요.</p>' +
      '<label>새 비밀번호 (4자 이상)</label><input id="snN" type="password">' +
      '<p class="e" id="snE"></p><div class="bt"><button id="snC">닫기</button><button class="p" id="snGo">바꾸기</button></div>');
    box.querySelector('#snC').onclick = function () { box.remove(); };
    box.querySelector('#snGo').onclick = function () {
      var n = box.querySelector('#snN').value;
      api('authChange', [n]).then(function () {
        SN.pw = n; lsSet('sn_pw', n);
        box.remove();
      }, function (e) { box.querySelector('#snE').textContent = String(e.message || e); });
    };
  };
  /* 하루 한 번: 보관 기간 지난 자료 정리 */
  window.__snSweep = function () {
    var k = 'sn_sweep', today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    if (lsGet(k) === today) return;
    api('sweep', []).then(function () { lsSet(k, today); }, function () {});
  };

  /* ---- fb.js 가 주던 것들 ---- */
  window.__gsfb = {
    OPERATOR: '',
    SCHOOL: { name: '강릉제일고등학교', atpt: 'K10', code: '7801097' },
    DEFAULT_PERIODS: [
      { n: '1', s: '08:40', e: '09:30' }, { n: '2', s: '09:40', e: '10:30' }, { n: '3', s: '10:40', e: '11:30' },
      { n: '4', s: '11:40', e: '12:30' }, { n: '5', s: '13:30', e: '14:20' }, { n: '6', s: '14:30', e: '15:20' },
      { n: '7', s: '15:40', e: '16:30' }
    ],
    DEFAULT_SPECIALS: [
      { name: '아침 조회시간', s: '08:30', e: '08:40' }, { name: '청소시간', s: '15:20', e: '15:40' }, { name: '종례시간', s: '16:30', e: '16:40' }
    ],
    DEFAULT_LUNCH: '12:30~13:30',
    rid: function (n) { var a = new Uint8Array(n || 18); crypto.getRandomValues(a); return Array.from(a, function (b) { return 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]; }).join(''); },
    kstToday: function () { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); },
    fb: function () {
      if (!SN.api && !IS_ADMIN) return Promise.reject(new Error('주소가 없어요'));
      return Promise.resolve({ app: {}, auth: { currentUser: USER }, db: F.db, A: A, F: F });
    }
  };
  /* 교실 TV의 ck.js(암호화) 자리: 설치판은 자료가 선생님 계정에만 있어 쓰지 않습니다 */
  window.__ckstub = {
    ok: function () { return false; },
    isSealed: function () { return false; },
    open: function () { return Promise.reject(new Error('solo')); },
    seal: function () { return Promise.reject(new Error('solo')); },
    sealBytes: function () { return Promise.reject(new Error('solo')); },
    openBytes: function () { return Promise.reject(new Error('solo')); },
    pairNew: function () { return Promise.resolve(null); },
    pairSend: function () { return Promise.reject(new Error('solo')); },
    pairOpen: function () { return Promise.reject(new Error('solo')); },
    wrap: function () { return Promise.reject(new Error('solo')); },
    unwrap: function () { return Promise.reject(new Error('solo')); },
    newRaw: function () { return ''; },
    fingerprint: function () { return Promise.resolve(''); }
  };
})();

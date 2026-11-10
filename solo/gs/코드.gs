/* ============================================================================
 * 클래스 나우 · 각자 설치판 — 우리 반 교실 서버 (Apps Script)
 *
 * 이 스크립트는 "우리 반 자료 보관함"입니다. 자료는 모두 이 스크립트 주인(담임 선생님)
 * 계정의 스프레드시트('클래스나우_자료')에만 저장됩니다. 외부 서버 · 제작자 서버는 없습니다.
 *
 * 설치(처음 한 번):
 *   1) 이 프로젝트를 [사본 만들기] 로 내 드라이브에 복사
 *   2) 오른쪽 위 [배포] > [새 배포] > 유형 '웹 앱'
 *      - 실행 사용자: '나'  /  액세스 권한: '모든 사용자'
 *   3) 나온 웹 앱 주소(https://script.google.com/macros/s/…/exec)를 복사해서
 *      클래스 나우 첫 화면의 [내 교실 서버 연결]에 붙여 넣기 → 관리 비밀번호 정하기
 *
 * 화면(관리 화면 · 교실 TV)은 GitHub Pages에서 열리고, 이 주소로 자료만 주고받습니다.
 * ========================================================================== */

var APP = '클래스 나우 교실 서버';
var VER = 'solo-2026-11-10a';
var SHEET_NAME = '클래스나우_자료';
var CHUNK = 45000;   /* 시트 한 칸 글자 수 한계(50,000)보다 작게 */

/* ---------------------------- 웹 요청 입구 ---------------------------- */

function doGet() {
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#1D2A25;color:#E4E0D3;font-family:sans-serif;text-align:center">' +
    '<div><div style="font-size:44px">✅</div><h2 style="margin:10px 0 6px">' + APP + '가 동작하고 있어요</h2>' +
    '<p style="opacity:.8;line-height:1.7;font-size:14px">이 주소는 클래스 나우 화면이 자료를 주고받는 곳이에요.<br>' +
    '이 주소를 복사해서 클래스 나우 첫 화면의 <b>[내 교실 서버 연결]</b>에 붙여 넣으세요.<br>버전 ' + VER + '</p></div></body>'
  ).setTitle(APP);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  var out = dispatch_(String(body.__fn || ''), body.args || [], String(body.pw || ''));
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(fn, args, pw) {
  var out = { ok: false, e: '알 수 없는 요청이에요.' };
  try {
    var admin = pwOk_(pw);
    if (fn === 'ping') out = { ok: true, v: { app: APP, ver: VER, needPw: !pwHash_(), admin: admin } };
    else if (fn === 'authInit') out = { ok: true, v: authInit_(String(args[0] || '')) };
    else if (fn === 'authCheck') out = { ok: true, v: { admin: admin } };
    else if (fn === 'authChange') out = { ok: true, v: authChange_(admin, String(args[0] || '')) };
    else if (fn === 'store') out = { ok: true, v: storeOp_(String(args[0] || ''), args[1] || {}, admin) };
    else if (fn === 'drive') out = { ok: true, v: driveProxy_(admin, args[0] || {}) };
    else if (fn === 'sweep') out = { ok: true, v: sweep_(admin) };
    else out = { ok: false, e: '모르는 요청(' + fn + ')이에요.' };
  } catch (err) {
    out = { ok: false, e: String((err && err.message) || err).slice(0, 300) };
  }
  return out;
}

/* ---------------------------- 관리 비밀번호 ---------------------------- */

var PROPX = null;
function props_() {
  if (typeof PropertiesService !== 'undefined') return PropertiesService.getScriptProperties();
  if (!PROPX) { var m = {}; PROPX = { getProperty: function (k) { return m[k] || null; }, setProperty: function (k, v) { m[k] = String(v); } }; }
  return PROPX;
}
function pwHash_() { return props_().getProperty('cn_pw') || ''; }
function hashPw_(pw, salt) {
  if (typeof Utilities === 'undefined') return 'T' + salt + '|' + pw;   /* Node 시험용 */
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'cnpw|' + salt + '|' + pw, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function pwOk_(pw) {
  var cur = pwHash_();
  if (!cur || !pw) return false;
  var p = cur.split('|');
  return hashPw_(pw, p[0]) === p[1];
}
function authInit_(pw) {
  if (pwHash_()) return { done: false, had: true };
  if (String(pw).length < 4) throw new Error('관리 비밀번호는 4자 이상으로 정해 주세요.');
  props_().setProperty('cn_pw', salt_() + '|' + hashPw_(pw, salt_.last));
  return { done: true };
}
function salt_() { salt_.last = (typeof Utilities !== 'undefined' ? Utilities.getUuid() : String(Math.random())).replace(/[^a-z0-9]/gi, '').slice(0, 8); return salt_.last; }
function authChange_(admin, npw) {
  if (!admin) throw new Error('permission-denied: 지금 비밀번호가 맞지 않아요.');
  if (String(npw).length < 4) throw new Error('새 비밀번호는 4자 이상으로 정해 주세요.');
  props_().setProperty('cn_pw', salt_() + '|' + hashPw_(npw, salt_.last));
  return { done: true };
}

/* ---------------------------- 자료 저장소 (시트) ----------------------------
 * 자료는 '경로 → JSON' 모양으로 시트에 한 줄씩 저장합니다. 긴 자료는 여러 칸에 나눠 담습니다.
 * 경로 예: boards/abc…xyz | boards/abc…xyz/answers/sv1_3 | keys/owner | pinbox/pk/p/3
 * -------------------------------------------------------------------------- */

function sheet_() {
  var id = props_().getProperty('cn_db');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    props_().setProperty('cn_db', ss.getId());
  }
  var sh = ss.getSheetByName('자료');
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName('자료');
    sh.getRange(1, 1, 1, 2).setValues([['경로 (손대지 마세요 — 클래스 나우가 쓰는 자료예요)', '내용']]);
  }
  return sh;
}

/* GAS가 아닌 곳(시험)에서는 memDb를 끼워 넣습니다 */
var DBX = null;
function db_() {
  if (DBX) return DBX;
  var sh = sheet_(), cache = null;
  function paths() {
    if (cache) return cache;
    var n = sh.getLastRow();
    cache = n < 2 ? [] : sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); });
    return cache;
  }
  function rowOf(path) { return paths().indexOf(path); }
  DBX = {
    read: function (path) {
      var i = rowOf(path);
      if (i < 0) return null;
      var row = sh.getRange(i + 2, 2, 1, Math.max(1, sh.getLastColumn() - 1)).getValues()[0];
      var s = row.join('');
      if (!s) return null;
      try { return JSON.parse(s); } catch (e) { return null; }
    },
    write: function (path, obj) {
      var s = JSON.stringify(obj), parts = [];
      for (var i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
      var r = rowOf(path);
      if (r < 0) { r = paths().length; cache.push(path); }
      var width = Math.max(parts.length + 1, sh.getLastColumn());
      var row = [path].concat(parts);
      while (row.length < width) row.push('');
      if (width > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
      sh.getRange(r + 2, 1, 1, width).setValues([row]);
    },
    del: function (path) {
      var r = rowOf(path);
      if (r < 0) return;
      sh.deleteRow(r + 2);
      cache.splice(r, 1);
    },
    list: function (prefix) {
      var out = [];
      paths().forEach(function (p) {
        if (p.indexOf(prefix) === 0 && p.slice(prefix.length).indexOf('/') < 0) out.push(p);
      });
      return out;
    }
  };
  return DBX;
}

function lock_(fn) {
  if (typeof LockService === 'undefined') return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------------------------- 저장소 명령 ---------------------------- */

function now_() { return Date.now(); }
function fix_(v, t) {
  if (v && typeof v === 'object') {
    if (v.__sv === 'ts') return { __ts: t };
    if (Array.isArray(v)) return v.map(function (x) { return fix_(x, t); });
    var o = {};
    for (var k in v) o[k] = fix_(v[k], t);
    return o;
  }
  return v;
}
function apply_(old, data, t) {
  var o = old ? JSON.parse(JSON.stringify(old)) : {};
  for (var k in data) {
    if (data[k] && data[k].__sv === 'del') delete o[k];
    else o[k] = fix_(data[k], t);
  }
  return o;
}
function msOf_(v) { return v && typeof v === 'object' && typeof v.__ts === 'number' ? v.__ts : 0; }

function storeOp_(op, a, admin) {
  var db = db_();
  if (op === 'get') { allowRead_(String(a.path || ''), admin, db); return db.read(String(a.path)); }
  if (op === 'list') {
    var path = String(a.path || '');
    allowList_(path, admin, db);
    var rows = db.list(path + '/').map(function (p) { return [p, db.read(p)]; });
    var w = a.where || [];
    rows = rows.filter(function (r) { return w.every(function (x) { return x.op === '==' ? (r[1] || {})[x.f] === x.v : true; }); });
    return rows;
  }
  if (op === 'multi') {
    return (a.reqs || []).map(function (r) {
      try { return { ok: true, v: storeOp_(r.op, r, admin) }; }
      catch (e) { return { ok: false, e: String(e && e.message || e).slice(0, 200) }; }
    });
  }
  if (op === 'set' || op === 'update' || op === 'del') {
    return lock_(function () { return write_(op, a, admin, db); });
  }
  if (op === 'batch') {
    return lock_(function () {
      var pre = db;   /* 규칙은 묶음 시작 시점 기준으로 함께 봅니다 (먼저 만든 사람 우선) */
      (a.ops || []).forEach(function (x) { checkWrite_(x.op, x, admin, pre); });
      (a.ops || []).forEach(function (x) { write_(x.op, x, admin, db, true); });
      return null;
    });
  }
  throw new Error('모르는 저장 명령(' + op + ')이에요.');
}

function write_(op, a, admin, db, skipCheck) {
  var path = String(a.path || '');
  if (!skipCheck) checkWrite_(op, a, admin, db);
  if (op === 'del') { db.del(path); return null; }
  var t = now_();
  var cur = db.read(path);
  if (op === 'update' && cur == null) throw new Error('not-found: ' + path);
  var next = op === 'update' || (a.merge && cur) ? apply_(cur, a.data || {}, t) : apply_(null, a.data || {}, t);
  /* 담임 자리(teachers/owner)는 늘 승인 상태로 둡니다 (운영자 승인 절차 없음) */
  if (path === 'teachers/owner') next.status = 'ok';
  db.write(path, next);
  return null;
}

/* ---------------------------- 보안 규칙 ----------------------------
 * 공용판 Firestore 규칙과 같은 약속: 교실 TV(비밀번호 없음)는 정해진 것만 쓸 수 있고,
 * 명단 고치기 · 지우기 같은 관리는 비밀번호가 맞을 때만 됩니다.
 * ------------------------------------------------------------------ */

function deny_(msg) { throw new Error('permission-denied: ' + (msg || '할 수 없는 요청이에요.')); }
function seg_(path) { return path.split('/').filter(function (x) { return x !== ''; }); }
function okKey_(k) { return typeof k === 'string' && k.length >= 20 && /^[a-z0-9]+$/.test(k); }
function okNo_(no) { return typeof no === 'number' && no >= 1 && no <= 99 && no === Math.floor(no); }
function okH_(h) { return typeof h === 'string' && h.length === 64; }
function hasOnly_(d, keys) {
  for (var k in d) if (keys.indexOf(k) < 0) return false;
  return true;
}
function board_(db, key) { return db.read('boards/' + key); }

function allowRead_(path, admin, db) {
  var s = seg_(path);
  if (admin) {
    if (s[0] === 'pinbox' && s[2] === 'p') deny_('학생 PIN은 아무도 읽을 수 없어요.');
    if (s[0] === 'pinbox' && s[2] === 'proof') deny_();
    return;
  }
  if (s[0] === 'boards' && s.length === 2 && okKey_(s[1])) return;
  if (s[0] === 'views' && s.length === 2 && okKey_(s[1])) return;
  if (s[0] === 'teachers' && s.length === 2) deny_('관리 비밀번호가 필요해요.');
  if (s[0] === 'boards' && s.length === 4 && ['answers', 'counsel', 'sevents'].indexOf(s[2]) >= 0) return;
  deny_('관리 비밀번호가 필요해요.');
}
function allowList_(path, admin, db) {
  var s = seg_(path);
  if (s[0] === 'boards' && s.length === 3 && okKey_(s[1])) {
    if (['answers', 'counsel', 'sevents'].indexOf(s[2]) >= 0) return;             /* TV가 봄 */
    if (admin && ['suggest', 'formfiles', 'freply'].indexOf(s[2]) >= 0) return;   /* 담임만 */
    if (!admin) deny_('관리 비밀번호가 필요해요.');
    return;
  }
  if (s[0] === 'pinbox' && s.length === 3 && s[2] === 'reg' && okKey_(s[1])) return;   /* PIN 만들었는지만 */
  deny_('목록은 볼 수 없어요.');
}

function checkWrite_(op, a, admin, db) {
  var path = String(a.path || ''), s = seg_(path), d = (op === 'del' ? null : a.data) || {};
  var t2 = s.length === 2, t4 = s.length === 4;

  /* 담임(비밀번호 확인됨): PIN 원본만 빼고 모두 가능 */
  if (admin) {
    if (s[0] === 'pinbox' && s[2] === 'proof') deny_();
    return;
  }

  /* ---- 아래는 교실 TV · 학생 휴대폰(비밀번호 없음) ---- */
  if (s[0] === 'boards' && t4 && okKey_(s[1])) {
    var b = board_(db, s[1]);
    if (!b) deny_('그 반을 찾지 못했어요.');
    var col = s[2], id = s[3];

    if (col === 'answers') {
      var pinOn = b.pinChange !== false && !!b.pinKey;
      var okAns = d && hasOnly_(d, ['sid', 'no', 'ch', 'etc', 'at', 'pf'])
        && typeof d.sid === 'string' && d.sid.length <= 20 && okNo_(d.no)
        && Array.isArray(d.ch) && d.ch.length <= 160
        && typeof d.etc === 'string' && d.etc.length <= 100
        && id === d.sid + '_' + d.no;
      var cur = db.read(path);
      if (op === 'set' && !cur) { if (!okAns) deny_('답 모양이 올바르지 않아요.'); return; }
      if (op === 'set' && cur) {
        if (!okAns || d.no !== cur.no || d.sid !== cur.sid) deny_('답 모양이 올바르지 않아요.');
        if (pinOn && !proofOk_(db, b.pinKey, d, cur)) deny_('이미 낸 답은 PIN을 넣어야 바꿀 수 있어요.');
        return;
      }
      if (op === 'del') { if (!pinOn) return; deny_('이미 낸 답은 PIN을 넣어야 바꿀 수 있어요.'); }
      deny_();
    }
    if (col === 'counsel') {
      if (op !== 'set' || db.read(path)) deny_('그 시간은 이미 다른 친구가 신청했어요.');
      if (!(b.counselOn === true)) deny_('지금은 상담 신청을 받지 않아요.');
      if (!hasOnly_(d, ['date', 'slot', 'no', 'name', 'at']) || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))
        || ['lunch', 'after'].indexOf(d.slot) < 0 || id !== d.date + '_' + d.slot
        || !okNo_(d.no) || typeof d.name !== 'string' || d.name.length > 20) deny_('신청 모양이 올바르지 않아요.');
      return;
    }
    if (col === 'sevents') {
      if (op === 'set' && !db.read(path)) {
        if (!(b.eventAddOn !== false)) deny_('지금은 일정을 올릴 수 없어요.');
        if (!hasOnly_(d, ['date', 'title', 'no', 'name', 'at']) || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))
          || typeof d.title !== 'string' || d.title.length < 2 || d.title.length > 40) deny_('일정 모양이 올바르지 않아요.');
        return;
      }
      if (op === 'update' && hasOnly_(d, ['gone'])) {
        var cur2 = db.read(path);
        if (!cur2 || cur2.gone) deny_('이미 지워진 일정이에요.');
        return;
      }
      deny_();
    }
    if (col === 'suggest') {
      if (op !== 'set' || db.read(path)) deny_();
      if (!(b.suggestOn === true)) deny_('지금은 건의를 받지 않아요.');
      if (!hasOnly_(d, ['text', 'no', 'name', 'at']) || typeof d.text !== 'string'
        || d.text.length < 2 || d.text.length > 300 || typeof d.no !== 'number') deny_('건의 모양이 올바르지 않아요.');
      return;
    }
    if (col === 'freply') {
      if (op !== 'set') deny_();
      if (!b.flash || String(b.flash.id || '') !== id) deny_('그 호출은 이미 끝났어요.');
      if (!hasOnly_(d, ['r', 'at']) || ['go', 'away', 'ok'].indexOf(d.r) < 0) deny_();
      return;
    }
    deny_();
  }

  /* 학생 PIN 보관함 */
  if (s[0] === 'pinbox' && okKey_(s[1]) && t4) {
    var pk = s[1], kind = s[2], no = s[3];
    if (kind === 'p') {
      if (op === 'set' && !db.read(path)) {   /* 처음 만들기: 확인표(reg)와 함께, 먼저 만든 사람 우선 */
        if (!/^[1-9][0-9]?$/.test(no) || !hasOnly_(d, ['h', 'at']) || !okH_(d.h)) deny_();
        if (db.read('pinbox/' + pk + '/reg/' + no)) deny_('이 번호는 이미 PIN이 있어요.');
        return;
      }
      if (op === 'set' && db.read(path)) {    /* 바꾸기: 지금 PIN(지문)을 알아야 */
        if (!hasOnly_(d, ['h', 'old', 'at']) || !okH_(d.h)) deny_();
        if (d.old !== db.read(path).h) deny_('지금 PIN이 맞지 않아요.');
        return;
      }
      deny_();
    }
    if (kind === 'reg') {
      if (op === 'set' && !db.read('pinbox/' + pk + '/p/' + no)
        && hasOnly_(d, ['at', 'by']) && d.by === 'student') return;
      deny_();
    }
    if (kind === 'proof') {
      if (op !== 'set' || db.read(path)) deny_();
      if (!hasOnly_(d, ['no', 'h', 'at']) || !okNo_(d.no) || !okH_(d.h)) deny_();
      var sec = db.read('pinbox/' + pk + '/p/' + d.no);
      if (!sec || sec.h !== d.h) deny_('PIN이 맞지 않아요.');
      return;
    }
  }
  deny_('관리 비밀번호가 필요해요.');
}

function proofOk_(db, pk, d, cur) {
  var pf = String(d.pf || '');
  if (!pf || pf.length < 16 || pf.length > 40) return false;
  if (cur && cur.pf === pf) return false;
  var doc = db.read('pinbox/' + pk + '/proof/' + pf);
  if (!doc) return false;
  var at = msOf_(doc.at);
  return at > 0 && now_() - at < 10 * 60e3 && doc.no === d.no;
}

/* ---------------------------- 보관 기간 자동 정리 ----------------------------
 * 관리 화면이 하루 한 번 부릅니다. 지난 자료를 지워 꼭 필요한 만큼만 남깁니다.
 * --------------------------------------------------------------------------- */

var KEEP = { ansDays: 60, counselDays: 14, suggestDays: 180, seventDays: 30 };

function sweep_(admin) {
  if (!admin) deny_('관리 비밀번호가 필요해요.');
  var db = db_(), t = now_(), day = 864e5, n = 0;
  return lock_(function () {
    var keyDoc = db.read('keys/owner') || {};
    var key = keyDoc.boardKey || '';
    if (!key) return { removed: 0 };
    var b = db.read('boards/' + key) || {};
    var sv = {};
    (b.surveys || []).forEach(function (x) { if (x && x.id) sv[x.id] = x; });
    db.list('boards/' + key + '/answers/').forEach(function (p) {
      var x = db.read(p) || {}, s0 = sv[x.sid];
      if (!s0 || (!s0.open && msOf_(x.at) && t - msOf_(x.at) > KEEP.ansDays * day)) { db.del(p); n++; }
    });
    db.list('boards/' + key + '/counsel/').forEach(function (p) {
      var x = db.read(p) || {};
      if (x.date && Date.parse(x.date) && t - Date.parse(x.date + 'T00:00:00+09:00') > KEEP.counselDays * day) { db.del(p); n++; }
    });
    db.list('boards/' + key + '/suggest/').forEach(function (p) {
      var x = db.read(p) || {};
      if (msOf_(x.at) && t - msOf_(x.at) > KEEP.suggestDays * day) { db.del(p); n++; }
    });
    db.list('boards/' + key + '/sevents/').forEach(function (p) {
      var x = db.read(p) || {};
      if (x.date && Date.parse(x.date) && t - Date.parse(x.date + 'T00:00:00+09:00') > KEEP.seventDays * day) { db.del(p); n++; }
    });
    var fid = (b.flash && b.flash.id) || '';
    db.list('boards/' + key + '/freply/').forEach(function (p) {
      if (p.split('/').pop() !== fid) { db.del(p); n++; }
    });
    /* 주인 없는 양식 조각 */
    var live = {};
    (b.forms || []).forEach(function (f) { for (var k = 0; k < (f.parts || 0); k++) live[f.fid + '_' + k] = 1; });
    db.list('boards/' + key + '/formfiles/').forEach(function (p) {
      if (!live[p.split('/').pop()]) { db.del(p); n++; }
    });
    return { removed: n };
  });
}

/* ---------------------------- 드라이브 심부름 ----------------------------
 * 관리 화면이 첨부파일을 올릴 때, 이 스크립트가 선생님 계정 권한으로 대신 올립니다.
 * (앱이 만든 파일만 다루는 drive.file 권한 — 선생님 드라이브의 다른 파일은 못 봅니다)
 * ------------------------------------------------------------------------ */

function driveProxy_(admin, a) {
  if (!admin) deny_('관리 비밀번호가 필요해요.');
  var url = String(a.url || '');
  if (url.indexOf('https://www.googleapis.com/') !== 0) deny_('허용되지 않은 주소예요.');
  var opt = {
    method: String(a.method || 'get').toLowerCase(),
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + (typeof ScriptApp !== 'undefined' ? ScriptApp.getOAuthToken() : 'test') }
  };
  if (a.b64 != null) {
    opt.payload = Utilities.base64Decode(String(a.b64));
    if (a.ct) opt.contentType = String(a.ct);
  }
  var r = (FETCHX || UrlFetchApp.fetch)(url, opt);
  return { code: r.getResponseCode(), body: r.getContentText() };
}
var FETCHX = null;

/* Node 시험용 (Apps Script에서는 아무 일도 하지 않음) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setDb: function (impl) { DBX = impl; },
    setFetch: function (fn) { FETCHX = fn; },
    dispatch: function (fn, args, pw) { return dispatch_(fn, args || [], String(pw || '')); }
  };
}

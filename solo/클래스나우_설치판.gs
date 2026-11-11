/* ═══════════════════════════════════════════════════════════════════
 * 클래스 나우 — 각자 설치판 (선생님 구글 계정에 설치하는 저장소)
 *
 * 학급 자료는 이 스프레드시트(= 선생님 본인 구글 계정)에만 저장됩니다.
 * 화면(관리 화면 · 교실 TV)은 GitHub Pages 에서 열리고, 이 저장소와만 통신합니다.
 * 제작자 서버는 없습니다. 이 파일을 지우면 모든 연결이 멈춥니다.
 *
 * 설치 방법 (약 5분, 처음 한 번):
 *  1) sheets.new 로 새 구글 시트를 만듭니다. (이름은 자유: 예 '클래스 나우 자료')
 *  2) 메뉴 [확장 프로그램] → [Apps Script] 를 엽니다.
 *  3) 열린 편집기의 코드를 모두 지우고, 이 파일 전체를 붙여 넣고 저장합니다.
 *  4) 오른쪽 위 [배포] → [새 배포] → 유형 '웹 앱'
 *     · 실행 계정: 나  · 액세스 권한: 모든 사용자   로 [배포]를 누릅니다.
 *  5) 나온 웹 앱 주소(URL)를 열면 설치 화면이 나옵니다. 이름 · 학년 · 반을 넣으면 끝!
 * ═══════════════════════════════════════════════════════════════════ */

/* 화면이 있는 곳 (바꿀 일 없음) */
var PAGES = 'https://yjb8634-sudo.github.io/class-diary/classroom/';

/* ---------- 저장소: 이 스프레드시트의 '자료' 시트 ---------- */
var CHUNK = 45000;             /* 시트 한 칸에 담는 글자 수 (칸 한계 5만보다 작게) */
var CN_SS = null, CN_ROWS = null, CN_IDX = null, CN_SHEET = null;

function ss_() {
  if (CN_SS) return CN_SS;
  CN_SS = SpreadsheetApp.getActiveSpreadsheet();
  if (!CN_SS) {                 /* 시트에 붙지 않은 채 설치한 경우: 자료 시트를 만들어 기억 */
    var id = props_().dataSsId;
    if (id) { try { CN_SS = SpreadsheetApp.openById(id); } catch (e) {} }
    if (!CN_SS) {
      CN_SS = SpreadsheetApp.create('클래스 나우 자료');
      PropertiesService.getScriptProperties().setProperty('dataSsId', CN_SS.getId());
    }
  }
  return CN_SS;
}
function sheet_() {
  if (CN_SHEET) return CN_SHEET;
  var ss = ss_();
  CN_SHEET = ss.getSheetByName('자료') || ss.insertSheet('자료');
  return CN_SHEET;
}
function loadAll_() {
  if (CN_ROWS) return;
  CN_ROWS = []; CN_IDX = {};
  var sh = sheet_(), n = sh.getLastRow();
  if (n < 1) return;
  var vals = sh.getRange(1, 1, n, Math.max(2, sh.getLastColumn())).getValues();
  for (var i = 0; i < vals.length; i++) {
    var path = String(vals[i][0] || '');
    if (!path) continue;
    CN_ROWS.push({ row: i + 1, path: path });
    CN_IDX[path] = { row: i + 1, json: vals[i].slice(2).join('') };
  }
}
function storeRead_(path) {
  loadAll_();
  var hit = CN_IDX[path];
  if (!hit || !hit.json) return null;
  try { return JSON.parse(hit.json); } catch (e) { return null; }
}
function storeList_(prefix) {
  loadAll_();
  var out = [];
  for (var p in CN_IDX) {
    if (p.indexOf(prefix) === 0 && p.slice(prefix.length).indexOf('/') < 0) {
      var d = storeRead_(p);
      if (d) out.push([p, d]);
    }
  }
  out.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  return out;
}
function storeWrite_(path, doc) {
  loadAll_();
  var sh = sheet_(), hit = CN_IDX[path];
  if (doc == null) {
    if (hit) { sh.getRange(hit.row, 1, 1, sh.getLastColumn() || 2).clearContent(); delete CN_IDX[path]; }
    return;
  }
  var json = JSON.stringify(doc), cells = [path, Date.now()];
  for (var i = 0; i < json.length; i += CHUNK) cells.push(json.slice(i, i + CHUNK));
  var row = hit ? hit.row : 0;
  if (!row) {                   /* 빈 줄 재사용 → 없으면 맨 아래 */
    var last = sh.getLastRow();
    for (var r = 1; r <= last && !row; r++) if (!CN_IDX_rowUsed_(r)) row = r;
    if (!row) row = last + 1;
  }
  var width = Math.max(cells.length, sh.getLastColumn() || 1);
  var line = cells.concat(new Array(Math.max(0, width - cells.length)).fill(''));
  sh.getRange(row, 1, 1, line.length).setValues([line]);
  CN_IDX[path] = { row: row, json: json };
}
function CN_IDX_rowUsed_(r) {
  for (var p in CN_IDX) if (CN_IDX[p].row === r) return true;
  return false;
}

/* ---------- 설정 · 캐시 · 열쇠 ---------- */
function props_() { return PropertiesService.getScriptProperties().getProperties(); }
function env_() {
  return {
    now: function () { return Date.now(); },
    read: storeRead_, list: storeList_, write: storeWrite_,
    props: props_,
    propsSet: function (o) { PropertiesService.getScriptProperties().setProperties(o); },
    cacheGet: function (k) { var v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; },
    cachePut: function (k, v, ms) { CacheService.getScriptCache().put(k, JSON.stringify(v), Math.ceil(ms / 1000)); },
    newKey: function (n) {
      var abc = 'abcdefghijkmnpqrstuvwxyz23456789', s = '';
      for (var i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
      return s;
    },
    ownerEmail: function () { try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) { return ''; } },
    sheetUrl: function () { try { return ss_().getUrl(); } catch (e) { return ''; } },
    driveSave: driveSave_,
    tvDoc: tvDoc_
  };
}

/* ---------- 첨부파일: 선생님 드라이브에 저장 ---------- */
function folder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function driveSave_(o) {
  var blob = Utilities.newBlob(Utilities.base64Decode(o.b64), o.mime || 'application/octet-stream', o.name || '파일');
  var f = folder_(o.folder || '교실화면_첨부').createFile(blob);
  if (o.share !== false) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: f.getId(), name: f.getName(), mime: blob.getContentType(), url: 'https://drive.google.com/file/d/' + f.getId() + '/view' };
}
/* 교실 TV 연결 문서: TV에서 드라이브 앱을 열고 이 문서의 링크를 누르면 연결됩니다 */
function tvDoc_(o) {
  var name = '클래스 나우 — 교실 TV 연결';
  var it = DriveApp.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  var doc = DocumentApp.create(name), body = doc.getBody();
  body.appendParagraph('교실 TV 연결').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('교실 TV(전자칠판)에서 이 문서를 열고, 아래 글자를 한 번 누르면 우리 반 화면이 연결됩니다.');
  body.appendParagraph('');
  body.appendParagraph('▶ 여기를 눌러 우리 반 TV 연결하기').setLinkUrl(String(o.link || ''));
  body.appendParagraph('');
  body.appendParagraph('이 문서와 링크는 우리 반 TV 열쇠입니다. 학생 · 학부모와 공유하지 마세요.').editAsText().setItalic(true);
  doc.saveAndClose();
  return { url: doc.getUrl() };
}

/* ---------- 바깥에서 들어오는 요청 ---------- */
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, err: '요청을 읽지 못했어요' }); }
  var hasWrite = (req.ops || []).some(function (o) { return ['set', 'update', 'del', 'drive', 'tvdoc'].indexOf(o.op) >= 0; });
  var lock = null;
  if (hasWrite) { lock = LockService.getScriptLock(); lock.waitLock(20000); }
  try { return json_(CNCORE.handle(req, env_())); }
  finally { if (lock) lock.releaseLock(); }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- 설치 화면 (웹 앱 주소를 브라우저에서 열면 나옵니다) ---------- */
function doGet(e) {
  return HtmlService.createHtmlOutput(setupHtml_())
    .setTitle('클래스 나우 설치')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function execUrl_() { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } }
function pack_(obj) { return 'CN1.' + Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, ''); }
function adminLink_(p) { return PAGES + '#g=' + pack_({ u: execUrl_(), a: p.adminKey }); }

function cnInfo() {
  var p = props_();
  return { claimed: !!p.claimed, name: p.name || '', grade: p.grade || '', klass: p.klass || '', ver: (typeof CNCORE !== 'undefined' && CNCORE.VER) || '', url: execUrl_() };
}
function cnClaim(f) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    CNCORE.claim(f, env_());
    sheet_();                                   /* 자료 시트 준비 */
    return { link: adminLink_(props_()) };
  } finally { lock.releaseLock(); }
}
/* 연결 코드 다시 보기: 이 파일의 주인(선생님 본인)이 로그인한 채 열었을 때만 */
function cnReveal() {
  var a = '', b = '';
  try { a = Session.getActiveUser().getEmail(); b = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (!a || a !== b) throw new Error('이 스크립트의 주인 계정으로 로그인한 브라우저에서만 볼 수 있어요.');
  var p = props_();
  if (!p.claimed) throw new Error('아직 설치 전이에요.');
  return { link: adminLink_(p) };
}

function setupHtml_() {
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'body{font-family:"Malgun Gothic",AppleGothic,sans-serif;background:#1D2A25;color:#E4E0D3;margin:0;display:flex;justify-content:center;padding:28px 14px}'
    + '.card{max-width:560px;width:100%;background:#24352E;border:1px solid #3A4F45;border-radius:18px;padding:26px 24px}'
    + 'h1{font-size:22px;margin:0 0 6px;color:#F2D16B}p{line-height:1.7;font-size:14.5px;margin:8px 0}'
    + 'label{display:block;margin:12px 0 4px;font-size:14px;color:#BFD0C6}'
    + 'input,select{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1.5px solid #3A4F45;background:#1D2A25;color:#E4E0D3;font-size:16px}'
    + 'button{margin-top:16px;width:100%;padding:13px;border:0;border-radius:11px;background:#E6B84A;color:#2A2108;font-weight:700;font-size:16px;cursor:pointer}'
    + 'button[disabled]{opacity:.6}.ok{background:#17251F;border:1.5px solid #2F6B55;border-radius:12px;padding:12px 14px;margin-top:14px;word-break:break-all;font-size:13.5px}'
    + 'a.big{display:block;margin-top:16px;text-align:center;padding:13px;border-radius:11px;background:#2F6B55;color:#fff;font-weight:700;text-decoration:none;font-size:16px}'
    + '.err{color:#F2A6A0;font-weight:700;min-height:1.2em;margin-top:10px;font-size:13.5px}.muted{color:#8FA398;font-size:12.5px}'
    + '</style></head><body><div class="card" id="c"><h1>클래스 나우 설치</h1><p>확인하는 중…</p></div>'
    + '<scr' + 'ipt>'
    + 'function render(i){var c=document.getElementById("c");'
    + 'if(!i.claimed){c.innerHTML=\'<h1>클래스 나우 설치</h1>'
    + '<p>거의 다 왔어요! 이름 · 학년 · 반을 넣으면 <b>이 구글 계정에만 저장되는</b> 우리 반 클래스 나우가 만들어져요.</p>'
    + '<label>선생님 이름</label><input id="n" maxlength="20" placeholder="예: 유준배">'
    + '<label>학년</label><select id="g"><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select>'
    + '<label>반</label><input id="k" inputmode="numeric" maxlength="2" placeholder="예: 2">'
    + '<button id="go">설치하기</button><p class="err" id="e"></p>\';'
    + 'document.getElementById("go").onclick=function(){var b=this;b.disabled=true;b.textContent="설치하는 중…";'
    + 'google.script.run.withSuccessHandler(done).withFailureHandler(function(er){b.disabled=false;b.textContent="설치하기";document.getElementById("e").textContent=String(er.message||er);})'
    + '.cnClaim({name:document.getElementById("n").value,grade:document.getElementById("g").value,klass:document.getElementById("k").value});};}'
    + 'else{c.innerHTML=\'<h1>설치가 끝났어요 ✓</h1><p><b>\'+i.name+\'</b> 선생님 · \'+i.grade+\'학년 \'+i.klass+\'반 (\'+i.ver+\')</p>'
    + '<p>클래스 나우는 아래 단추로 엽니다. 연결 코드가 필요하면(다른 기기에서 열 때) 다시 보기를 누르세요.</p>'
    + '<button id="rv">연결 코드(열기 링크) 다시 보기</button><p class="err" id="e"></p>'
    + '<p class="muted">연결 코드는 우리 반 관리 비밀번호와 같아요. 다른 사람에게 보내지 마세요.</p>\';'
    + 'document.getElementById("rv").onclick=function(){var b=this;b.disabled=true;'
    + 'google.script.run.withSuccessHandler(function(r){show(r.link);}).withFailureHandler(function(er){b.disabled=false;document.getElementById("e").textContent=String(er.message||er);}).cnReveal();};}}'
    + 'function done(r){show(r.link);}'
    + 'function show(link){var c=document.getElementById("c");'
    + 'c.innerHTML=\'<h1>연결 준비 완료 ✓</h1>'
    + '<p>아래 단추를 누르면 <b>클래스 나우</b>가 열리고, 이 컴퓨터(브라우저)가 자동으로 연결돼요.</p>'
    + '<a class="big" href="\'+link+\'" target="_blank" rel="noopener">클래스 나우 열기</a>'
    + '<p style="margin-top:16px">다른 기기(휴대폰 등)에서도 쓰려면 아래 연결 링크를 나에게 보내서(카톡 · 메일) 그 기기에서 한 번 열면 돼요.</p>'
    + '<div class="ok" id="lk"></div><button id="cp">연결 링크 복사</button>'
    + '<p class="muted">⚠ 이 링크는 우리 반 관리 비밀번호입니다. 학생 · 학부모 · 다른 선생님에게 보내지 마세요.</p>\';'
    + 'document.getElementById("lk").textContent=link;'
    + 'document.getElementById("cp").onclick=function(){var t=document.createElement("textarea");t.value=link;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();this.textContent="복사했어요 ✓";};}'
    + 'google.script.run.withSuccessHandler(render).cnInfo();'
    + '</scr' + 'ipt></body></html>';
}


/* 클래스 나우 — 각자 설치판 핵심 로직
 * 선생님 구글 시트를 작은 자료 저장소로 쓰고, 누가 무엇을 할 수 있는지(권한)를 지킵니다.
 * 권한 규칙은 공용판의 firebase/firestore.rules 를 그대로 옮긴 것입니다.
 * 이 파일은 앱스 스크립트(설치판)와 Node(자동 시험)에서 똑같이 돌아갑니다. GS 전용 기능은 env 로만 받습니다. */
var CNCORE = (function () {
  'use strict';
  var VER = 'solo-2026-11-10a';
  var DOC_MAX = 980000;          /* 문서 하나 최대 글자 수 (학교 양식 조각 700k + 여유) */
  var PROOF_MS = 10 * 60e3;      /* PIN 확인증 유효 시간 */

  /* ---------- 자료 모양 (공용판과 같은 전선 형식) ----------
   * 시각은 {__ts: 밀리초}, '지금 시각' 표시는 {__sv:'ts'}, '칸 지우기'는 {__sv:'del'} */
  function fix(v, now) {
    if (v && v.__sv === 'ts') return { __ts: now };
    if (Array.isArray(v)) return v.map(function (x) { return fix(x, now); });
    if (v && typeof v === 'object' && !('__ts' in v)) {
      var o = {};
      for (var k in v) o[k] = fix(v[k], now);
      return o;
    }
    return v;
  }
  function applyPatch(old, data, now) {
    var o = old ? JSON.parse(JSON.stringify(old)) : {};
    for (var k in data) {
      var v = data[k];
      if (v && v.__sv === 'del') delete o[k];
      else o[k] = fix(v, now);
    }
    return o;
  }
  function tsOf(v) { return v && typeof v.__ts === 'number' ? v.__ts : 0; }

  /* ---------- 작은 도우미 ---------- */
  function isStr(v, min, max) { return typeof v === 'string' && v.length >= (min || 0) && v.length <= (max == null ? 1 / 0 : max); }
  function isInt(v, a, b) { return typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b; }
  function keysOnly(d, allowed) {
    for (var k in d) if (allowed.indexOf(k) < 0) return false;
    return true;
  }
  function okKey(k) { return isStr(k, 16, 40) && /^[a-z0-9]+$/.test(k); }

  /* ---------- 권한: 교실 TV(열쇠 t)가 할 수 있는 일 ---------- */
  function pinOn(board) { return !!(board && board.pinKey) && board.pinChange !== false; }
  function okAns(d, id) {
    return keysOnly(d, ['sid', 'no', 'ch', 'etc', 'at', 'pf'])
      && isStr(d.sid, 1, 20) && isInt(d.no, 1, 99)
      && Array.isArray(d.ch) && d.ch.length <= 160
      && isStr(d.etc || '', 0, 100)
      && id === d.sid + '_' + d.no;
  }
  function proofOk(pk, d, old, env) {
    if (!isStr(d.pf, 16, 40)) return false;
    if (old && old.pf === d.pf) return false;
    var p = env.cacheGet('pf:' + pk + ':' + d.pf);
    return !!(p && p.no === d.no && env.now() - p.at < PROOF_MS);
  }
  function tvAllow(op, seg, data, env, key) {
    var path = seg.join('/');
    if (seg[0] === 'boards' && seg[1] === key) {
      if (seg.length === 2) return op === 'get';
      if (op === 'list' ? seg.length !== 3 : seg.length !== 4) return false;
      var board = env.read('boards/' + key);
      if (!board) return false;
      var col = seg[2], id = seg[3] || '', old = id ? env.read(path) : null;
      if (col === 'answers') {
        if (op === 'get' || op === 'list') return true;
        if (op === 'set') {
          if (!okAns(data, id)) return false;
          if (!old) return true;
          return data.no === old.no && data.sid === old.sid && (!pinOn(board) || proofOk(board.pinKey, data, old, env));
        }
        if (op === 'del') return !!old && !pinOn(board);
        return false;
      }
      if (col === 'counsel') {
        if (op === 'get' || op === 'list') return true;
        if (op !== 'set' || old) return false;
        return board.counselOn === true
          && keysOnly(data, ['date', 'slot', 'no', 'name', 'at'])
          && isStr(data.date) && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
          && (data.slot === 'lunch' || data.slot === 'after')
          && id === data.date + '_' + data.slot
          && isInt(data.no, 1, 99) && isStr(data.name || '', 0, 20);
      }
      if (col === 'sevents') {
        if (op === 'get' || op === 'list') return true;
        if (op === 'set') {
          return !old && board.eventAddOn !== false
            && keysOnly(data, ['date', 'title', 'no', 'name', 'at'])
            && isStr(data.date) && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
            && isStr(data.title, 2, 40) && isInt(data.no, 0, 99) && isStr(data.name || '', 0, 20);
        }
        if (op === 'update') return !!old && !('gone' in old) && keysOnly(data, ['gone']);
        return false;
      }
      if (col === 'suggest') {
        if (op !== 'set' || old) return false;
        return board.suggestOn === true
          && keysOnly(data, ['text', 'no', 'name', 'at'])
          && isStr(data.text, 2, 300) && isInt(data.no, 0, 99) && isStr(data.name || '', 0, 20);
      }
      if (col === 'freply') {
        if (op !== 'set' || old) return false;
        return !!(board.flash && board.flash.id === id)
          && keysOnly(data, ['r', 'at'])
          && ['go', 'away', 'ok'].indexOf(data.r) >= 0;
      }
      return false;   /* formfiles 등은 TV가 못 봅니다 */
    }
    if (seg[0] === 'pinbox' && okKey(seg[1])) {
      var pk = seg[1], box = env.read('pinbox/' + pk);
      if (!box) return false;
      if (op === 'list') return seg.length === 3 && seg[2] === 'reg';
      if (seg.length !== 4) return false;
      var no = seg[3], cur = env.read(seg.join('/'));
      if (!/^[1-9][0-9]?$/.test(no)) return false;
      if (seg[2] === 'p') {
        if (op !== 'set') return false;
        if (!cur) return keysOnly(data, ['h', 'at']) && isStr(data.h, 64, 64);
        return keysOnly(data, ['h', 'old', 'at']) && isStr(data.h, 64, 64) && data.old === cur.h;
      }
      if (seg[2] === 'reg') {
        if (op === 'get' || op === 'list') return true;
        return op === 'set' && !cur && keysOnly(data, ['at', 'by']) && data.by === 'student';
      }
      return false;   /* proof 는 아래 handle 에서 따로 (저장소에 남기지 않음) */
    }
    return false;
  }

  /* ---------- 요청 처리 ---------- */
  function who(auth, env) {
    auth = auth || {};
    var p = env.props();
    if (auth.a && p.claimed && auth.a === p.adminKey) return { kind: 'admin' };
    if (okKey(auth.t || '')) return { kind: 'tv', key: auth.t };
    if (okKey(auth.vk || '')) return { kind: 'view', key: auth.vk };
    return { kind: 'anon' };
  }
  function adminAllow(op, seg) {
    var root = seg[0];
    if (['boards', 'views', 'keys', 'pinbox'].indexOf(root) < 0) return false;
    if (root === 'pinbox' && seg[2] === 'p' && (op === 'get' || op === 'list')) return false;   /* PIN 지문은 담임도 못 읽음 */
    return true;
  }
  function oneOp(o, me, env) {
    var op = o.op;
    if (op === 'ping') {
      var p = env.props();
      var r = { ver: VER, claimed: !!p.claimed, app: '클래스 나우 설치판' };
      if (me.kind === 'admin') {
        r.name = p.name || ''; r.grade = p.grade || ''; r.klass = p.klass || '';
        r.email = p.email || ''; r.sheetUrl = env.sheetUrl ? env.sheetUrl() : '';
        if (env.pingExtra) { try { Object.assign(r, env.pingExtra() || {}); } catch (e2) {} }
      }
      return r;
    }
    if (me.kind === 'anon') throw new Error('연결 열쇠가 없어요');
    if (op === 'drive' || op === 'tvdoc') {
      if (me.kind !== 'admin') throw new Error('권한이 없어요');
      return op === 'drive' ? env.driveSave(o) : env.tvDoc(o);
    }
    /* 판마다 다른 요청(데스크톱판의 TV 짝지음 등)은 env 가 맡습니다 */
    if (env.extraOp) {
      var ex = env.extraOp(op, o, me.kind);
      if (ex !== undefined) return ex;
    }
    var seg = String(o.path || '').split('/').filter(Boolean);
    if (!seg.length || seg.length % 2 && op !== 'list') throw new Error('주소가 올바르지 않아요: ' + o.path);
    var path = seg.join('/');

    /* PIN 확인증: 저장소에 남기지 않고 짧게 기억만 */
    if (seg[0] === 'pinbox' && seg[2] === 'proof') {
      if (op !== 'set' || me.kind === 'view') throw new Error('권한이 없어요');
      var sec = env.read('pinbox/' + seg[1] + '/p/' + ((o.data || {}).no));
      if (!sec || sec.h !== (o.data || {}).h) throw new Error('PIN이 맞지 않아요');
      env.cachePut('pf:' + seg[1] + ':' + seg[3], { no: o.data.no, at: env.now() }, PROOF_MS);
      return null;
    }

    var ok;
    if (me.kind === 'admin') ok = adminAllow(op, seg);
    else if (me.kind === 'view') ok = op === 'get' && path === 'views/' + me.key;
    else ok = tvAllow(op, seg, o.data, env, me.key);
    if (!ok) throw new Error('권한이 없어요: ' + op + ' ' + seg[0] + (seg[2] ? '/' + seg[2] : ''));

    if (op === 'get') return env.read(path) || null;
    if (op === 'list') {
      var rows = env.list(path + '/');
      var w = o.where || [];
      return rows.filter(function (r) {
        return w.every(function (c) { return c[1] === '==' ? r[1][c[0]] === c[2] : true; });
      });
    }
    if (op === 'set') {
      var next = o.merge ? applyPatch(env.read(path), o.data || {}, env.now()) : applyPatch(null, o.data || {}, env.now());
      if (JSON.stringify(next).length > DOC_MAX) throw new Error('자료가 너무 커요');
      env.write(path, next);
      return null;
    }
    if (op === 'update') {
      var old = env.read(path);
      if (!old) throw new Error('없는 자료예요: ' + seg[0]);
      var next2 = applyPatch(old, o.data || {}, env.now());
      if (JSON.stringify(next2).length > DOC_MAX) throw new Error('자료가 너무 커요');
      env.write(path, next2);
      return null;
    }
    if (op === 'del') { env.write(path, null); return null; }
    throw new Error('모르는 요청이에요: ' + op);
  }
  function handle(req, env) {
    req = req || {};
    var me = who(req.auth, env);
    var out = [];
    var ops = Array.isArray(req.ops) ? req.ops : [];
    if (ops.length > 60) return { ok: false, err: '요청이 너무 많아요' };
    for (var i = 0; i < ops.length; i++) {
      try { out.push({ ok: true, r: oneOp(ops[i], me, env) }); }
      catch (e) { out.push({ ok: false, err: String(e && e.message || e) }); }
    }
    return { ok: true, r: out, now: env.now(), ver: VER };
  }

  /* ---------- 설치 (처음 한 번) ---------- */
  function claim(f, env) {
    var p = env.props();
    if (p.claimed) throw new Error('이미 설치가 끝났어요. 연결 코드는 이 화면의 [연결 코드 다시 보기]에서 확인하세요.');
    var name = String(f && f.name || '').trim().slice(0, 20);
    var grade = String(f && f.grade || '').trim();
    var klass = String(f && f.klass || '').trim();
    if (name.length < 2) throw new Error('이름을 적어 주세요.');
    if (['1', '2', '3'].indexOf(grade) < 0) throw new Error('학년은 1 · 2 · 3 중에서 골라 주세요.');
    if (!/^[1-9][0-9]?$/.test(klass)) throw new Error('반은 숫자로 적어 주세요.');
    var adminKey = env.newKey(28);
    env.propsSet({ claimed: '1', adminKey: adminKey, name: name, grade: grade, klass: klass, email: env.ownerEmail ? env.ownerEmail() : '', ver: VER });
    return adminKey;
  }

  return { VER: VER, handle: handle, claim: claim, applyPatch: applyPatch, tsOf: tsOf };
})();
if (typeof module !== 'undefined') module.exports = CNCORE;

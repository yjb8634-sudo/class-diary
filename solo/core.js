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

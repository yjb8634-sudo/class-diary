/**
 * 선생님 상담하고 싶어요. — 학급 상담 신청판
 * 구글 스프레드시트 + Apps Script 웹앱
 *
 * 학생은 로그인 없이 링크만 열면 신청할 수 있고,
 * '하고 싶은 이야기'는 이 시트 안에만 남습니다.
 * 웹 페이지로는 절대 내려보내지 않기 때문에 소스를 열어봐도 보이지 않습니다.
 */
var FILEVER_상담 = '2026-11-01a';

var SH_BOOK = '상담신청';
var SH_CONF = '설정';
var SH_OFF  = '상담휴무';
var TZ = 'Asia/Seoul';

/* 신청 시트의 칸 순서. 8~11번 칸이 상담을 마친 뒤 적는 상담일지입니다. 12번 칸은 생기부 영역입니다. */
var 신청머리 = ['번호', '날짜', '구분', '학번', '이름', '하고 싶은 이야기', '신청한 때',
                '상담 내용', '후속 조치', '상태', '기록한 때', '생기부영역'];
var 상태값 = ['완료', '불참', '취소'];

var 기본설정 = [
  ['관리자비밀번호', ''],
  ['조회키', ''],
  ['부제', '강릉제일고 1학년 2반'],
  ['담임', '유준배 선생님'],
  ['안내문구', '상담 시간은 20분이에요. 편한 날짜와 시간을 골라 학번과 이름을 남겨 주세요.'],
  ['점심시간', '13:00~13:20'],
  ['방과후시간', '16:30~16:50'],
  ['이름공개', '예'],
  ['시작일', '2026-09-01'],
  ['종료일', '2026-12-31']
];

/* 2026년 2학기 공휴일 — 휴무 시트에 처음 한 번 자동으로 채워집니다. */
var 공휴일 = [
  ['2026-09-24', '추석 연휴'],
  ['2026-09-25', '추석'],
  ['2026-10-05', '개천절 대체휴일'],
  ['2026-10-09', '한글날'],
  ['2026-12-25', '성탄절']
];

/* ---------- 웹 페이지 / 조회 API ---------- */
function 상담페이지_(e) {
  준비();
  var key = (e && e.parameter) ? String(e.parameter.key || '') : '';
  if (key) {
    var s = 설정읽기();
    var ok = !!(s['조회키']) && key === s['조회키'];
    var body = ok ? 오늘일정() : { ok: false, reason: 'auth' };
    return ContentService.createTextOutput(JSON.stringify(body))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return 화면내보내기_(상담화면값_((e && e.parameter) || {}));
}
function 상담화면값_(pr) {
  return { template: '상담화면', vars: { app: String(pr.app || '') === '1' ? 'true' : 'false' }, title: '선생님 상담하고 싶어요.' };
}

/* ---------- 시트 준비 ---------- */
/* 속도: 시트 점검(준비)은 한 시간에 한 번만, 공개 달력은 20초 동안 저장본을 씁니다.
   신청 · 수정이 있으면 저장본을 바로 비웁니다. 시트를 손으로 고치면 onEdit가 비웁니다. */
var 상담캐시키_ = 'cs_pub_v1', 상담준비키_ = 'cs_ready_v1';
function 상담캐시비우기_() { try { CacheService.getScriptCache().remove(상담캐시키_); } catch (e) {} }
function 준비(강제) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var 저장소 = null;
  try { 저장소 = CacheService.getScriptCache(); } catch (e) {}
  if (!강제 && 저장소 && 저장소.get(상담준비키_)) return ss;
  준비본문_(ss);
  if (typeof cfgBust_ === 'function') cfgBust_();
  try { if (저장소) 저장소.put(상담준비키_, '1', 3600); } catch (e) {}
  return ss;
}
function 준비본문_(ss) {

  var b = ss.getSheetByName(SH_BOOK);
  if (!b) {
    b = ss.insertSheet(SH_BOOK);
    b.getRange(1, 1, 1, 신청머리.length).setValues([신청머리]).setFontWeight('bold');
    b.setFrozenRows(1);
    b.setColumnWidth(1, 120);
    b.setColumnWidth(6, 320);
    b.setColumnWidth(8, 360);
    b.setColumnWidth(9, 240);
  } else {
    /* 예전 버전(더 적은 칸)으로 만들어 둔 시트라면 뒤에 칸을 덧붙인다. 기존 신청은 그대로 남는다. */
    if (b.getMaxColumns() < 신청머리.length) {
      b.insertColumnsAfter(b.getMaxColumns(), 신청머리.length - b.getMaxColumns());
    }
    var 지금칸 = b.getLastColumn();
    if (지금칸 < 신청머리.length) {
      b.getRange(1, 지금칸 + 1, 1, 신청머리.length - 지금칸)
        .setValues([신청머리.slice(지금칸)]).setFontWeight('bold');
      b.setColumnWidth(8, 360);
      b.setColumnWidth(9, 240);
    }
  }

  var c = ss.getSheetByName(SH_CONF);
  if (!c) {
    c = ss.insertSheet(SH_CONF);
    c.getRange(1, 1, 1, 2).setValues([['항목', '값']]).setFontWeight('bold');
    c.getRange(2, 1, 기본설정.length, 2).setValues(기본설정);
    c.setColumnWidth(1, 160);
    c.setColumnWidth(2, 420);
    c.setFrozenRows(1);
  } else {
    var 있는것 = {};
    var 값 = c.getDataRange().getValues();
    for (var i = 1; i < 값.length; i++) 있는것[String(값[i][0]).trim()] = true;
    기본설정.forEach(function (row) {
      if (!있는것[row[0]]) c.appendRow(row);
    });
  }

  var o = ss.getSheetByName(SH_OFF);
  if (!o) {
    o = ss.insertSheet(SH_OFF);
    o.getRange(1, 1, 1, 3).setValues([['날짜', '구분', '이유']]).setFontWeight('bold');
    o.setFrozenRows(1);
    o.setColumnWidth(1, 120);
    o.setColumnWidth(2, 110);
    o.setColumnWidth(3, 220);
    var 공휴일행 = 공휴일.map(function (r) { return [r[0], '전체', r[1]]; });
    o.getRange(2, 1, 공휴일행.length, 3).setValues(공휴일행);
  } else {
    /* 예전 버전(날짜·이유 2칸)이면 가운데에 '구분' 칸을 끼워 넣고, 있던 휴무는 모두 '전체'로 채운다. */
    var 휴무머리 = o.getRange(1, 1, 1, Math.max(2, o.getLastColumn())).getValues()[0];
    if (String(휴무머리[1] || '').trim() !== '구분') {
      var 휴무마지막행 = o.getLastRow();
      o.insertColumnAfter(1);
      o.getRange(1, 1, 1, 3).setValues([['날짜', '구분', '이유']]).setFontWeight('bold');
      if (휴무마지막행 >= 2) {
        var 전체채우기 = [];
        for (var oi = 0; oi < 휴무마지막행 - 1; oi++) 전체채우기.push(['전체']);
        o.getRange(2, 2, 전체채우기.length, 1).setValues(전체채우기);
      }
      o.setColumnWidth(2, 110);
      o.setColumnWidth(3, 220);
    }
  }

  /* 카톡 알림 등 외부 조회용 키가 비어 있으면 한 번만 자동으로 만들어 둔다. */
  var 값들 = c.getDataRange().getValues();
  var 키있음 = false, 키행 = -1;
  for (var q = 1; q < 값들.length; q++) {
    if (String(값들[q][0]).trim() === '조회키') {
      키행 = q + 1;
      키있음 = !!String(값들[q][1] || '').trim();
      break;
    }
  }
  if (키행 < 0) {
    c.appendRow(['조회키', 새키생성()]);
  } else if (!키있음) {
    c.getRange(키행, 2).setValue(새키생성());
  }

  return ss;
}

function 새키생성() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

/* ---------- 값 읽기 ---------- */
function 날짜문자(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}

function 설정읽기() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_CONF);
  var v = sh.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < v.length; i++) {
    var k = String(v[i][0]).trim();
    if (!k) continue;
    var raw = v[i][1];
    /* 시트가 '2026-09-01' 같은 글자를 날짜로 자동 변환해 버리는 경우를 대비해
       날짜 값이면 다시 yyyy-MM-dd 글자로 되돌려 준다. */
    out[k] = (raw instanceof Date) ? 날짜문자(raw) : String(raw == null ? '' : raw).trim();
  }
  return out;
}

function 신청읽기() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_BOOK);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, 신청머리.length).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var 날짜 = 날짜문자(v[i][1]);
    if (!날짜) continue;
    var 상태 = String(v[i][9] == null ? '' : v[i][9]).trim();
    out.push({
      id: String(v[i][0]),
      row: i + 2,
      date: 날짜,
      slot: String(v[i][2]).trim() === '방과후' ? 'after' : 'lunch',
      sid: String(v[i][3]).trim(),
      name: String(v[i][4]).trim(),
      memo: String(v[i][5] == null ? '' : v[i][5]),
      at: 때문자(v[i][6]),
      result: String(v[i][7] == null ? '' : v[i][7]),
      follow: String(v[i][8] == null ? '' : v[i][8]),
      status: 상태값.indexOf(상태) >= 0 ? 상태 : '',
      loggedAt: 때문자(v[i][10]),
      area: String(v[i][11] == null ? '' : v[i][11]).trim()
    });
  }
  return out;
}

function 때문자(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  return String(v == null ? '' : v).trim();
}

/* 반환값: { 'yyyy-MM-dd': { lunch: 이유|'', after: 이유|'' } } — 이유가 있으면 그 시간대는 휴무 */
function 휴무읽기() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_OFF);
  var last = sh.getLastRow();
  var out = {};
  if (last < 2) return out;
  var v = sh.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < v.length; i++) {
    var d = 날짜문자(v[i][0]);
    if (!d) continue;
    var 구분 = String(v[i][1] || '전체').trim();
    var 이유 = String(v[i][2] == null ? '' : v[i][2]).trim() || '휴무';
    if (!out[d]) out[d] = { lunch: '', after: '' };
    if (구분 === '점심시간') out[d].lunch = 이유;
    else if (구분 === '방과후') out[d].after = 이유;
    else { out[d].lunch = 이유; out[d].after = 이유; }
  }
  return out;
}

/* ---------- 학생에게 내려보내는 자료 (이야기 없음) ---------- */
function 공개자료() {
  var 저장소 = null;
  try { 저장소 = CacheService.getScriptCache(); var c = 저장소.get(상담캐시키_); if (c) return JSON.parse(c); } catch (e) {}
  var d = 공개자료만들기_();
  try { if (저장소) { var t = JSON.stringify(d); if (t.length < 90000) 저장소.put(상담캐시키_, t, 20); } } catch (e) {}
  return d;
}
function 공개자료만들기_() {
  준비();
  var s = 설정읽기();
  var 신청 = 신청읽기();
  /* 이름을 숨기기로 했으면 서버에서부터 지웁니다. 화면에서만 가리면 자료에는 남습니다. */
  var 공개 = (s['이름공개'] || '예') !== '아니오';
  var taken = {};
  신청.forEach(function (b) {
    taken[b.date + '|' + b.slot] = 공개 ? { name: b.name } : { name: '' };
  });
  return {
    url: webBase_() + '?p=counsel',
    home: webBase_(),
    subtitle: s['부제'] || '',
    teacher: s['담임'] || '',
    notice: s['안내문구'] || '',
    start: s['시작일'] || '2026-09-01',
    end: s['종료일'] || '2026-12-31',
    slots: {
      lunch: { label: '점심시간', time: s['점심시간'] || '' },
      after: { label: '방과후', time: s['방과후시간'] || '' }
    },
    showNames: (s['이름공개'] || '예') !== '아니오',
    hasPw: !!(s['관리자비밀번호'] || ''),
    off: 휴무읽기(),
    taken: taken
  };
}

/* 웹 페이지에서 부르는 이름들 */
/* 학생 화면: 학급 로그인한 우리 반만 달력을 봅니다. */
function getData(no, pin) { gateAuth_(no, pin); return 공개자료(); }
function book(p) {
  /* 학생이 자기 휴대폰으로 신청할 때는 21일 프로젝트 PIN을 확인합니다.
   * 교실 TV의 상담 신청은 이 함수를 거치지 않으므로 PIN 없이 그대로 됩니다. */
  var chk = 상담PIN확인_(p || {});
  if (chk) return chk;
  return 신청하기(p);
}
function 상담PIN확인_(p) {
  var sid = String(p.sid || '').trim();
  if (!/^\d{3,6}$/.test(sid)) return { ok: false, reason: 'sid' };
  var no = Number(sid) % 100;
  try { boardStudent_('phone', no, String(p.pin || '')); }
  catch (e) { return { ok: false, reason: 'pin', msg: String(e && e.message || e) }; }
  return null;
}
function adminData(pw) { return 관리자자료(pw); }
function adminEdit(pw, p) { return 관리자수정(pw, p); }

/* ---------- 조회키로 접근하는 오늘 일정 (카톡 알림용) ---------- */
function 오늘일정() {
  준비();
  var s = 설정읽기();
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var 전체 = 신청읽기();
  var 신청 = 전체.filter(function (b) { return b.date === today; });
  신청.sort(function (a, b) { return a.slot === b.slot ? 0 : (a.slot === 'lunch' ? -1 : 1); });

  /* 어제까지 끝난 상담 가운데 아직 상담일지를 안 쓴 건수 */
  var 미기록 = 전체.filter(function (b) { return b.date < today && !b.status; });
  미기록.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  return {
    ok: true,
    date: today,
    subtitle: s['부제'] || '',
    teacher: s['담임'] || '',
    slots: { lunch: s['점심시간'] || '', after: s['방과후시간'] || '' },
    pending: 미기록.length,
    pendingOldest: 미기록.length ? 미기록[0].date : '',
    items: 신청.map(function (b) {
      return {
        slot: b.slot,
        slotLabel: b.slot === 'after' ? '방과후' : '점심시간',
        sid: b.sid,
        name: b.name,
        memo: b.memo || ''
      };
    })
  };
}

/* ---------- 신청하기 ---------- */
function 신청하기(p) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { ok: false, reason: 'busy' };
  }
  try {
    return 신청추가(p);
  } finally {
    상담캐시비우기_();
    lock.releaseLock();
  }
}

function 신청추가(p) {
  {
    준비();
    var s = 설정읽기();
    var date = String(p.date || '').trim();
    var slot = p.slot === 'after' ? 'after' : 'lunch';
    var sid = String(p.sid || '').trim();
    var name = String(p.name || '').trim();
    var memo = String(p.memo || '').trim().slice(0, 200);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: 'date' };
    if (date < (s['시작일'] || '') || date > (s['종료일'] || '')) return { ok: false, reason: 'range' };
    if (!/^\d{3,6}$/.test(sid)) return { ok: false, reason: 'sid' };
    if (name.length < 2 || name.length > 10) return { ok: false, reason: 'name' };
    if (!학번확인_(sid, name)) return { ok: false, reason: 'roster' };

    var 요일 = new Date(date + 'T00:00:00+09:00').getDay();
    if (요일 === 0 || 요일 === 6) return { ok: false, reason: 'weekend' };
    var 휴무맵 = 휴무읽기();
    if (휴무맵[date] && 휴무맵[date][slot]) return { ok: false, reason: 'off' };

    var 있는것 = 신청읽기();
    for (var i = 0; i < 있는것.length; i++) {
      if (있는것[i].date === date && 있는것[i].slot === slot) return { ok: false, reason: 'taken' };
    }
    if (있는것.length > 2000) return { ok: false, reason: 'full' };

    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_BOOK).appendRow([
      Utilities.getUuid(),
      date,
      slot === 'after' ? '방과후' : '점심시간',
      sid,
      name,
      memo,
      new Date()
    ]);
    상담캐시비우기_();
    return { ok: true, data: 공개자료() };
  }
}

/* ---------- 관리자 ---------- */
function 비밀번호확인(pw) {
  var s = 설정읽기();
  var 저장된 = s['관리자비밀번호'] || '';
  if (!저장된) return false;
  var tk = admTokOk_(pw);
  if (tk !== null) return tk;
  secCheck_('admin', 'teacher');
  if (!secEqual_(pw, 저장된)) { secFail_('admin', 'teacher'); return false; }
  secOk_('admin', 'teacher');
  return true;
}

function 관리자자료(pw) {
  준비();
  if (!비밀번호확인(pw)) return { ok: false };
  var s = 설정읽기();
  var 신청 = 신청읽기();
  var memos = {};
  var rows = [];
  신청.forEach(function (b) {
    memos[b.date + '|' + b.slot] = b.memo;
    rows.push({
      id: b.id, date: b.date, slot: b.slot, sid: b.sid, name: b.name, memo: b.memo, at: b.at,
      result: b.result, follow: b.follow, status: b.status, loggedAt: b.loggedAt, area: b.area
    });
  });
  /* 담임 화면에서는 가린 이름과 학번을 다시 채웁니다. (비밀번호를 확인한 뒤입니다) */
  var d = 공개자료();
  신청.forEach(function (b) { d.taken[b.date + '|' + b.slot] = { sid: b.sid, name: b.name }; });
  return { ok: true, data: d, memos: memos, rows: rows, viewKey: s['조회키'] || '', admTok: admTokFor_(pw) };
}

function 관리자수정(pw, p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, reason: 'busy' }; }
  try {
    준비();
    if (!비밀번호확인(pw)) return { ok: false, reason: 'auth' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var s = 설정읽기();
    var 일 = p.act;

    if (일 === 'edit' || 일 === 'delete') {
      var sh = ss.getSheetByName(SH_BOOK);
      var 목록 = 신청읽기();
      var 대상 = null;
      for (var i = 0; i < 목록.length; i++) if (목록[i].id === p.id) 대상 = 목록[i];
      if (!대상) return { ok: false, reason: 'missing' };
      if (일 === 'delete') sh.deleteRow(대상.row);
      else {
        sh.getRange(대상.row, 4, 1, 3).setValues([[
          String(p.sid || '').trim(),
          String(p.name || '').trim(),
          String(p.memo || '').trim().slice(0, 200)
        ]]);
      }
    } else if (일 === 'add') {
      var r = 신청추가({ date: p.date, slot: p.slot, sid: p.sid, name: p.name, memo: p.memo });
      if (!r.ok) return r;
    } else if (일 === 'move') {
      var shB = ss.getSheetByName(SH_BOOK);
      var 목록2 = 신청읽기();
      var 대상2 = null;
      for (var mIdx = 0; mIdx < 목록2.length; mIdx++) if (목록2[mIdx].id === p.id) 대상2 = 목록2[mIdx];
      if (!대상2) return { ok: false, reason: 'missing' };

      var 새날짜 = String(p.date || '').trim();
      var 새구분 = p.slot === 'after' ? 'after' : 'lunch';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(새날짜)) return { ok: false, reason: 'date' };
      if (새날짜 < (s['시작일'] || '') || 새날짜 > (s['종료일'] || '')) return { ok: false, reason: 'range' };

      var 요일2 = new Date(새날짜 + 'T00:00:00+09:00').getDay();
      if (요일2 === 0 || 요일2 === 6) return { ok: false, reason: 'weekend' };
      var 휴무맵2 = 휴무읽기();
      if (휴무맵2[새날짜] && 휴무맵2[새날짜][새구분]) return { ok: false, reason: 'off' };

      if (!(새날짜 === 대상2.date && 새구분 === 대상2.slot)) {
        for (var nIdx = 0; nIdx < 목록2.length; nIdx++) {
          if (목록2[nIdx].id !== p.id && 목록2[nIdx].date === 새날짜 && 목록2[nIdx].slot === 새구분) {
            return { ok: false, reason: 'taken' };
          }
        }
      }
      shB.getRange(대상2.row, 2, 1, 2).setValues([[새날짜, 새구분 === 'after' ? '방과후' : '점심시간']]);
    } else if (일 === 'log') {
      /* 상담을 마친 뒤 남기는 상담일지 */
      var shL = ss.getSheetByName(SH_BOOK);
      var 목록3 = 신청읽기();
      var 대상3 = null;
      for (var lIdx = 0; lIdx < 목록3.length; lIdx++) if (목록3[lIdx].id === p.id) 대상3 = 목록3[lIdx];
      if (!대상3) return { ok: false, reason: 'missing' };

      var 새상태 = String(p.status || '').trim();
      if (상태값.indexOf(새상태) < 0) 새상태 = '';   /* 빈 값이면 '아직 기록 안 함'으로 되돌린다 */
      var 새내용 = String(p.result || '').trim().slice(0, 1000);
      var 새조치 = String(p.follow || '').trim().slice(0, 500);
      var 새영역 = ['행특', '진로', '자율', '반영안함'].indexOf(p.area) >= 0 ? p.area : '행특';
      if (!새상태 && !새내용 && !새조치) {
        shL.getRange(대상3.row, 8, 1, 5).setValues([['', '', '', '', '']]);
      } else {
        shL.getRange(대상3.row, 8, 1, 5).setValues([[새내용, 새조치, 새상태 || '완료', new Date(), 새영역]]);
      }
    } else if (일 === 'regenkey') {
      var cKey = ss.getSheetByName(SH_CONF);
      var vKey = cKey.getDataRange().getValues();
      var 키행2 = -1;
      for (var kIdx = 1; kIdx < vKey.length; kIdx++) {
        if (String(vKey[kIdx][0]).trim() === '조회키') { 키행2 = kIdx + 1; break; }
      }
      if (키행2 < 0) cKey.appendRow(['조회키', 새키생성()]);
      else cKey.getRange(키행2, 2).setValue(새키생성());
    } else if (일 === 'off') {
      var o = ss.getSheetByName(SH_OFF);
      var 날짜들 = p.dates || [];
      var 슬롯 = (p.slot === 'lunch' || p.slot === 'after') ? p.slot : 'all';
      var 구분값 = 슬롯 === 'lunch' ? '점심시간' : (슬롯 === 'after' ? '방과후' : '전체');
      var 휴무마지막 = o.getLastRow();
      var 휴무기존 = 휴무마지막 >= 2 ? o.getRange(2, 1, 휴무마지막 - 1, 3).getValues() : [];

      if (p.clear) {
        /* '전체 다시 열기'는 그 날짜의 모든 휴무 행을 지운다. 특정 시간대만 다시 열 때는 그 구분(또는 '전체'로 묶여 있던 행)만 지운다. */
        for (var k = 휴무기존.length - 1; k >= 0; k--) {
          var d0 = 날짜문자(휴무기존[k][0]);
          if (날짜들.indexOf(d0) < 0) continue;
          var g0 = String(휴무기존[k][1] || '전체').trim();
          if (슬롯 === 'all' || g0 === 구분값 || g0 === '전체') o.deleteRow(k + 2);
        }
      } else {
        /* 같은 날짜·같은 구분으로 이미 있는 행은 지우고 새로 쓴다 (중복 방지, 이유 갱신). */
        for (var k2 = 휴무기존.length - 1; k2 >= 0; k2--) {
          var d1 = 날짜문자(휴무기존[k2][0]);
          if (날짜들.indexOf(d1) < 0) continue;
          var g1 = String(휴무기존[k2][1] || '전체').trim();
          if (g1 === 구분값) o.deleteRow(k2 + 2);
        }
        var 추가행 = 날짜들.map(function (d) { return [d, 구분값, p.reason || '휴무']; });
        if (추가행.length) o.getRange(o.getLastRow() + 1, 1, 추가행.length, 3).setValues(추가행);
      }
    } else if (일 === 'conf') {
      var c = ss.getSheetByName(SH_CONF);
      var v2 = c.getDataRange().getValues();
      var 바꿀것 = p.conf || {};
      for (var j = 1; j < v2.length; j++) {
        var key = String(v2[j][0]).trim();
        if (Object.prototype.hasOwnProperty.call(바꿀것, key)) {
          c.getRange(j + 1, 2).setValue(String(바꿀것[key]));
        }
      }
    } else {
      return { ok: false, reason: 'unknown' };
    }
    상담캐시비우기_();
    if (typeof cfgBust_ === 'function') cfgBust_();
    return 관리자자료(pw);
  } finally {
    상담캐시비우기_();
    if (typeof cfgBust_ === 'function') cfgBust_();
    lock.releaseLock();
  }
}

/* ---------- 엑셀(.xlsx)로 내보내기 ---------- */
var 요일글자 = ['일', '월', '화', '수', '목', '금', '토'];

function 요일문자(d) {
  var p = String(d).split('-');
  return 요일글자[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] || '';
}

function adminXlsx(pw) { return 엑셀내보내기(pw); }

function 엑셀내보내기(pw) {
  준비();
  if (!비밀번호확인(pw)) return { ok: false, reason: 'auth' };

  var s = 설정읽기();
  var 시간 = { lunch: s['점심시간'] || '', after: s['방과후시간'] || '' };
  var 이름표 = { lunch: '점심시간', after: '방과후' };
  var 순위 = { lunch: 0, after: 1 };   /* 점심시간이 방과후보다 먼저 */
  var 목록 = 신청읽기().sort(function (a, b) {
    return a.date === b.date ? (순위[a.slot] - 순위[b.slot]) : (a.date < b.date ? -1 : 1);
  });

  var 임시 = SpreadsheetApp.create('상담기록_내보내기_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss'));
  var 임시id = 임시.getId();

  try {
    /* 1장 — 상담기록 전체 */
    var sh1 = 임시.getSheets()[0];
    sh1.setName('상담기록');
    var 머리1 = ['날짜', '요일', '구분', '시간', '학번', '이름', '하고 싶은 이야기',
                 '상담 내용', '후속 조치', '상태', '신청한 때', '기록한 때'];
    var 몸1 = 목록.map(function (r) {
      return [r.date, 요일문자(r.date), 이름표[r.slot], 시간[r.slot], r.sid, r.name,
        r.memo || '', r.result || '', r.follow || '', r.status || '미기록', r.at || '', r.loggedAt || ''];
    });
    sh1.getRange(1, 1, 1, 머리1.length).setValues([머리1])
      .setFontWeight('bold').setBackground('#DAEAE5');
    if (몸1.length) sh1.getRange(2, 1, 몸1.length, 머리1.length).setValues(몸1);
    sh1.setFrozenRows(1);
    [90, 46, 74, 96, 66, 74, 260, 320, 220, 62, 124, 124].forEach(function (w, i) {
      sh1.setColumnWidth(i + 1, w);
    });
    if (몸1.length) {
      sh1.getRange(2, 1, 몸1.length, 머리1.length).setVerticalAlignment('top');
      sh1.getRange(2, 7, 몸1.length, 3).setWrap(true);
    }

    /* 2장 — 학생별 모음 (생기부 정리용) */
    var sh2 = 임시.insertSheet('학생별 모음');
    var 머리2 = ['학번', '이름', '상담 횟수', '최근 상담일', '상담 내용 모음 (생기부용)'];
    var 묶음 = {}, 순서 = [];
    목록.forEach(function (r) {
      var k = r.sid + '|' + r.name;
      if (!묶음[k]) { 묶음[k] = { sid: r.sid, name: r.name, n: 0, last: '', 글: [] }; 순서.push(k); }
      var g = 묶음[k];
      g.n++;
      if (r.date > g.last) g.last = r.date;
      var 조각 = r.date.slice(5).replace('-', '/') + ' ';
      조각 += (r.memo ? '(' + r.memo + ') ' : '');
      조각 += (r.result || (r.status ? r.status : '기록 없음'));
      if (r.follow) 조각 += ' → ' + r.follow;
      g.글.push(조각);
    });
    순서.sort(function (a, b) { return 묶음[a].sid < 묶음[b].sid ? -1 : 1; });
    var 몸2 = 순서.map(function (k) {
      var g = 묶음[k];
      return [g.sid, g.name, g.n, g.last, g.글.join('\n')];
    });
    sh2.getRange(1, 1, 1, 머리2.length).setValues([머리2])
      .setFontWeight('bold').setBackground('#DAEAE5');
    if (몸2.length) sh2.getRange(2, 1, 몸2.length, 머리2.length).setValues(몸2);
    sh2.setFrozenRows(1);
    [66, 74, 74, 96, 620].forEach(function (w, i) { sh2.setColumnWidth(i + 1, w); });
    if (몸2.length) {
      sh2.getRange(2, 1, 몸2.length, 머리2.length).setVerticalAlignment('top');
      sh2.getRange(2, 5, 몸2.length, 1).setWrap(true);
    }

    SpreadsheetApp.flush();

    var url = 'https://www.googleapis.com/drive/v3/files/' + 임시id + '/export?mimeType='
      + encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return { ok: false, reason: 'export' };

    return {
      ok: true,
      name: '상담기록_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd') + '.xlsx',
      b64: Utilities.base64Encode(res.getContent())
    };
  } finally {
    try { DriveApp.getFileById(임시id).setTrashed(true); } catch (e) {}
  }
}

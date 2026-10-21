/*******************************************************
 * 알림장 — 가정통신문 · 제출 서류 · 준비물 · 중요 일정
 *  - 교실 TV: 반 전체 항목만 마감이 가까운 순으로 (이름 · 개인 항목은 띄우지 않음)
 *  - 학생 휴대폰: PIN으로 들어가 '내가 챙길 것'(아직 안 낸 것)만 봄
 *  - 담임 기록실: 항목마다 제출 체크표
 *  - 구글 캘린더: 반 전체 항목의 마감일을 학급 캘린더에 자동으로 올림
 *******************************************************/
var FILEVER_알림장 = '2026-11-03a';

var NOTE = { ITEM: '알림장', SUB: '알림장제출' };
var NOTE_KINDS = ['가정통신문', '제출 서류', '준비물', '중요 일정'];

/* ---------- 준비 ---------- */
function note준비_() {
  var flag = 'nready_' + FILEVER_알림장, cache = CacheService.getScriptCache();
  try { if (cache.get(flag)) return; } catch (e) {}
  var ss = ss_();
  var mk = function (name, head) {
    if (ss.getSheetByName(name)) return;
    var s = ss.insertSheet(name);
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    s.setFrozenRows(1);
  };
  mk(NOTE.ITEM, ['알림ID', '종류', '제목', '내용', '마감일', '대상', '제출확인', '첨부ID', '첨부이름', '첨부종류', '캘린더일정ID', '상태', '작성시각']);
  mk(NOTE.SUB, ['알림ID', '번호', '이름', '확인시각']);
  var cur = getConfig_();
  [['알림장_캘린더', '아니오'], ['알림장_캘린더ID', '']].forEach(function (kv) {
    if (!(kv[0] in cur)) sheet_(SHEETS.CONFIG).appendRow(kv);
  });
  cfgBust_();
  try { cache.put(flag, '1', 21600); } catch (e) {}
}

/* ---------- 읽기 ---------- */
function noteYmd_(v) { return v instanceof Date ? ymd_(v) : String(v || '').trim().slice(0, 10); }
function noteItems_() {
  var sh = ss_().getSheetByName(NOTE.ITEM);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues().map(function (r, i) {
    if (!r[0]) return null;
    var target = String(r[5] || '전체');
    return {
      row: i + 2, id: String(r[0]), kind: String(r[1] || '가정통신문'), title: String(r[2] || ''), text: String(r[3] || ''),
      due: noteYmd_(r[4]), target: target === '전체' ? '전체' : boardJson_(target, []).map(Number),
      track: String(r[6]) === '예',
      file: r[7] ? { id: String(r[7]), name: String(r[8] || '첨부 파일'), mime: String(r[9] || '') } : null,
      calId: String(r[10] || ''), open: String(r[11]) !== '종료', at: r[12] instanceof Date ? r[12].getTime() : 0
    };
  }).filter(function (x) { return x; });
}
function noteSubs_() {
  var sh = ss_().getSheetByName(NOTE.SUB), map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (!r[0]) return;
    var k = String(r[0]);
    (map[k] = map[k] || {})[Number(r[1])] = true;
  });
  return map;
}
function noteTargets_(it, sts) {
  return it.target === '전체' ? sts.map(function (s) { return s.no; }) : it.target.slice();
}
/* 마감이 지났어도 하루는 더 보여 주고, 마감이 없으면 '종료'할 때까지 보여 줍니다. */
function noteVisible_(it, today) {
  if (!it.open) return false;
  if (!it.due) return true;
  var d = new Date(it.due + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10) >= today;
}
function noteSort_(a, b) {
  var x = a.due || '9999', y = b.due || '9999';
  return x === y ? b.at - a.at : (x < y ? -1 : 1);
}

/* ---------- 교실 TV · 휴대폰 공통: 반 전체 항목 ---------- */
function noteBoardList_(sts) {
  try {
    note준비_();
    var today = today_(), subs = noteSubs_();
    return noteItems_().filter(function (it) { return it.target === '전체' && noteVisible_(it, today); })
      .sort(noteSort_).slice(0, 12).map(function (it) {
        var done = subs[it.id] || {};
        var pending = it.track ? sts.filter(function (s) { return !done[s.no]; }).length : null;
        return { id: it.id, kind: it.kind, title: it.title, text: it.text, due: it.due, file: it.file, track: it.track, pending: pending };
      });
  } catch (e) { return []; }
}

/* ---------- 휴대폰: 내가 챙길 것 (PIN 필요) ---------- */
function apiNoteMine(t, no, pin) {
  var mode = boardAuth_(t);
  if (mode !== 'phone') throw new Error('개인 알림장은 각자의 휴대폰에서만 볼 수 있어요.');
  var st = boardStudent_('phone', no, pin);
  note준비_();
  var today = today_(), subs = noteSubs_();
  var items = noteItems_().filter(function (it) {
    if (!noteVisible_(it, today)) return false;
    return it.target === '전체' || it.target.indexOf(st.no) >= 0;
  }).sort(noteSort_).map(function (it) {
    return { id: it.id, kind: it.kind, title: it.title, text: it.text, due: it.due, file: it.file, track: it.track,
      mine: it.target !== '전체', done: !!(subs[it.id] && subs[it.id][st.no]) };
  });
  return { ok: true, no: st.no, name: st.name, items: items, cal: noteCalLinks_() };
}

/* ---------- 구글 캘린더 ---------- */
function noteCalOn_() { return (getConfig_()['알림장_캘린더'] || '아니오') === '예' && !!getConfig_()['알림장_캘린더ID']; }
function noteCal_() {
  var id = getConfig_()['알림장_캘린더ID'];
  if (!id) return null;
  try { return CalendarApp.getCalendarById(id); } catch (e) { return null; }
}
/* 학생에게 보낼 '캘린더 추가' 주소. (서버에서 만들어 보냅니다) */
function noteCalLinks_() {
  var id = getConfig_()['알림장_캘린더ID'];
  if (!id || !noteCalOn_()) return null;
  var e = encodeURIComponent(id);
  return {
    google: 'https://calendar.google.com/calendar/render?cid=' + e,
    iphone: 'webcal://calendar.google.com/calendar/ical/' + e + '/public/basic.ics',
    web: 'https://calendar.google.com/calendar/embed?src=' + e + '&ctz=Asia%2FSeoul'
  };
}
/* 항목 하나를 캘린더에 맞춥니다. 실패해도 알림장 저장은 막지 않고 안내만 돌려줍니다. */
function noteCalSync_(it) {
  try {
    var cal = noteCalOn_() ? noteCal_() : null;
    var want = !!(cal && it.open && it.target === '전체' && it.due && it.cal !== false);
    var ev = null;
    if (it.calId && cal) { try { ev = cal.getEventById(it.calId); } catch (e) { ev = null; } }
    if (!want) {
      if (ev) ev.deleteEvent();
      return '';
    }
    var title = '[' + it.kind + '] ' + it.title + (it.track ? ' (마감)' : '');
    var cg = getConfig_();
    var desc = (it.text ? it.text + '\n\n' : '') + (cg['학년'] || '') + '-' + (cg['반'] || '') + ' 알림장';
    var p = it.due.split('-');
    var day = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (ev) { ev.setTitle(title); ev.setAllDayDate(day); ev.setDescription(desc); return ev.getId(); }
    return cal.createAllDayEvent(title, day, { description: desc }).getId();
  } catch (e) {
    return 'ERR:' + String(e && e.message || e).slice(0, 120);
  }
}

/* ---------- 담임 기록실 ---------- */
function noteAdmin_() {
  note준비_();
  var sts = students_(), subs = noteSubs_(), c = getConfig_();
  return {
    kinds: NOTE_KINDS,
    cal: { on: (c['알림장_캘린더'] || '아니오') === '예', id: c['알림장_캘린더ID'] || '', links: noteCalLinks_() },
    items: noteItems_().sort(function (a, b) { return (b.open - a.open) || noteSort_(a, b); }).map(function (it) {
      var targets = noteTargets_(it, sts), done = subs[it.id] || {};
      return { id: it.id, kind: it.kind, title: it.title, text: it.text, due: it.due, target: it.target, track: it.track,
        file: it.file, open: it.open, cal: !!it.calId && it.calId.indexOf('ERR:') !== 0, calErr: it.calId.indexOf('ERR:') === 0 ? it.calId.slice(4) : '',
        done: targets.filter(function (n) { return done[n]; }), targets: targets };
    })
  };
}

function apiNote(pw, op, d) {
  isAdmin_(pw);
  note준비_();
  d = d || {};
  var sh = ss_().getSheetByName(NOTE.ITEM), warn = '';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (op === 'add') {
      var title = String(d.title || '').trim().slice(0, 80);
      if (!title) throw new Error('제목을 적어 주세요.');
      var due = String(d.due || '').trim();
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('마감일을 다시 골라 주세요.');
      var target = d.target === '전체' || !Array.isArray(d.target) ? '전체' : d.target.map(Number).filter(function (n) { return n > 0; });
      if (target !== '전체' && !target.length) throw new Error('대상 학생을 한 명 이상 골라 주세요.');
      var f = boardSaveFile_(d.file);
      var it = { id: 'a_' + Utilities.getUuid().slice(0, 8), kind: NOTE_KINDS.indexOf(d.kind) >= 0 ? d.kind : NOTE_KINDS[0],
        title: title, text: String(d.text || '').trim().slice(0, 500), due: due, target: target, track: !!d.track,
        open: true, calId: '', cal: d.cal !== false };
      var calId = noteCalSync_(it);
      if (calId.indexOf('ERR:') === 0) warn = '캘린더에 올리지 못했어요: ' + calId.slice(4);
      sh.appendRow([it.id, it.kind, it.title, it.text, due, target === '전체' ? '전체' : JSON.stringify(target), it.track ? '예' : '',
        f ? f.id : '', f ? f.name : '', f ? f.mime : '', calId, '', new Date()]);
      if (due) sh.getRange(sh.getLastRow(), 5).setNumberFormat('@').setValue(due);
    } else {
      var cur = noteItems_().filter(function (x) { return x.id === String(d.id); })[0];
      if (!cur) throw new Error('이미 지워진 알림입니다.');
      if (op === 'sub' || op === 'suball' || op === 'subnone') {
        var ssub = ss_().getSheetByName(NOTE.SUB);
        var rows = ssub.getLastRow() > 1 ? ssub.getRange(2, 1, ssub.getLastRow() - 1, 2).getValues() : [];
        var del = function (no) {
          for (var i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === cur.id && Number(rows[i][1]) === no) ssub.deleteRow(i + 2);
        };
        var name = function (no) { try { return findStudent_(no).name; } catch (e) { return ''; } };
        var has = function (no) { return rows.some(function (r) { return String(r[0]) === cur.id && Number(r[1]) === no; }); };
        if (op === 'sub') {
          var no = Number(d.no);
          if (has(no)) del(no); else ssub.appendRow([cur.id, no, name(no), new Date()]);
        } else {
          var targets = noteTargets_(cur, students_());
          if (op === 'subnone') {
            for (var k = rows.length - 1; k >= 0; k--) {
              if (String(rows[k][0]) === cur.id && targets.indexOf(Number(rows[k][1])) >= 0) ssub.deleteRow(k + 2);
            }
          } else targets.forEach(function (n) { if (!has(n)) ssub.appendRow([cur.id, n, name(n), new Date()]); });
        }
      } else if (op === 'del') {
        cur.open = false; noteCalSync_(cur);
        var ssub2 = ss_().getSheetByName(NOTE.SUB);
        if (ssub2.getLastRow() > 1) {
          var r2 = ssub2.getRange(2, 1, ssub2.getLastRow() - 1, 1).getValues();
          for (var j = r2.length - 1; j >= 0; j--) if (String(r2[j][0]) === cur.id) ssub2.deleteRow(j + 2);
        }
        sh.deleteRow(cur.row);
      } else if (op === 'close' || op === 'open') {
        cur.open = op === 'open';
        var cid = noteCalSync_(cur);
        sh.getRange(cur.row, 11, 1, 2).setValues([[cid, cur.open ? '' : '종료']]);
      } else if (op === 'edit') {
        var t2 = String(d.title || '').trim().slice(0, 80);
        if (!t2) throw new Error('제목을 비워 둘 수 없어요.');
        var due2 = String(d.due || '').trim();
        if (due2 && !/^\d{4}-\d{2}-\d{2}$/.test(due2)) throw new Error('마감일을 다시 골라 주세요.');
        cur.title = t2; cur.text = String(d.text || '').trim().slice(0, 500); cur.due = due2;
        var cid2 = noteCalSync_(cur);
        if (cid2.indexOf('ERR:') === 0) warn = '캘린더를 고치지 못했어요: ' + cid2.slice(4);
        sh.getRange(cur.row, 3, 1, 2).setValues([[cur.title, cur.text]]);
        sh.getRange(cur.row, 5).setNumberFormat('@').setValue(due2);
        sh.getRange(cur.row, 11).setValue(cid2);
      }
    }
  } finally { lock.releaseLock(); }
  boardBust_();
  var out = apiBoardAdminGet(pw);
  out.noteWarn = warn;
  return out;
}

/* 캘린더 만들기 · 켜기 · 끄기 */
function apiNoteCalendar(pw, op) {
  isAdmin_(pw);
  note준비_();
  var c = getConfig_();
  if (op === 'create') {
    var cal = c['알림장_캘린더ID'] ? noteCal_() : null;
    if (!cal) {
      var nm = (c['학년'] || '1') + '-' + (c['반'] || '2') + ' 알림장';
      cal = CalendarApp.createCalendar(nm, { summary: '학급 다이어리 알림장 (가정통신문 · 제출 서류 마감)', timeZone: 'Asia/Seoul' });
      setConfigValue_('알림장_캘린더ID', cal.getId());
    }
    setConfigValue_('알림장_캘린더', '예');
    /* 이미 있던 항목도 캘린더에 올립니다 */
    var sh = ss_().getSheetByName(NOTE.ITEM);
    noteItems_().forEach(function (it) { var id = noteCalSync_(it); if (id !== it.calId) sh.getRange(it.row, 11).setValue(id); });
  } else if (op === 'off') {
    setConfigValue_('알림장_캘린더', '아니오');
  } else if (op === 'on') {
    if (!c['알림장_캘린더ID']) throw new Error('먼저 [학급 캘린더 만들기]를 눌러 주세요.');
    setConfigValue_('알림장_캘린더', '예');
  }
  boardBust_();
  return apiBoardAdminGet(pw);
}

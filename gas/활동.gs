/*******************************************************
 * 소감문 제출 · 학급 회의
 *  주소: 웹앱 주소?p=act&tab=essay  (소감문)
 *        웹앱 주소?p=act&tab=meet   (학급 회의)
 *  - 학생은 21일 프로젝트와 같은 번호 · PIN으로 참여합니다.
 *  - 소감문: 선생님이 과제(양식)를 올리고 자율/진로를 정합니다 → 담임 기록실 원자료로 연동
 *  - 학급 회의: 학생이 의제를 내고, 서기(부반장)가 학생별 의견을 그대로 기록, 투표는 학생이 직접
 *               → 담임 기록실 '자율' 원자료로 연동
 *******************************************************/
var FILEVER_활동 = '2026-10-24a';

var ACT = { ES: '소감문과제', ESUB: '소감문제출', AG: '회의의제', REC: '회의기록', VOTE: '회의투표', BALLOT: '회의표' };
var ESSAY_DEFAULT_Q = ['강의에서 가장 인상 깊었던 내용', '새롭게 알게 되었거나 생각이 바뀐 점', '앞으로 실천하고 싶은 것'];

/* ---------- 준비 ---------- */
function act준비_() {
  var flag = 'aready_' + FILEVER_활동, cache = CacheService.getScriptCache();
  try { if (cache.get(flag)) return; } catch (e) {}
  var ss = ss_();
  var mk = function (name, head) {
    if (ss.getSheetByName(name)) return;
    var s = ss.insertSheet(name);
    s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    s.setFrozenRows(1);
  };
  mk(ACT.ES, ['과제ID', '제목', '교육날짜', '영역', '질문', '안내', '첨부ID', '첨부이름', '첨부종류', '마감일', '상태', '작성시각']);
  mk(ACT.ESUB, ['과제ID', '번호', '이름', '답', '제출시각', '수정시각']);
  mk(ACT.AG, ['의제ID', '제목', '설명', '제안번호', '제안이름', '상태', '회의날짜', '결정사항', '작성시각']);
  mk(ACT.REC, ['기록ID', '의제ID', '번호', '이름', '의견', '기록한서기', '시각']);
  mk(ACT.VOTE, ['투표ID', '의제ID', '질문', '보기', '상태', '시각']);
  mk(ACT.BALLOT, ['투표ID', '번호', '선택', '시각']);
  if (!('회의_서기' in getConfig_())) { sheet_(SHEETS.CONFIG).appendRow(['회의_서기', '']); cfgBust_(); }
  try { cache.put(flag, '1', 21600); } catch (e) {}
}

/* ---------- 읽기 도우미 ---------- */
function actRows_(name, w) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues()
    .map(function (r, i) { return { r: r, row: i + 2 }; })
    .filter(function (x) { return x.r[0] !== '' && x.r[0] != null; });
}
function actDate_(v) { return v instanceof Date ? ymd_(v) : String(v || '').trim().slice(0, 10); }
function actTime_(v) { return v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm') : String(v || ''); }
function actJson_(v, d) { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function actId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function actFileUrl_(id) { return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view' : ''; }

function essays_() {
  return actRows_(ACT.ES, 12).map(function (x) {
    var r = x.r;
    return { row: x.row, id: String(r[0]), title: String(r[1] || ''), date: actDate_(r[2]), area: String(r[3]) === '진로' ? '진로' : '자율',
      questions: actJson_(String(r[4] || ''), ESSAY_DEFAULT_Q), guide: String(r[5] || ''),
      file: r[6] ? { id: String(r[6]), name: String(r[7] || '첨부 파일'), url: actFileUrl_(String(r[6])) } : null,
      due: actDate_(r[9]), open: String(r[10]) !== '마감', at: actTime_(r[11]) };
  });
}
function essaySubs_() {
  return actRows_(ACT.ESUB, 6).map(function (x) {
    var r = x.r;
    return { row: x.row, id: String(r[0]), no: Number(r[1]), name: String(r[2] || ''), answers: actJson_(String(r[3] || ''), []),
      at: actTime_(r[4]), updated: actTime_(r[5]) };
  });
}
function agendas_() {
  return actRows_(ACT.AG, 9).map(function (x) {
    var r = x.r, st = String(r[5] || '제안');
    return { row: x.row, id: String(r[0]), title: String(r[1] || ''), desc: String(r[2] || ''), propNo: Number(r[3]) || 0,
      propName: String(r[4] || ''), status: ['제안', '논의', '결정'].indexOf(st) >= 0 ? st : '제안',
      date: actDate_(r[6]), decision: String(r[7] || ''), at: actTime_(r[8]) };
  }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
}
function records_() {
  return actRows_(ACT.REC, 7).map(function (x) {
    var r = x.r;
    return { row: x.row, id: String(r[0]), agId: String(r[1]), no: Number(r[2]), name: String(r[3] || ''), text: String(r[4] || ''),
      clerk: String(r[5] || ''), at: actTime_(r[6]) };
  });
}
function votes_() {
  return actRows_(ACT.VOTE, 6).map(function (x) {
    var r = x.r;
    return { row: x.row, id: String(r[0]), agId: String(r[1]), question: String(r[2] || ''), options: actJson_(String(r[3] || ''), []),
      open: String(r[4]) !== '마감', at: actTime_(r[5]) };
  });
}
function ballots_() {
  return actRows_(ACT.BALLOT, 4).map(function (x) {
    var r = x.r;
    return { row: x.row, voteId: String(r[0]), no: Number(r[1]), choice: Number(r[2]), at: actTime_(r[3]) };
  });
}
function clerks_() {
  return String(getConfig_()['회의_서기'] || '').split(/[,\s]+/).map(Number).filter(function (n) { return n > 0; });
}
function voteOut_(v, bls, showCounts) {
  var mine = bls.filter(function (b) { return b.voteId === v.id; });
  var counts = v.options.map(function () { return 0; });
  mine.forEach(function (b) { if (counts[b.choice] != null) counts[b.choice]++; });
  return { id: v.id, agId: v.agId, question: v.question, options: v.options, open: v.open, total: mine.length,
    counts: showCounts || !v.open ? counts : null };
}

/* ---------- 웹 페이지 ---------- */
function 활동페이지_(e) { return 화면내보내기_(활동화면값_((e && e.parameter) || {})); }
function 활동화면값_(p) {
  act준비_();
  var boot = JSON.stringify({ tab: p.tab === 'meet' ? 'meet' : 'essay', app: String(p.app || '') === '1', home: webBase_() });
  return { template: '활동화면', vars: { boot: boot }, title: '소감문 · 학급 회의' };
}

/* ---------- 학생: 처음 자료 (로그인 전) ---------- */
/* 화면을 열 때 서버를 한 번만 부르도록: 목록 + 내 정보를 같이 보냅니다 */
function actStart(no, pin) { var st = auth_(no, pin); return { init: actInit_(), me: actMe_(st) }; }
/* 학급 로그인한 학생만 목록을 봅니다. */
function actInit(no, pin) { gateAuth_(no, pin); return actInit_(); }
function actInit_() {
  act준비_();
  var c = getConfig_(), bls = ballots_(), recs = records_();
  return {
    label: (c['학년'] || '') + '-' + (c['반'] || ''),
    students: students_().map(function (s) { return { no: s.no, name: s.name }; }),
    essays: essays_().filter(function (x) { return x.open; }).map(function (x) {
      return { id: x.id, title: x.title, date: x.date, area: x.area, questions: x.questions, guide: x.guide, file: x.file, due: x.due };
    }),
    agendas: agendas_().map(function (a) {
      return { id: a.id, title: a.title, desc: a.desc, propName: a.propName, status: a.status, date: a.date, decision: a.decision,
        recCount: recs.filter(function (r) { return r.agId === a.id; }).length };
    }),
    votes: votes_().map(function (v) { return voteOut_(v, bls, false); })
  };
}

/* 로그인: 21일 프로젝트와 같은 번호 · PIN */
function actMe_(st) {
  var subs = essaySubs_().filter(function (s) { return s.no === st.no; }), my = {};
  subs.forEach(function (s) { my[s.id] = { answers: s.answers, at: s.updated || s.at }; });
  var mv = {};
  ballots_().forEach(function (b) { if (b.no === st.no) mv[b.voteId] = b.choice; });
  return { ok: true, no: st.no, name: st.name, clerk: clerks_().indexOf(st.no) >= 0, essays: my, votes: mv };
}
function actLogin(no, pin) { return actMe_(auth_(no, pin)); }

/* ---------- 소감문 제출 ---------- */
function essaySubmit(no, pin, id, answers) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var st = auth_(no, pin);
    var e = essays_().filter(function (x) { return x.id === String(id); })[0];
    if (!e) throw new Error('없어진 과제입니다.');
    if (!e.open) throw new Error('마감된 과제입니다. 담임 선생님께 말해 주세요.');
    var ans = e.questions.map(function (q, i) { return String((answers || [])[i] || '').trim().slice(0, 2000); });
    var total = ans.join('').replace(/\s/g, '').length;
    if (total < 20) throw new Error('조금 더 자세히 적어 주세요. (모두 합쳐 20자 이상)');
    var sh = ss_().getSheetByName(ACT.ESUB);
    var cur = essaySubs_().filter(function (s) { return s.id === e.id && s.no === st.no; })[0];
    if (cur) sh.getRange(cur.row, 4, 1, 3).setValues([[JSON.stringify(ans), cur.at, new Date()]]);
    else sh.appendRow([e.id, st.no, st.name, JSON.stringify(ans), new Date(), '']);
    return actMe_(st);
  } finally { lock.releaseLock(); }
}

/* ---------- 학급 회의: 학생 ---------- */
function meetPropose(no, pin, title, desc) {
  var st = auth_(no, pin);
  title = String(title || '').trim().slice(0, 80);
  if (title.length < 2) throw new Error('의제를 적어 주세요.');
  ss_().getSheetByName(ACT.AG).appendRow([actId_('g'), title, String(desc || '').trim().slice(0, 500), st.no, st.name, '제안', '', '', new Date()]);
  return actInit_();
}
function meetVote(no, pin, voteId, choice) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var st = auth_(no, pin);
    var v = votes_().filter(function (x) { return x.id === String(voteId); })[0];
    if (!v) throw new Error('없어진 투표입니다.');
    if (!v.open) throw new Error('이미 마감된 투표입니다.');
    var ch = Number(choice);
    if (!(ch >= 0 && ch < v.options.length)) throw new Error('보기를 골라 주세요.');
    var sh = ss_().getSheetByName(ACT.BALLOT);
    var cur = ballots_().filter(function (b) { return b.voteId === v.id && b.no === st.no; })[0];
    if (cur) sh.getRange(cur.row, 3, 1, 2).setValues([[ch, new Date()]]);
    else sh.appendRow([v.id, st.no, ch, new Date()]);
    return { ok: true, me: actMe_(st), vote: voteOut_(v, ballots_(), false) };
  } finally { lock.releaseLock(); }
}
/* 의제 자세히 (회의록은 로그인한 우리 반 학생만) */
function meetDetail(no, pin, agId) {
  var st = auth_(no, pin);
  return meetDetail_(String(agId), clerks_().indexOf(st.no) >= 0);
}
function meetDetail_(agId, isClerk) {
  var a = agendas_().filter(function (x) { return x.id === agId; })[0];
  if (!a) throw new Error('없어진 의제입니다.');
  var bls = ballots_();
  return {
    ok: true, agenda: { id: a.id, title: a.title, desc: a.desc, propName: a.propName, status: a.status, date: a.date, decision: a.decision },
    records: records_().filter(function (r) { return r.agId === a.id; }).sort(function (x, y) { return x.at < y.at ? -1 : 1; })
      .map(function (r) { return { id: r.id, no: r.no, name: r.name, text: r.text, at: r.at }; }),
    votes: votes_().filter(function (v) { return v.agId === a.id; }).map(function (v) { return voteOut_(v, bls, isClerk); })
  };
}

/* ---------- 학급 회의: 서기(기록 담당) ---------- */
function clerkAuth_(no, pin) {
  var st = auth_(no, pin);
  if (clerks_().indexOf(st.no) < 0) throw new Error('서기(기록 담당)만 할 수 있어요. 담임 선생님이 서기를 정해 주셔야 해요.');
  return st;
}
function meetRecord(no, pin, agId, targetNo, text) {
  var st = clerkAuth_(no, pin);
  var a = agendas_().filter(function (x) { return x.id === String(agId); })[0];
  if (!a) throw new Error('없어진 의제입니다.');
  var who = findStudent_(Number(targetNo));
  text = String(text || '').trim().slice(0, 1000);
  if (text.length < 2) throw new Error('의견을 적어 주세요.');
  ss_().getSheetByName(ACT.REC).appendRow([actId_('r'), a.id, who.no, who.name, text, st.no + '.' + st.name, new Date()]);
  if (a.status === '제안' || !a.date) {
    var sh = ss_().getSheetByName(ACT.AG);
    if (a.status === '제안') sh.getRange(a.row, 6).setValue('논의');
    if (!a.date) sh.getRange(a.row, 7).setNumberFormat('@').setValue(today_());
  }
  return meetDetail_(a.id, true);
}
function meetRecordDel(no, pin, recId) {
  clerkAuth_(no, pin);
  var r = records_().filter(function (x) { return x.id === String(recId); })[0];
  if (!r) throw new Error('이미 지워진 기록입니다.');
  ss_().getSheetByName(ACT.REC).deleteRow(r.row);
  return meetDetail_(r.agId, true);
}
function meetDecide(no, pin, agId, decision, date) {
  clerkAuth_(no, pin);
  var a = agendas_().filter(function (x) { return x.id === String(agId); })[0];
  if (!a) throw new Error('없어진 의제입니다.');
  var d = String(date || '').trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) d = '';
  var sh = ss_().getSheetByName(ACT.AG);
  sh.getRange(a.row, 6).setValue(String(decision || '').trim() ? '결정' : '논의');
  sh.getRange(a.row, 7).setNumberFormat('@').setValue(d || a.date || today_());
  sh.getRange(a.row, 8).setValue(String(decision || '').trim().slice(0, 500));
  return meetDetail_(a.id, true);
}
function meetVoteOpen(no, pin, agId, question, options) {
  clerkAuth_(no, pin);
  var a = agendas_().filter(function (x) { return x.id === String(agId); })[0];
  if (!a) throw new Error('없어진 의제입니다.');
  var q = String(question || '').trim().slice(0, 120) || a.title;
  var opts = (options || []).map(function (x) { return String(x).trim().slice(0, 40); }).filter(Boolean).slice(0, 8);
  if (opts.length < 2) throw new Error('보기를 두 개 이상 적어 주세요.');
  ss_().getSheetByName(ACT.VOTE).appendRow([actId_('v'), a.id, q, JSON.stringify(opts), '진행', new Date()]);
  return meetDetail_(a.id, true);
}
function meetVoteClose(no, pin, voteId) {
  clerkAuth_(no, pin);
  var v = votes_().filter(function (x) { return x.id === String(voteId); })[0];
  if (!v) throw new Error('없어진 투표입니다.');
  ss_().getSheetByName(ACT.VOTE).getRange(v.row, 5).setValue(v.open ? '마감' : '진행');
  return meetDetail_(v.agId, true);
}

/* ---------- 담임 기록실 ---------- */
function actAdmin(pw) {
  isAdmin_(pw);
  act준비_();
  var sts = students_(), subs = essaySubs_(), recs = records_(), bls = ballots_(), vts = votes_();
  return {
    students: sts.map(function (s) { return { no: s.no, name: s.name }; }),
    clerks: clerks_(),
    essays: essays_().sort(function (a, b) { return (b.open - a.open) || (a.at < b.at ? 1 : -1); }).map(function (e) {
      var mine = subs.filter(function (s) { return s.id === e.id; }).sort(function (a, b) { return a.no - b.no; });
      var done = {};
      mine.forEach(function (s) { done[s.no] = true; });
      return { id: e.id, title: e.title, date: e.date, area: e.area, questions: e.questions, guide: e.guide, file: e.file, due: e.due, open: e.open,
        subs: mine.map(function (s) { return { no: s.no, name: s.name, answers: s.answers, at: s.updated || s.at }; }),
        missing: sts.filter(function (s) { return !done[s.no]; }).map(function (s) { return s.no + '. ' + s.name; }) };
    }),
    agendas: agendas_().map(function (a) {
      return { id: a.id, title: a.title, desc: a.desc, propNo: a.propNo, propName: a.propName, status: a.status, date: a.date, decision: a.decision,
        records: recs.filter(function (r) { return r.agId === a.id; }).sort(function (x, y) { return x.at < y.at ? -1 : 1; }),
        votes: vts.filter(function (v) { return v.agId === a.id; }).map(function (v) { return voteOut_(v, bls, true); }) };
    })
  };
}

function essayAdmin(pw, op, d) {
  isAdmin_(pw);
  act준비_();
  d = d || {};
  var sh = ss_().getSheetByName(ACT.ES);
  if (op === 'add') {
    var title = String(d.title || '').trim().slice(0, 80);
    if (!title) throw new Error('교육(강의) 제목을 적어 주세요.');
    var qs = (d.questions || []).map(function (q) { return String(q).trim().slice(0, 120); }).filter(Boolean).slice(0, 8);
    if (!qs.length) qs = ESSAY_DEFAULT_Q.slice();
    var f = boardSaveFile_(d.file);
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? d.date : '';
    var due = /^\d{4}-\d{2}-\d{2}$/.test(String(d.due || '')) ? d.due : '';
    sh.appendRow([actId_('e'), title, date, d.area === '진로' ? '진로' : '자율', JSON.stringify(qs), String(d.guide || '').trim().slice(0, 1000),
      f ? f.id : '', f ? f.name : '', f ? f.mime : '', due, '', new Date()]);
    var last = sh.getLastRow();
    sh.getRange(last, 3).setNumberFormat('@').setValue(date);
    sh.getRange(last, 10).setNumberFormat('@').setValue(due);
  } else {
    var e = essays_().filter(function (x) { return x.id === String(d.id); })[0];
    if (!e) throw new Error('이미 지워진 과제입니다.');
    if (op === 'area') sh.getRange(e.row, 4).setValue(d.area === '진로' ? '진로' : '자율');
    if (op === 'close') sh.getRange(e.row, 11).setValue('마감');
    if (op === 'open') sh.getRange(e.row, 11).setValue('');
    if (op === 'del') {
      var ss2 = ss_().getSheetByName(ACT.ESUB);
      essaySubs_().filter(function (s) { return s.id === e.id; }).sort(function (a, b) { return b.row - a.row; })
        .forEach(function (s) { ss2.deleteRow(s.row); });
      sh.deleteRow(e.row);
    }
  }
  return actAdmin(pw);
}

function meetAdmin(pw, op, d) {
  isAdmin_(pw);
  act준비_();
  d = d || {};
  if (op === 'clerks') {
    var nos = (d.nos || []).map(Number).filter(function (n) { return n > 0; });
    setConfigValue_('회의_서기', nos.join(','));
    return actAdmin(pw);
  }
  if (op === 'add') {
    var t = String(d.title || '').trim().slice(0, 80);
    if (!t) throw new Error('의제를 적어 주세요.');
    ss_().getSheetByName(ACT.AG).appendRow([actId_('g'), t, String(d.desc || '').trim().slice(0, 500), 0, '담임 선생님', '제안', '', '', new Date()]);
    return actAdmin(pw);
  }
  if (op === 'recdel') {
    var r = records_().filter(function (x) { return x.id === String(d.id); })[0];
    if (r) ss_().getSheetByName(ACT.REC).deleteRow(r.row);
    return actAdmin(pw);
  }
  if (op === 'vclose' || op === 'vdel') {
    var v = votes_().filter(function (x) { return x.id === String(d.id); })[0];
    if (!v) throw new Error('이미 지워진 투표입니다.');
    if (op === 'vclose') ss_().getSheetByName(ACT.VOTE).getRange(v.row, 5).setValue(v.open ? '마감' : '진행');
    else {
      var sb = ss_().getSheetByName(ACT.BALLOT);
      ballots_().filter(function (b) { return b.voteId === v.id; }).sort(function (a, b) { return b.row - a.row; })
        .forEach(function (b) { sb.deleteRow(b.row); });
      ss_().getSheetByName(ACT.VOTE).deleteRow(v.row);
    }
    return actAdmin(pw);
  }
  var a = agendas_().filter(function (x) { return x.id === String(d.id); })[0];
  if (!a) throw new Error('이미 지워진 의제입니다.');
  var sh = ss_().getSheetByName(ACT.AG);
  if (op === 'status') sh.getRange(a.row, 6).setValue(['제안', '논의', '결정'].indexOf(d.status) >= 0 ? d.status : '제안');
  if (op === 'decide') {
    sh.getRange(a.row, 8).setValue(String(d.decision || '').trim().slice(0, 500));
    if (d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) sh.getRange(a.row, 7).setNumberFormat('@').setValue(d.date);
    if (String(d.decision || '').trim()) sh.getRange(a.row, 6).setValue('결정');
  }
  if (op === 'del') {
    var rs = ss_().getSheetByName(ACT.REC);
    records_().filter(function (x) { return x.agId === a.id; }).sort(function (x, y) { return y.row - x.row; }).forEach(function (x) { rs.deleteRow(x.row); });
    votes_().filter(function (v2) { return v2.agId === a.id; }).forEach(function (v2) { meetAdmin(pw, 'vdel', { id: v2.id }); });
    var a2 = agendas_().filter(function (x) { return x.id === a.id; })[0];
    if (a2) sh.deleteRow(a2.row);
  }
  return actAdmin(pw);
}

/* ---------- 담임 기록실 '생기부 정리' 원자료로 넘기기 ----------
 * 소감문: 과제에서 정한 영역(자율/진로)으로
 * 학급 회의: 자율 — 학생별로 의제 제안 · 발언 · 투표 참여를 모아서 */
function actHubSources_(push, sts) {
  act준비_();
  var es = essays_(), subs = essaySubs_();
  subs.forEach(function (s) {
    var e = es.filter(function (x) { return x.id === s.id; })[0];
    if (!e) return;
    var L = ['교육(강의): ' + e.title + (e.date ? ' (' + e.date + ')' : '')];
    e.questions.forEach(function (q, i) { if (s.answers[i]) L.push(q + ': ' + s.answers[i]); });
    push(s.no, { id: 'essay:' + e.id + ':' + s.no, src: '소감문 · ' + e.title, area: e.area,
      date: e.date || String(s.at).slice(0, 10), title: e.title + ' 소감문', text: L.join('\n') });
  });
  var ags = agendas_(), recs = records_(), vts = votes_(), bls = ballots_();
  sts.forEach(function (st) {
    ags.forEach(function (a) {
      var L = [];
      if (a.propNo === st.no) L.push('의제를 제안함: ' + a.title + (a.desc ? ' — ' + a.desc : ''));
      recs.filter(function (r) { return r.agId === a.id && r.no === st.no; }).forEach(function (r) { L.push('발언: ' + r.text); });
      var voted = vts.filter(function (v) { return v.agId === a.id && bls.some(function (b) { return b.voteId === v.id && b.no === st.no; }); });
      if (voted.length) L.push('투표에 참여함: ' + voted.map(function (v) { return v.question; }).join(', '));
      if (!L.length) return;
      if (a.decision) L.push('결정 사항: ' + a.decision);
      push(st.no, { id: 'meet:' + a.id + ':' + st.no, src: '학급 회의', area: '자율', date: a.date || String(a.at).slice(0, 10),
        title: '학급 회의 · ' + a.title, text: L.join('\n') });
    });
  });
}

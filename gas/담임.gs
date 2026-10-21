/*******************************************************
 * 담임 기록실 (서버)
 *  - 관찰 기록: 그날 있었던 일을 학생별로 나눠 저장 (태그 여러 개)
 *  - 학생별 일지 · 검색 · 달력 · 교우관계 · 생기부 초안
 *  - 자율 · 진로 전교생 파일에서 우리 반만 담기
 *  - 백업 파일(JSON) 내려받기 · 불러오기 · 드라이브 자동 보관
 *
 *  모든 api 함수는 관리자 비밀번호를 확인한 뒤에만 자료를 내보냅니다.
 *******************************************************/
var FILEVER_담임 = '2026-11-03a';

var HUB = { OBS: '관찰기록', FINAL: '생기부', EXT: '외부기록' };
var HUB_AREAS = ['자율', '진로', '행특'];
var HUB_BACKUP_KEEP = 12;

var HUB_CONF = [
  ['학년', '1'],
  ['반', '2'],
  ['21일_영역', '자율'],
  ['문제해결_영역', '자율'],
  ['바이트_자율', '1500'],
  ['바이트_진로', '2100'],
  ['바이트_행특', '900'],
  ['관찰_밀림일수', '14'],
  ['연동키', ''],
  ['자동백업', '아니오'],
  ['백업폴더ID', '']
];

function 담임페이지_() { return 화면내보내기_(담임화면값_()); }
function 담임화면값_() { return { template: '담임화면', vars: {}, title: solo_() ? '교실 화면 관리' : '담임 기록실' }; }

/* ---------- 시트 준비 ---------- */
function 담임준비_() {
  var ss = ss_();
  function mk(name, head, widths) {
    var s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      s.setFrozenRows(1);
      (widths || []).forEach(function (w, i) { if (w) s.setColumnWidth(i + 1, w); });
    }
    return s;
  }
  mk(HUB.OBS, ['기록ID', '묶음ID', '날짜', '번호', '이름', '내용', '영역', '태그', '기록시각'],
    [0, 0, 100, 50, 80, 420]);
  mk(HUB.FINAL, ['번호', '이름', '영역', '최종문구', '바이트', '수정시각'], [50, 80, 60, 520]);
  mk(HUB.EXT, ['기록ID', '받은시각', '출처', '번호', '이름', '날짜', '영역', '제목', '내용', '링크'],
    [0, 0, 110, 50, 80, 100, 60, 200, 420]);

  var st = stuSheetW_();
  if (String(st.getRange(1, 7).getValue() || '') === '') {
    st.getRange(1, 7).setValue('별칭(인식 이름)').setFontWeight('bold');
  }
  var cur = getConfig_();
  HUB_CONF.forEach(function (kv) {
    if (!(kv[0] in cur)) sheet_(SHEETS.CONFIG).appendRow([kv[0], kv[1]]);
  });
  cfgBust_();
  if (!getConfig_()['연동키']) setConfigValue_('연동키', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
}

/* ---------- 도우미 ---------- */
function hubRows_(name, width) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width).getValues().map(function (r, i) { return { r: r, row: i + 2 }; });
}
function hubDate_(v) { return v instanceof Date ? ymd_(v) : String(v == null ? '' : v).trim().slice(0, 10); }
function hubTime_(v) {
  return v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm') : String(v == null ? '' : v);
}
function hubNorm_(s) {
  return String(s || '').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '').replace(/[★☆*※]/g, '').replace(/\s/g, '');
}
function hubTagsOf_(v) {
  return String(v || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean)
    .map(function (t) { return t === '긍정' ? 'good' : (t === '주의' ? 'caution' : t); });
}
function hubGuessArea_(t) {
  t = String(t || '');
  if (/진로|희망|직업|학과|전공|적성|진학|대학/.test(t)) return '진로';
  if (/학급회의|자치|학생회|행사|캠페인|부서|반장|부반장|축제|체육대회/.test(t)) return '자율';
  return '행특';
}
function hubHash_(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('').slice(0, 14);
}

/* 학번(10203) ↔ 번호(3). 학번 = 학년×10000 + 반×100 + 번호 */
function hub학번_(no) {
  var c = getConfig_();
  return String(Number(c['학년'] || 1) * 10000 + Number(c['반'] || 1) * 100 + Number(no));
}
function hub번호_(sid) {
  var c = getConfig_();
  var n = Number(String(sid || '').trim());
  if (!n) return 0;
  var head = Number(c['학년'] || 1) * 100 + Number(c['반'] || 1);
  return Math.floor(n / 100) === head ? n % 100 : 0;
}
function hubFindNo_(no, sid, name) {
  var sts = students_();
  var n = Number(no) || hub번호_(sid);
  if (n && sts.some(function (s) { return s.no === n; })) return n;
  var nm = hubNorm_(name);
  if (nm) {
    var hit = sts.filter(function (s) { return hubNorm_(s.name) === nm; });
    if (hit.length === 1) return hit[0].no;
  }
  return 0;
}

/* 상담 신청 때 학번 · 이름이 명단과 맞는지 (상담.gs에서 부름) */
function 학번확인_(sid, name) {
  var no = hub번호_(sid);
  if (!no) return false;
  try { return hubNorm_(findStudent_(no).name) === hubNorm_(name); }
  catch (e) { return false; }
}

function hubAliases_() {
  var sh = stuSheetW_();
  var last = sh.getLastRow();
  var out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 7).getValues().forEach(function (r) {
    if (r[0] === '' || r[0] === null) return;
    out[Number(r[0])] = String(r[6] || '').split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  });
  return out;
}

/* ---------- 읽기 ---------- */
function hubObs_() {
  return hubRows_(HUB.OBS, 9).filter(function (x) { return x.r[0]; }).map(function (x) {
    return {
      row: x.row, id: String(x.r[0]), group: String(x.r[1] || ''), date: hubDate_(x.r[2]),
      no: Number(x.r[3]), name: String(x.r[4] || ''), text: String(x.r[5] || ''),
      area: String(x.r[6] || '행특'), tags: hubTagsOf_(x.r[7]), at: hubTime_(x.r[8])
    };
  });
}
function hubExt_() {
  return hubRows_(HUB.EXT, 10).filter(function (x) { return x.r[0]; }).map(function (x) {
    return {
      row: x.row, id: String(x.r[0]), at: hubTime_(x.r[1]), source: String(x.r[2] || ''),
      no: Number(x.r[3]), name: String(x.r[4] || ''), date: hubDate_(x.r[5]),
      area: String(x.r[6] || ''), title: String(x.r[7] || ''), text: String(x.r[8] || ''), link: String(x.r[9] || '')
    };
  });
}
function hubFinals_() {
  var map = {};
  hubRows_(HUB.FINAL, 6).forEach(function (x) {
    if (!x.r[0]) return;
    map[Number(x.r[0]) + '|' + String(x.r[2])] = {
      row: x.row, text: String(x.r[3] || ''), bytes: Number(x.r[4] || 0), at: hubTime_(x.r[5])
    };
  });
  return map;
}

/* 모든 프로그램의 기록을 학생별로 모읍니다. 반환: { 번호: [항목…] } (최근 것이 위) */
function hubSourcesAll_() {
  var cfg = getConfig_();
  var sts = students_();
  var map = {};
  sts.forEach(function (s) { map[s.no] = []; });
  function push(no, item) { if (map[no]) map[no].push(item); }

  try {
    var a21 = cfg['21일_영역'] || '자율';
    var plAll = plansAll_(), lgs = logs_(), total = Number(cfg['총일수'] || 21);
    sts.forEach(function (s) {
      var rounds = {};
      lgs.forEach(function (l) { if (l.no === s.no) rounds[l.round] = true; });
      plAll.forEach(function (p) { if (p.no === s.no) rounds[p.round] = true; });
      Object.keys(rounds).map(Number).sort(function (x, y) { return x - y; }).forEach(function (r) {
        var p = plAll.filter(function (x) { return x.no === s.no && x.round === r; })[0];
        var my = lgs.filter(function (l) { return l.no === s.no && l.round === r; })
          .sort(function (x, y) { return x.date < y.date ? -1 : 1; });
        var L = [];
        if (p) {
          if (p.topic) L.push('주제: ' + p.topic);
          if (p.job) L.push('희망 진로: ' + p.job);
          if (p.skill) L.push('키우려는 역량: ' + p.skill);
          if (p.motive) L.push('동기: ' + p.motive);
          if (p.detail) L.push('세부 계획: ' + p.detail);
        }
        L.push((r > 1 ? r + '회차 · ' : '') + '인증 ' + Math.min(my.length, total) + '/' + total + '일' + (my.length >= total ? ' (완주)' : ''));
        if (my.length) {
          L.push('인증 기록: ' + my.map(function (l, i) { return (i + 1) + '일차 ' + (l.text || '(파일 인증)'); }).join(' / '));
        }
        push(s.no, {
          id: '21:' + s.no + ':' + r, src: '21일 프로젝트' + (r > 1 ? ' ' + r + '회차' : ''), area: a21,
          date: my.length ? my[my.length - 1].date : '', title: (p && p.topic) || '21일 프로젝트', text: L.join('\n')
        });
      });
    });
  } catch (e) {}

  try {
    var aP = cfg['문제해결_영역'] || '자율';
    var teams = pblTeams_(), works = pblWorks_(), evs = pblEvals_();
    teams.forEach(function (t) {
      var w = works[t.id] || {};
      var done = pblDoneLevel_(w);
      var body = PBL_STEPS.map(function (def) {
        var b = def.fields.map(function (f) { return String(w[f] || ''); }).filter(Boolean).join(' ');
        return b ? ('[STEP' + def.n + ' ' + def.title + '] ' + b) : '';
      }).filter(Boolean).join('\n');
      t.memberNos.forEach(function (no) {
        var e = evs[no];
        var L = [(t.type === '개인' ? '개인 활동' : '모둠 ' + t.memberNos.length + '명 (' + t.memberNames + ')'),
          '진행 ' + done + '/5단계'];
        if (body) L.push(body);
        if (e) L.push('자기평가 평균 ' + e.avg + '점');
        if (t.comment) L.push('교사 코멘트: ' + t.comment);
        push(no, {
          id: 'pbl:' + t.id + ':' + no, src: '문제해결 프로젝트', area: aP,
          date: String(t.updated || t.created || '').slice(0, 10),
          title: t.name + (w.s1a ? ' — ' + w.s1a : ''), text: L.join('\n'), team: t.memberNos
        });
      });
    });
  } catch (e) {}

  try {
    신청읽기().forEach(function (r) {
      var no = hub번호_(r.sid);
      if (!no) return;
      if (r.status !== '완료' && !r.result) return;
      var area = r.area || '행특';
      if (area === '반영안함') return;
      var L = [];
      if (r.memo) L.push('학생이 먼저 적은 이야기: ' + r.memo);
      if (r.result) L.push('상담 내용: ' + r.result);
      if (r.follow) L.push('후속 조치: ' + r.follow);
      push(no, {
        id: 'c:' + r.id, src: '상담', area: area, date: r.date,
        title: '상담 (' + (r.slot === 'after' ? '방과후' : '점심시간') + ')', text: L.join('\n')
      });
    });
  } catch (e) {}

  hubObs_().forEach(function (o) {
    push(o.no, {
      id: 'o:' + o.id, src: '관찰', area: o.area, date: o.date, title: '관찰', text: o.text,
      tags: o.tags, group: o.group, obsId: o.id, at: o.at
    });
  });

  hubExt_().forEach(function (x) {
    push(x.no, {
      id: 'x:' + x.id, extId: x.id, src: x.source || '외부', area: x.area, date: x.date,
      title: x.title || x.source, text: x.text, link: x.link
    });
  });

  Object.keys(map).forEach(function (k) {
    map[k].sort(function (a, b) { return a.date === b.date ? 0 : (a.date < b.date ? 1 : -1); });
  });

  /* 소감문(자율/진로) · 학급 회의(자율) */
  try { actHubSources_(push, sts); } catch (e) {}
  /* 21일 프로젝트 2회차부터의 탐구 노트 */
  try { inqHubSources_(push, sts); } catch (e) {}
  return map;
}

/* ---------- 화면에 보내는 자료 ---------- */
function apiHubInit(pw, dev, ua) {
  isAdmin_(pw);
  if (dev && admTokOk_(pw) !== true) secAdminDevice_(dev, ua, '담임 기록실');
  var solo = solo_();   /* 단독판: 관찰 기록 · 생기부 · 21일 · 문제해결 자료는 만들지도 읽지도 않음 */
  if (!solo) 담임준비_();
  try { 준비(); } catch (e) {}
  var cfg = getConfig_();
  var al = solo ? {} : hubAliases_();
  var base = webBase_();
  var finals = solo ? {} : hubFinals_();
  var fOut = {};
  Object.keys(finals).forEach(function (k) { fOut[k] = { text: finals[k].text, at: finals[k].at }; });

  return {
    today: today_(),
    cfg: {
      학년: cfg['학년'] || '1', 반: cfg['반'] || '2',
      '21일_영역': cfg['21일_영역'] || '자율', '문제해결_영역': cfg['문제해결_영역'] || '자율',
      limits: {
        자율: Number(cfg['바이트_자율'] || 1500),
        진로: Number(cfg['바이트_진로'] || 2100),
        행특: Number(cfg['바이트_행특'] || 900)
      },
      staleDays: Number(cfg['관찰_밀림일수'] || 14),
      subtitle: cfg['부제'] || '',
      linkKey: cfg['연동키'] || '',
      autoBackup: (cfg['자동백업'] || '아니오') === '예',
      solo: solo_()
    },
    students: students_().map(function (s) {
      return { no: s.no, name: s.name, sid: hub학번_(s.no), aliases: al[s.no] || [] };
    }),
    sources: solo ? {} : hubSourcesAll_(),
    finals: fOut,
    urls: { home: base, counsel: base ? base + '?p=counsel' : '', teacher: base ? base + '?p=teacher' : '' },
    admTok: admTokFor_(pw)
  };
}

/* 관찰 기록 저장. entries: [{ date, text, nos:[번호…], area, tags:[…] }] */
function apiHubSaveObs(pw, entries) {
  isAdmin_(pw);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    담임준비_();
    var sh = ss_().getSheetByName(HUB.OBS);
    var sts = {};
    students_().forEach(function (s) { sts[s.no] = s; });
    var rows = [], now = new Date();
    (entries || []).forEach(function (e) {
      var text = String(e.text || '').trim().slice(0, 3000);
      var nos = (e.nos || []).map(Number).filter(function (n) { return sts[n]; });
      if (!text || !nos.length) return;
      var date = /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) ? String(e.date) : today_();
      var area = HUB_AREAS.indexOf(e.area) >= 0 ? e.area : hubGuessArea_(text);
      var tags = (e.tags || []).map(String).filter(Boolean).join(',');
      var group = nos.length > 1 ? 'g_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16) : '';
      nos.forEach(function (no) {
        rows.push(['r_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16), group, date, no, sts[no].name,
          text, area, tags, now]);
      });
    });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
    return { ok: true, saved: rows.length };
  } finally {
    lock.releaseLock();
  }
}

/* 관찰 기록 한 줄 고치기 / 지우기. patch: { text, area, tags[], remove } */
function apiHubEditObs(pw, id, patch) {
  isAdmin_(pw);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ss_().getSheetByName(HUB.OBS);
    var o = hubObs_().filter(function (x) { return x.id === String(id); })[0];
    if (!o) throw new Error('이미 지워진 기록입니다.');
    if (patch && patch.remove) { sh.deleteRow(o.row); return { ok: true }; }
    var text = String(patch.text != null ? patch.text : o.text).trim().slice(0, 3000);
    var area = HUB_AREAS.indexOf(patch.area) >= 0 ? patch.area : o.area;
    var tags = Array.isArray(patch.tags) ? patch.tags.map(String).filter(Boolean) : o.tags;
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(patch.date || '')) ? patch.date : o.date;
    sh.getRange(o.row, 3).setValue(date);
    sh.getRange(o.row, 6, 1, 3).setValues([[text, area, tags.join(',')]]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* 나이스에 넣을 최종 문구 */
function apiHubSaveFinal(pw, no, area, text, bytes) {
  isAdmin_(pw);
  if (HUB_AREAS.indexOf(area) < 0) throw new Error('영역이 올바르지 않습니다.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    담임준비_();
    hubWriteFinal_(findStudent_(no), area, text, bytes);
    return { ok: true, at: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm') };
  } finally {
    lock.releaseLock();
  }
}
function hubWriteFinal_(st, area, text, bytes) {
  var sh = ss_().getSheetByName(HUB.FINAL);
  var cur = hubFinals_()[st.no + '|' + area];
  var row = [st.no, st.name, area, String(text || '').trim(), Number(bytes || 0), new Date()];
  if (cur) sh.getRange(cur.row, 1, 1, 6).setValues([row]);
  else sh.appendRow(row);
}

/* 별칭 저장: { 번호: '민수, 민수기' } */
function apiHubSetAliases(pw, map) {
  isAdmin_(pw);
  담임준비_();
  var sh = stuSheetW_();
  students_().forEach(function (s) {
    if (Object.prototype.hasOwnProperty.call(map || {}, s.no)) {
      sh.getRange(s.row, 7).setValue(String(map[s.no] || '').trim());
    }
  });
  return { ok: true };
}

/* 명단 바꾸기 (21일·문제해결과 같은 명단). 별칭은 이름을 기준으로 따라갑니다. */
function apiHubSetRoster(pw, text) {
  isAdmin_(pw);
  if (!solo_()) 담임준비_();
  var old = hubAliases_(), byName = {}, bdByName = {};
  var sh = stuSheetW_();
  students_().forEach(function (s) {
    byName[hubNorm_(s.name)] = (old[s.no] || []).join(', ');
    var bd = sh.getRange(s.row, 9).getValue();
    if (bd !== '' && bd != null) bdByName[hubNorm_(s.name)] = bd;
  });
  var r = apiAdminSetRoster(pw, text);
  stuSheetW_();   /* 방금 쓴 명단을 다시 읽도록 기억해 둔 값 비우기 */
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 7, sh.getLastRow() - 1, 1).clearContent();
    sh.getRange(2, 9, sh.getLastRow() - 1, 1).clearContent();
  }
  students_().forEach(function (s) {
    var a = byName[hubNorm_(s.name)], bd = bdByName[hubNorm_(s.name)];
    if (a) sh.getRange(s.row, 7).setValue(a);
    if (bd) sh.getRange(s.row, 9).setNumberFormat('@').setValue(bd);
  });
  return r;
}

function apiHubRegenKey(pw) {
  isAdmin_(pw);
  setConfigValue_('연동키', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  return { ok: true, key: getConfig_()['연동키'] };
}

/* ---------- 자율 · 진로 파일에서 담기 ----------
   rows: [{ no, area:'자율'|'진로', title, text, date, source }]  같은 내용은 두 번 담지 않습니다. */
function apiHubImportActivities(pw, rows) {
  isAdmin_(pw);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    담임준비_();
    var sh = ss_().getSheetByName(HUB.EXT);
    var have = {};
    hubExt_().forEach(function (x) { have[x.id] = true; });
    var sts = {};
    students_().forEach(function (s) { sts[s.no] = s; });
    var out = [], skipped = 0, now = new Date();
    (rows || []).forEach(function (r) {
      var no = Number(r.no), area = r.area === '진로' ? '진로' : '자율';
      var text = String(r.text || '').trim().slice(0, 3000);
      if (!sts[no] || !text) return;
      var id = 'act_' + hubHash_(no + '|' + area + '|' + String(r.title || '') + '|' + text);
      if (have[id]) { skipped++; return; }
      have[id] = true;
      out.push([id, now, String(r.source || '자율·진로 파일').slice(0, 40), no, sts[no].name,
        String(r.date || '').slice(0, 10), area, String(r.title || '').slice(0, 200), text, '']);
    });
    if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, 10).setValues(out);
    return { ok: true, saved: out.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function apiHubDeleteExt(pw, ids) {
  isAdmin_(pw);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var set = {};
    (ids || []).forEach(function (i) { set[String(i)] = true; });
    var sh = ss_().getSheetByName(HUB.EXT);
    hubExt_().filter(function (x) { return set[x.id]; })
      .sort(function (a, b) { return b.row - a.row; })
      .forEach(function (x) { sh.deleteRow(x.row); });
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 백업 파일 (JSON) ---------- */
function hubBuildBackup_() {
  담임준비_();
  var cfg = getConfig_();
  var classId = 'c_' + (cfg['학년'] || '1') + '_' + (cfg['반'] || '1');
  var al = hubAliases_();
  var sts = students_();
  var finals = hubFinals_();
  var fo = {};
  Object.keys(finals).forEach(function (k) {
    var p = k.split('|');
    var sid = 's_' + p[0];
    fo[sid] = fo[sid] || {};
    fo[sid][p[1]] = finals[k].text;
  });
  return {
    app: 'gjil-class-diary',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      classes: [{
        id: classId,
        name: (cfg['학년'] || '1') + '학년 ' + (cfg['반'] || '1') + '반',
        students: sts.map(function (s) { return { id: 's_' + s.no, no: s.no, name: s.name, aliasesExtra: al[s.no] || [] }; })
      }],
      records: hubObs_().map(function (o) {
        return {
          id: o.id, classId: classId, studentId: 's_' + o.no, date: o.date, text: o.text,
          createdAt: o.at, updatedAt: '', groupId: o.group, tags: o.tags, area: o.area
        };
      }),
      activities: hubExt_().map(function (x) {
        return {
          id: x.id, classId: classId, studentId: 's_' + x.no, area: x.area, source: x.source,
          date: x.date, title: x.title, text: x.text, link: x.link
        };
      }),
      finals: fo
    }
  };
}

function apiHubExportBackup(pw) {
  isAdmin_(pw);
  return JSON.stringify(hubBuildBackup_());
}

/* 원래 시크릿 다이어리 백업과 이 앱의 백업을 모두 읽습니다. 이미 있는 기록(같은 ID)은 건너뜁니다. */
function apiHubImportBackup(pw, jsonText) {
  isAdmin_(pw);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return hubImport_(jsonText);
  } finally {
    lock.releaseLock();
  }
}

function hubImport_(jsonText) {
  담임준비_();
  var j;
  try { j = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText; }
  catch (e) { throw new Error('백업 파일을 읽을 수 없습니다. JSON 파일이 맞는지 확인해 주세요.'); }
  var d = j && (j.data || j);
  if (!d || !Array.isArray(d.records)) throw new Error('백업 파일 형식이 아닙니다. (records가 없습니다)');

  var roster = students_();
  var byName = {}, byNo = {};
  roster.forEach(function (s) {
    var k = hubNorm_(s.name);
    byName[k] = byName[k] ? -1 : s.no;
    byNo[s.no] = s;
  });

  /* 백업 속 학생 → 우리 명단 번호 */
  var map = {}, unmatched = [];
  var aliasAdd = {};
  (d.classes || []).forEach(function (c) {
    (c.students || []).forEach(function (s) {
      var k = hubNorm_(s.name);
      var no = byName[k] > 0 ? byName[k] : 0;
      if (!no && s.no && byNo[Number(s.no)] && hubNorm_(byNo[Number(s.no)].name) === k) no = Number(s.no);
      if (no) {
        map[s.id] = no;
        if (Array.isArray(s.aliasesExtra) && s.aliasesExtra.length) aliasAdd[no] = s.aliasesExtra;
      } else unmatched.push(s.name);
    });
  });

  var sts = byNo;
  var obsSh = ss_().getSheetByName(HUB.OBS);
  var haveObs = {};
  hubObs_().forEach(function (o) { haveObs[o.id] = true; });
  var rows = [], skipR = 0, noStudent = 0;
  d.records.forEach(function (r) {
    var no = map[r.studentId];
    if (!no) { noStudent++; return; }
    var id = String(r.id || ('r_' + hubHash_(no + r.date + r.text)));
    if (haveObs[id]) { skipR++; return; }
    haveObs[id] = true;
    var text = String(r.text || '').trim();
    if (!text) return;
    var area = HUB_AREAS.indexOf(r.area) >= 0 ? r.area : hubGuessArea_(text);
    var at = r.createdAt ? new Date(r.createdAt) : new Date();
    if (isNaN(at.getTime())) at = new Date();
    rows.push([id, String(r.groupId || ''), String(r.date || '').slice(0, 10), no, sts[no].name,
      text, area, (r.tags || []).join(','), at]);
  });
  if (rows.length) obsSh.getRange(obsSh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);

  /* 자율 · 진로 활동 */
  var extSh = ss_().getSheetByName(HUB.EXT);
  var haveExt = {};
  hubExt_().forEach(function (x) { haveExt[x.id] = true; });
  var acts = [];
  (d.activities || []).forEach(function (a) {
    var no = map[a.studentId];
    if (!no) return;
    var area = /진로|career|jinro/i.test(String(a.area || a.category || a.type || '')) ? '진로' : '자율';
    var text = String(a.text || a.content || a.body || '').trim();
    if (!text) return;
    var id = String(a.id || ('act_' + hubHash_(no + '|' + area + '|' + text)));
    if (haveExt[id]) return;
    haveExt[id] = true;
    acts.push([id, new Date(), String(a.source || a.sheet || '자율·진로 파일').slice(0, 40), no, sts[no].name,
      String(a.date || '').slice(0, 10), area, String(a.title || a.activity || '').slice(0, 200), text, String(a.link || '')]);
  });
  if (acts.length) extSh.getRange(extSh.getLastRow() + 1, 1, acts.length, 10).setValues(acts);

  /* 최종 문구: 이미 저장된 칸은 덮어쓰지 않습니다 */
  var fin = hubFinals_(), finN = 0;
  var fo = d.finals || {};
  Object.keys(fo).forEach(function (sid) {
    var no = map[sid];
    if (!no) return;
    var v = fo[sid];
    var pairs = [];
    if (typeof v === 'string') pairs.push(['행특', v]);
    else if (v && typeof v === 'object') {
      Object.keys(v).forEach(function (k) {
        var t = v[k];
        if (t && typeof t === 'object') t = t.text || t.final || '';
        var area = /진로|career|jinro/i.test(k) ? '진로'
          : (/자율|auto|jayul|self/i.test(k) ? '자율' : (/행특|행동|behav|haeng|comment|opinion/i.test(k) ? '행특' : ''));
        if (area && t) pairs.push([area, String(t)]);
      });
    }
    pairs.forEach(function (p) {
      if (fin[no + '|' + p[0]] && fin[no + '|' + p[0]].text) return;
      hubWriteFinal_(sts[no], p[0], p[1], 0);
      finN++;
    });
  });

  /* 백업에 있던 별칭 합치기 */
  var al = hubAliases_(), stSh = stuSheetW_();
  Object.keys(aliasAdd).forEach(function (no) {
    var cur = al[no] || [];
    aliasAdd[no].forEach(function (a) { if (cur.indexOf(a) < 0) cur.push(a); });
    stSh.getRange(sts[no].row, 7).setValue(cur.join(', '));
  });

  return {
    ok: true, records: rows.length, skipped: skipR, activities: acts.length, finals: finN,
    unmatched: unmatched, noStudent: noStudent
  };
}

/* ---------- 드라이브 보관함 ---------- */
function hubBackupFolder_() {
  var id = getConfig_()['백업폴더ID'];
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('학급다이어리_백업_' + ss_().getName());
  setConfigValue_('백업폴더ID', f.getId());
  return f;
}
function hubSaveBackupFile_(label) {
  var folder = hubBackupFolder_();
  var name = '학급다이어리_' + (label || '보관') + '_' +
    Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd_HHmm') + '.json';
  var f = folder.createFile(name, JSON.stringify(hubBuildBackup_()), 'application/json');
  var files = [], it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(HUB_BACKUP_KEEP).forEach(function (x) { try { x.setTrashed(true); } catch (e) {} });
  return f;
}

/* 트리거가 부르는 함수 (하루 한 번) */
function 담임자동백업() {
  hubSaveBackupFile_('자동');
}

function apiHubBackupNow(pw) {
  isAdmin_(pw);
  var f = hubSaveBackupFile_('수동');
  return { ok: true, name: f.getName() };
}

function apiHubListBackups(pw) {
  isAdmin_(pw);
  var folder = hubBackupFolder_(), out = [], it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    out.push({ id: f.getId(), name: f.getName(), at: hubTime_(f.getDateCreated()), size: f.getSize() });
  }
  out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  return { files: out, folderUrl: folder.getUrl() };
}

function apiHubRestoreBackup(pw, fileId) {
  isAdmin_(pw);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    hubSaveBackupFile_('되돌리기직전');
    return hubImport_(DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8'));
  } finally {
    lock.releaseLock();
  }
}

function apiHubSetAutoBackup(pw, on) {
  isAdmin_(pw);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === '담임자동백업') ScriptApp.deleteTrigger(t);
  });
  if (on) ScriptApp.newTrigger('담임자동백업').timeBased().everyDays(1).atHour(18).create();
  setConfigValue_('자동백업', on ? '예' : '아니오');
  return { ok: true, on: !!on };
}

/* ---------- 엑셀: 나이스 입력용 + 원자료 ---------- */
function apiHubXlsx(pw) {
  isAdmin_(pw);
  담임준비_();
  var finals = hubFinals_();
  var sources = hubSourcesAll_();
  var sts = students_();
  var stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  var tmp = SpreadsheetApp.create('__tmp_생기부_' + Utilities.getUuid().slice(0, 6));
  var tmpId = tmp.getId();
  try {
    var s1 = tmp.getSheets()[0];
    s1.setName('나이스 입력용');
    var h1 = ['번호', '이름', '자율·자치활동', '바이트', '진로활동', '바이트', '행동특성 및 종합의견', '바이트'];
    var r1 = [h1];
    sts.forEach(function (s) {
      var row = [s.no, s.name];
      HUB_AREAS.forEach(function (a) {
        var f = finals[s.no + '|' + a];
        row.push(f ? f.text : '', f ? f.bytes : '');
      });
      r1.push(row);
    });
    s1.getRange(1, 1, r1.length, h1.length).setValues(r1);

    var s2 = tmp.insertSheet('원자료');
    var h2 = ['번호', '이름', '영역', '출처', '날짜', '제목', '내용'];
    var r2 = [h2];
    sts.forEach(function (s) {
      (sources[s.no] || []).slice().reverse().forEach(function (it) {
        r2.push([s.no, s.name, it.area, it.src, it.date, it.title, it.text]);
      });
    });
    s2.getRange(1, 1, r2.length, h2.length).setValues(r2);

    [[s1, [50, 70, 420, 60, 420, 60, 420, 60]], [s2, [50, 70, 60, 120, 90, 200, 520]]].forEach(function (x) {
      var sh = x[0];
      sh.getRange(1, 1, 1, x[1].length).setFontWeight('bold').setBackground('#ECEDEA');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, sh.getMaxRows(), x[1].length).setVerticalAlignment('top').setWrap(true);
      x[1].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    });
    SpreadsheetApp.flush();

    var res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmpId + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('엑셀 변환에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    return { name: '생기부_' + stamp + '.xlsx', data: Utilities.base64Encode(res.getBlob().getBytes()) };
  } finally {
    try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (e) {}
  }
}

/* ================= 알림 (담임 기록실 오른쪽 위 종) =================
 * pend: 선생님이 처리할 때까지 계속 남는 일 (가입 승인, 계획서 승인, 건의 확인 등)
 * 그 밖: '마지막으로 종을 열어 본 때' 이후에 새로 생긴 일만 셉니다. 본 때는 기기와 상관없이 같도록 스크립트 속성에 둡니다. */
var HUB_ALERT_SEEN = 'hub_alert_seen';
function hubAlertNow_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function hubAlertSeen_() {
  var v = PropertiesService.getScriptProperties().getProperty(HUB_ALERT_SEEN);
  if (v) return v;
  /* 처음 쓰는 날: 지난 3일 것만 새 소식으로 보여 줍니다 */
  return Utilities.formatDate(new Date(Date.now() - 3 * 86400000), tz_(), 'yyyy-MM-dd HH:mm:ss');
}
function hubAlertNames_(arr, n) {
  var u = [];
  arr.forEach(function (x) { if (x && u.indexOf(x) < 0) u.push(x); });
  return u.slice(0, n || 5).join(', ') + (u.length > (n || 5) ? ' 외 ' + (u.length - (n || 5)) + '명' : '');
}
function apiHubAlerts(pw) {
  isAdmin_(pw);
  var seen = hubAlertSeen_(), now = hubAlertNow_(), today = today_();
  var out = [], errs = [];
  var add = function (o) { out.push(o); };
  var isNew = function (at) { return !!at && String(at) > seen; };
  var step = function (label, fn) { try { fn(); } catch (e) { errs.push(label + ': ' + e.message); } };

  /* 1. 학급 가입 승인 대기 */
  if (!solo_()) step('가입', function () {
    var w = students_().filter(function (s) { return s.approval === '대기'; });
    if (w.length) add({ k: 'join', cat: '학급 가입', pend: true, n: w.length, go: 'roster',
      title: '가입 승인을 기다리는 학생 ' + w.length + '명', detail: w.map(function (s) { return s.no + '. ' + s.name; }).join(', ') });
  });

  /* 2. 21일 프로젝트: 계획서 승인 대기 · 새 인증 · 3일 넘게 멈춘 학생 */
  if (!solo_()) step('21일', function () {
    var cur = {};
    students_().forEach(function (s) { cur[s.no] = s.round || 1; });
    var sh = sheet_(SHEETS.PLANS), last = sh.getLastRow();
    var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 10).getValues();
    var wait = [];
    rows.forEach(function (r) {
      var no = Number(r[0]);
      if (!no || (Number(r[9]) || 1) !== (cur[no] || 1)) return;
      if (String(r[7] || '') !== '승인' && String(r[5] || '').trim()) wait.push(no + '. ' + String(r[1] || '') + ' — ' + String(r[5]).slice(0, 30));
    });
    if (wait.length) add({ k: 'p21plan', cat: '21일 프로젝트', pend: true, n: wait.length, url: 'p21',
      title: '계획서 승인을 기다리는 학생 ' + wait.length + '명', detail: wait.join('\n') });
    var lg = logs_().filter(function (l) { return isNew(l.at); });
    if (lg.length) add({ k: 'p21log', cat: '21일 프로젝트', n: lg.length, url: 'p21', at: lg.map(function (l) { return l.at; }).sort().pop(),
      title: '새 인증 ' + lg.length + '건', detail: hubAlertNames_(lg.map(function (l) { return l.name; }), 8) });
    var iq = inqRows_().filter(function (x) { return isNew(x.at); });
    if (iq.length) add({ k: 'p21inq', cat: '21일 프로젝트', n: iq.length, url: 'p21', at: iq.map(function (x) { return x.at; }).sort().pop(),
      title: '탐구 노트(2회차 이후) 새로 씀 ' + iq.length + '건', detail: hubAlertNames_(iq.map(function (x) { return x.name; }), 8) });
    var b = board21Data_(), stuck = [];
    (b.list || []).forEach(function (x) {
      if (!x.start || x.completed || x.round > 1 || x.start > today) return;
      var ref = x.last || x.start;
      var gap = Math.round((new Date(today + 'T00:00:00Z') - new Date(ref + 'T00:00:00Z')) / 86400000);
      if (gap >= 3) stuck.push(x.no + '. ' + x.name + ' (' + (x.last ? '마지막 인증 ' + x.last.slice(5) : '아직 인증 없음') + ')');
    });
    if (stuck.length) add({ k: 'p21stuck', cat: '21일 프로젝트', n: stuck.length, url: 'p21', at: today + ' 00:00',
      title: '3일 넘게 인증이 없는 학생 ' + stuck.length + '명', detail: stuck.join('\n') });
  });

  /* 3. 문제해결 프로젝트: 새 팀 · 활동지 수정 · 파일 · 5단계 마치고 확인 대기 */
  if (!solo_()) step('문제해결', function () {
    var teams = pblTeams_();
    var tsh = sheet_(SHEETS.PBL_TEAM), tl = tsh.getLastRow();
    var tAt = {};
    (tl < 2 ? [] : tsh.getRange(2, 1, tl - 1, 10).getValues()).forEach(function (r) {
      tAt[String(r[0])] = r[9] instanceof Date ? Utilities.formatDate(r[9], tz_(), 'yyyy-MM-dd HH:mm') : String(r[9] || '');
    });
    var nt = teams.filter(function (t) { return isNew(tAt[t.id]); });
    if (nt.length) add({ k: 'pblteam', cat: '문제해결', n: nt.length, url: 'pbl', at: nt.map(function (t) { return tAt[t.id]; }).sort().pop(),
      title: '새 팀 ' + nt.length + '개', detail: nt.map(function (t) { return t.name + ' (' + t.memberNames + ')'; }).join('\n') });
    var ws = ss_().getSheetByName(SHEETS.PBL_WORK), wl = ws ? ws.getLastRow() : 0;
    var wr = wl < 2 ? [] : ws.getRange(2, 1, wl - 1, 19).getValues();
    var upd = [], lastAt = '', doneWait = [];
    wr.forEach(function (r) {
      var at = r[18] instanceof Date ? Utilities.formatDate(r[18], tz_(), 'yyyy-MM-dd HH:mm') : String(r[18] || '');
      if (isNew(at)) { upd.push(String(r[1] || '')); if (at > lastAt) lastAt = at; }
    });
    if (upd.length) add({ k: 'pblwork', cat: '문제해결', n: upd.length, url: 'pbl', at: lastAt,
      title: '활동지를 새로 쓰거나 고친 팀 ' + upd.length + '개', detail: hubAlertNames_(upd, 8) });
    var fs = ss_().getSheetByName(SHEETS.PBL_FILE), fl = fs ? fs.getLastRow() : 0;
    var fr = fl < 2 ? [] : fs.getRange(2, 1, fl - 1, 8).getValues().filter(function (r) {
      var at = r[7] instanceof Date ? Utilities.formatDate(r[7], tz_(), 'yyyy-MM-dd HH:mm') : String(r[7] || '');
      return isNew(at);
    });
    if (fr.length) add({ k: 'pblfile', cat: '문제해결', n: fr.length, url: 'pbl', at: fr.map(function (r) { return r[7] instanceof Date ? Utilities.formatDate(r[7], tz_(), 'yyyy-MM-dd HH:mm') : String(r[7] || ''); }).sort().pop(),
      title: '새 파일 ' + fr.length + '개', detail: fr.slice(0, 6).map(function (r) { return String(r[2]) + ' · ' + String(r[5]); }).join('\n') });
    teams.forEach(function (t) { if (t.done >= 5 && !t.confirmed) doneWait.push(t.name); });
    if (doneWait.length) add({ k: 'pblconf', cat: '문제해결', pend: true, n: doneWait.length, url: 'pbl',
      title: '5단계를 마치고 최종 확인을 기다리는 팀 ' + doneWait.length + '개', detail: doneWait.join(', ') });
  });

  /* 4. 상담 신청 (새로 들어온 신청 + 오늘 상담) */
  step('상담', function () {
    var bk = 신청읽기().filter(function (b) { return b.status !== '취소'; });
    bk.filter(function (b) { return isNew(b.at) && b.date >= today; }).forEach(function (b) {
      add({ k: 'counsel', cat: '상담 신청', n: 1, url: 'counsel', at: b.at,
        title: b.name + ' 학생이 상담을 신청했어요 — ' + b.date.slice(5).replace('-', '/') + ' ' + (b.slot === 'after' ? '방과후' : '점심시간'),
        detail: b.memo ? '하고 싶은 이야기: ' + b.memo : '' });
    });
    var td = bk.filter(function (b) { return b.date === today && !b.status; });
    if (td.length) add({ k: 'counselToday', cat: '상담 신청', pend: true, n: td.length, url: 'counsel',
      title: '오늘 상담 ' + td.length + '건', detail: td.map(function (b) { return (b.slot === 'after' ? '방과후 ' : '점심 ') + b.name; }).join(', ') });
  });

  /* 5. 교실 화면: 건의사항 · 조사 응답 */
  step('교실', function () {
    var sg = hubRows_(BOARD.SUGGEST, 5).filter(function (x) { return x.r[0] && String(x.r[4]) !== '확인'; });
    if (sg.length) add({ k: 'suggest', cat: '건의사항', pend: true, n: sg.length, go: 'board',
      title: '아직 확인하지 않은 건의 ' + sg.length + '건', detail: sg.slice(-5).map(function (x) { return '· ' + String(x.r[1]).slice(0, 60); }).join('\n') });
    var sv = boardSurveys_(), rs = boardResponses_(), total = students_().length;
    sv.forEach(function (s) {
      var mine = rs.filter(function (r) { return r.id === s.id; }), nw = mine.filter(function (r) { return isNew(r.at); });
      if (!nw.length) return;
      var etc = s.etc ? nw.filter(function (r) { return r.etc; }) : [];
      add({ k: 'survey', cat: s.kind === '체크' ? '이름 체크' : '조사', n: nw.length, go: 'board', at: nw.map(function (r) { return r.at; }).sort().pop(),
        title: '“' + s.q.slice(0, 30) + '” 새 응답 ' + nw.length + '건 (' + mine.length + '/' + total + '명' + (mine.length >= total ? ', 모두 응답' : '') + ')',
        detail: (s.anon ? '' : hubAlertNames_(nw.map(function (r) { return r.name; }), 8)) +
          (etc.length ? '\n기타로 직접 쓴 답: ' + etc.map(function (r) { return r.etc; }).join(' / ') : '') });
    });
  });

  /* 6. 소감문 제출 · 학급 회의 안건 제안 */
  if (!solo_()) step('소감문', function () {
    var es = essays_(), subs = essaySubs_();
    es.forEach(function (e) {
      var nw = subs.filter(function (x) { return x.id === e.id && (isNew(x.at) || isNew(x.updated)); });
      if (nw.length) add({ k: 'essay', cat: '소감문', n: nw.length, go: 'essay', at: nw.map(function (x) { return x.updated || x.at; }).sort().pop(),
        title: '“' + e.title.slice(0, 30) + '” 새로 내거나 고친 소감문 ' + nw.length + '편',
        detail: hubAlertNames_(nw.map(function (x) { return x.name; }), 8) });
    });
  });
  if (!solo_()) step('학급 회의', function () {
    var ag = agendas_().filter(function (a) { return a.propNo && a.status === '제안'; });
    if (ag.length) add({ k: 'agenda', cat: '학급 회의', pend: true, n: ag.length, go: 'meet',
      title: '학생이 낸 안건 ' + ag.length + '개 (아직 논의 전)', detail: ag.slice(0, 6).map(function (a) { return '· ' + a.title + ' — ' + a.propName; }).join('\n') });
  });

  out.forEach(function (o) { o.fresh = !o.pend && isNew(o.at || now); });
  out.sort(function (a, b) { return (b.pend ? 1 : 0) - (a.pend ? 1 : 0) || String(b.at || '').localeCompare(String(a.at || '')); });
  var count = out.filter(function (o) { return o.pend || o.fresh; }).reduce(function (s, o) { return s + (o.n || 1); }, 0);
  var base = '';
  try { base = webBase_() || ''; } catch (e) {}
  return { now: now, seen: seen, count: count, items: out, errs: errs,
    urls: { p21: base ? base + '?go=21' : '', pbl: base ? base + '?go=pbl' : '', counsel: base ? base + '?p=counsel' : '' } };
}
/* 종을 열어 본 뒤: 그때까지의 새 소식은 읽은 것으로 */
function apiHubAlertsSeen(pw, at) {
  isAdmin_(pw);
  at = String(at || '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(at)) at = hubAlertNow_();
  var cur = PropertiesService.getScriptProperties().getProperty(HUB_ALERT_SEEN) || '';
  if (at > cur) PropertiesService.getScriptProperties().setProperty(HUB_ALERT_SEEN, at);
  return { ok: true, seen: at > cur ? at : cur };
}

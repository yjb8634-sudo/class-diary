/*******************************************************
 * 강릉제일고 1-2 학급 자율활동 웹앱
 *  ① 21일 프로젝트 (작심 3주)
 *  ② 학교·사회 문제 해결 프로젝트
 * 구글 스프레드시트 + Apps Script 웹앱
 * 학생은 로그인 없이 링크만 열면 참여 가능 (번호 + 4자리 PIN)
 *******************************************************/
var FILEVER_자율 = '2026-11-03a';

const SHEETS = {
  CONFIG: '설정',
  STUDENTS: '학생명단',
  PLANS: '계획서',
  LOGS: '인증기록',
  PBL_TEAM: '문제해결_팀',
  PBL_WORK: '문제해결_활동지',
  PBL_EVAL: '문제해결_자기평가',
  PBL_FILE: '문제해결_파일'
};

const DEFAULT_CONFIG = [
  ['프로젝트명', '21일 프로젝트 (작심 3주)'],
  ['부제', '강릉제일고 1-2 자율활동'],
  ['총일수', '21'],
  ['관리자비밀번호', ''],
  ['소급허용일수', '1'],
  ['파일업로드허용', '예'],
  ['최대파일MB', '10'],
  ['파일링크공개', '예'],
  ['기록공개', '아니오'],
  ['현황판자동새로고침초', '30'],
  ['드라이브폴더ID', ''],
  ['PIN솔트', ''],
  ['가입암호', ''],
  ['문제해결_프로젝트명', '학교·사회 문제 해결 프로젝트'],
  ['문제해결_활동기간', ''],
  ['문제해결_모둠최대인원', '6'],
  ['문제해결_사용', '예']
];

/* 문제해결 프로젝트 — 단계 정의 */
const PBL_STEPS = [
  { n: 1, title: '문제 발견하기', desc: "우리 주변을 관찰하고 '진짜 문제'를 찾아봅시다",
    fields: ['s1a', 's1b', 's1c'] },
  { n: 2, title: '자료 수집하기', desc: '문제의 원인과 실태를 객관적인 자료로 확인해 봅시다',
    fields: ['s2m', 's2b'] },
  { n: 3, title: '의견 제안하기', desc: '조사한 내용을 바탕으로 해결 방안을 만들어 제안해 봅시다',
    fields: ['s3a', 's3b', 's3c'] },
  { n: 4, title: '타인과 조정하기', desc: '다른 의견을 듣고 함께 더 나은 방안으로 다듬어 봅시다',
    fields: ['s4a', 's4b', 's4c', 's4d'] },
  { n: 5, title: '변화 확인하기', desc: '실행한 뒤, 무엇이 어떻게 달라졌는지 점검해 봅시다',
    fields: ['s5a', 's5b', 's5c', 's5d'] }
];

const PBL_WORK_COLS = ['s1a', 's1b', 's1c', 's2m', 's2b', 's3a', 's3b', 's3c',
  's4a', 's4b', 's4c', 's4d', 's5a', 's5b', 's5c', 's5d'];

const PBL_EVAL_ITEMS = [
  '문제를 스스로 발견하고 그 이유를 설명할 수 있었다',
  '다양한 방법으로 자료를 수집하고 정리했다',
  '조사한 내용을 바탕으로 실현 가능한 방안을 제안했다',
  '다른 사람의 의견을 듣고 조정하며 함께 결정했다',
  '활동 전후의 변화를 점검하고 스스로 성찰했다'
];

const DEFAULT_ROSTER = [
  '김동언','김성수','김시환','김주원','김희동','당우혁','박영후','박준형','박태현',
  '손승범','손희찬','송 단','심재원','안준혁','엄태연','윤성준','이지범','임지훈',
  '장시우','최엘야','최준우','하승준','한규석','홍성우','홍성주','홍승준','홍하람'
];

/* ============ 기본 유틸 ============ */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('시트를 찾을 수 없습니다: ' + name + ' — 메뉴에서 [학급 운영 > 통합 설치]를 먼저 실행해 주세요.');
  return s;
}

function tz_() {
  return ss_().getSpreadsheetTimeZone() || 'Asia/Seoul';
}

function ymd_(d) {
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}

function today_() {
  return ymd_(new Date());
}

function parseYmd_(s) {
  const p = String(s).trim().split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function daysBetween_(a, b) {
  return Math.round((parseYmd_(b) - parseYmd_(a)) / 86400000);
}

function addDays_(s, n) {
  const d = parseYmd_(s);
  d.setDate(d.getDate() + n);
  return ymd_(d);
}

/* ============ 설정 ============ */

/* 설정 시트는 한 번 실행하는 동안 한 번만 읽습니다. (예전에는 요청 하나에 10번 넘게 읽어서 느렸습니다)
 * 설정을 바꾸는 함수(setConfigValue_ 등)는 cfgBust_()로 기억을 비웁니다. */
var CFG_MEMO_ = null;
/* 속도: [설정] 시트는 거의 바뀌지 않으므로 5분 동안 서버 저장본을 씁니다.
   프로그램이 설정을 바꾸면 바로 비우고, 시트를 손으로 고치면 onEdit가 비웁니다. */
var CFG_CKEY_ = 'cfg_v1';
function cfgBust_() { CFG_MEMO_ = null; try { CacheService.getScriptCache().remove(CFG_CKEY_); } catch (e) {} }
function getConfig_() {
  if (CFG_MEMO_) return Object.assign({}, CFG_MEMO_);
  var ch = null;
  try { ch = CacheService.getScriptCache(); var c = ch.get(CFG_CKEY_); if (c) { CFG_MEMO_ = JSON.parse(c); return Object.assign({}, CFG_MEMO_); } } catch (e) {}
  const rows = sheet_(SHEETS.CONFIG).getDataRange().getValues();
  const cfg = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) cfg[String(rows[i][0]).trim()] = String(rows[i][1]).trim();
  }
  CFG_MEMO_ = cfg;
  try { if (ch) { var t = JSON.stringify(cfg); if (t.length < 90000) ch.put(CFG_CKEY_, t, 300); } } catch (e) {}
  return Object.assign({}, cfg);
}

function setConfigValue_(key, value) {
  cfgBust_();
  const sh = sheet_(SHEETS.CONFIG);
  const rows = sh.getDataRange().getValues();
  /* 같은 이름의 줄이 여러 개 있으면(동시에 처음 만들어질 때 생길 수 있음) 모두 같은 값으로 바꿉니다.
     예전에는 첫 줄만 바꾸고, 읽을 때는 마지막 줄을 써서 저장한 값이 안 보이는 일이 있었습니다. */
  var hit = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); hit++; }
  }
  if (hit) {
    try { SpreadsheetApp.flush(); } catch (e) {}
    cfgBust_();
    if (typeof boardBust_ === 'function') boardBust_();   /* 칠판 자료 저장본도 함께 비움 */
    return;
  }
  sh.appendRow([key, value]);
  cfgBust_();
  if (typeof boardBust_ === 'function') boardBust_();
}

/* ============ 설치 ============ */

function setup() {
  const ss = ss_();

  // 설정 시트
  let cfg = ss.getSheetByName(SHEETS.CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(SHEETS.CONFIG);
    cfg.getRange(1, 1, 1, 2).setValues([['항목', '값']]).setFontWeight('bold');
    cfg.getRange(2, 1, DEFAULT_CONFIG.length, 2).setValues(DEFAULT_CONFIG);
    cfg.setColumnWidth(1, 180);
    cfg.setColumnWidth(2, 420);
  }

  // 학생명단
  let st = ss.getSheetByName(SHEETS.STUDENTS);
  if (!st) {
    st = ss.insertSheet(SHEETS.STUDENTS);
    st.getRange(1, 1, 1, 6)
      .setValues([['번호', '이름', 'PIN(암호화)', '시작일', '완료일', '비고']])
      .setFontWeight('bold');
    const rows = DEFAULT_ROSTER.map(function (n, i) { return [i + 1, n, '', '', '', '']; });
    st.getRange(2, 1, rows.length, 6).setValues(rows);
    st.setColumnWidth(3, 300);
  }

  // 계획서
  let pl = ss.getSheetByName(SHEETS.PLANS);
  if (!pl) {
    pl = ss.insertSheet(SHEETS.PLANS);
    pl.getRange(1, 1, 1, 9)
      .setValues([['번호', '이름', '희망직업(진로)', '핵심역량', '활동 동기', '프로젝트 주제',
        '세부 계획', '담임 승인', '수정시각']])
      .setFontWeight('bold');
  }

  // 인증기록
  let lg = ss.getSheetByName(SHEETS.LOGS);
  if (!lg) {
    lg = ss.insertSheet(SHEETS.LOGS);
    lg.getRange(1, 1, 1, 9)
      .setValues([['기록ID', '제출시각', '번호', '이름', '인증날짜', '일차', '기록 내용', '파일명', '파일링크']])
      .setFontWeight('bold');
    lg.setColumnWidth(7, 380);
  }

  /* ---- 문제해결 프로젝트 시트 ---- */
  let pt = ss.getSheetByName(SHEETS.PBL_TEAM);
  if (!pt) {
    pt = ss.insertSheet(SHEETS.PBL_TEAM);
    pt.getRange(1, 1, 1, 14)
      .setValues([['팀ID', '팀명', '유형', '구성원번호', '구성원이름', '문제 주제',
        '완료단계', '선생님 코멘트', '최종확인', '생성시각', '수정시각',
        '신청자번호', '신청자이름', '모집마감']])
      .setFontWeight('bold');
    pt.setColumnWidth(6, 300);
    pt.setColumnWidth(8, 320);
    pt.setColumnWidth(13, 200);
  }
  ensureRoundCols_();
  pblEnsureTeamCols_(); // 기존 설치본 업그레이드용: 신청자/모집상태 칸 보충 (기존 데이터는 그대로 둠)

  let pw2 = ss.getSheetByName(SHEETS.PBL_WORK);
  if (!pw2) {
    pw2 = ss.insertSheet(SHEETS.PBL_WORK);
    pw2.getRange(1, 1, 1, 19)
      .setValues([['팀ID', '팀명',
        '1-① 발견한 문제', '1-② 알게 된 경위', '1-③ 어려움을 겪는 사람·중요한 이유',
        '2-① 조사 방법', '2-② 알게 된 점',
        '3-① 해결 방안', '3-② 전달 대상·방법', '3-③ 더 준비할 점',
        '4-① 제안에 대한 반응', '4-② 다른 의견과 그 이유', '4-③ 최종 합의 내용', '4-④ 조정에서 배운 점',
        '5-① 실제로 달라진 점', '5-② 잘한 점', '5-③ 아쉬운 점', '5-④ 배운 점 활용 계획',
        '수정시각']])
      .setFontWeight('bold');
    for (let c2 = 3; c2 <= 18; c2++) pw2.setColumnWidth(c2, 260);
  }

  let pe = ss.getSheetByName(SHEETS.PBL_EVAL);
  if (!pe) {
    pe = ss.insertSheet(SHEETS.PBL_EVAL);
    pe.getRange(1, 1, 1, 10)
      .setValues([['번호', '이름', '팀ID', '팀명'].concat(
        PBL_EVAL_ITEMS.map(function (t, i) { return '★' + (i + 1) + ' ' + t; })
      ).concat(['평균'])])
      .setFontWeight('bold');
  }

  let pf = ss.getSheetByName(SHEETS.PBL_FILE);
  if (!pf) {
    pf = ss.insertSheet(SHEETS.PBL_FILE);
    pf.getRange(1, 1, 1, 8)
      .setValues([['기록ID', '팀ID', '팀명', '단계', '올린사람', '파일명', '파일링크', '올린시각']])
      .setFontWeight('bold');
  }

  // 설정 시트에 새 항목 보충 (기존 설치본 업그레이드용)
  const cur = getConfig_();
  DEFAULT_CONFIG.forEach(function (kv) {
    if (!(kv[0] in cur)) sheet_(SHEETS.CONFIG).appendRow([kv[0], kv[1]]);
  });
  cfgBust_();

  // PIN 솔트
  const c = getConfig_();
  const shSt = stuSheetW_();
  if (String(shSt.getRange(1, 10).getValue() || '') === '') shSt.getRange(1, 10).setValue('PIN정한시각').setFontWeight('bold');
  if (!c['PIN솔트']) {
    setConfigValue_('PIN솔트', Utilities.getUuid());
  }

  // 업로드 폴더
  if (!c['드라이브폴더ID']) {
    const folder = DriveApp.createFolder('21일프로젝트_인증파일_' + ss.getName());
    setConfigValue_('드라이브폴더ID', folder.getId());
  }
}

/* ============ 웹앱 진입 ============ */

function 자율페이지_(e) { return 화면내보내기_(자율화면값_((e && e.parameter) || {})); }
/* 화면에 넣을 값 (Apps Script 주소로 열 때와 학생 앱 주소로 열 때 같이 씁니다) */
function 자율화면값_(prm) {
  const cfg = getConfig_();
  /* 화면 나누기: ?go=21 이면 21일 화면만, ?go=pbl 이면 문제 해결 화면만, 아니면 첫 화면만 보냅니다. */
  const go = String(prm.go || '');
  const pblOn = (cfg['문제해결_사용'] || '예') === '예';
  const page = go === '21' ? '21' : (go === 'pbl' && pblOn ? 'pbl' : 'home');
  const bootCfg = JSON.stringify({
    page: page,
    title: cfg['프로젝트명'] || '21일 프로젝트 (작심 3주)',
    subtitle: cfg['부제'] || '',
    total: Number(cfg['총일수'] || 21),
    allowUpload: (cfg['파일업로드허용'] || '예') === '예',
    maxMB: Number(cfg['최대파일MB'] || 10),
    backDays: Number(cfg['소급허용일수'] || 1),
    openLogs: (cfg['기록공개'] || '아니오') === '예',
    refreshSec: Number(cfg['현황판자동새로고침초'] || 30),
    today: today_(),
    homeUrl: webBase_(),
    app: String(prm.app || '') === '1',
    go: go,
    boardUrl: page !== 'home' ? '' : (function () {
      try { if (typeof boardViewUrl_ === 'function') { board준비_(); return boardViewUrl_(); } } catch (x) {}
      return '';
    })(),
    pbl: {
      title: cfg['문제해결_프로젝트명'] || '학교·사회 문제 해결 프로젝트',
      period: cfg['문제해결_활동기간'] || '',
      maxMembers: Number(cfg['문제해결_모둠최대인원'] || 6),
      enabled: (cfg['문제해결_사용'] || '예') === '예',
      steps: PBL_STEPS,
      evalItems: PBL_EVAL_ITEMS
    }
  });
  return { template: 'Index', vars: { page: page, bootCfg: bootCfg }, title: cfg['부제'] || '학급 자율활동' };
}

function include(f) {
  return HtmlService.createHtmlOutputFromFile(f).getContent();
}

/* ============ PIN ============ */

function hashPin_(no, pin) {
  const salt = getConfig_()['PIN솔트'] || 'default-salt';
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + '|' + no + '|' + pin,
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/* ───── 한 번의 요청 안에서는 같은 시트를 다시 읽지 않습니다 ─────
 * 시트에 쓰는 곳은 stuSheetW_ · logSheetW_ · planSheetW_ 를 거치므로, 쓰는 순간 기억해 둔 값과 반 현황 저장본이 함께 비워집니다. */
var STU_MEMO_ = null, LOG_MEMO_ = null, PLN_MEMO_ = null;
function board21Bust_() { try { CacheService.getScriptCache().remove('b21v2'); } catch (e) {} }
function stuSheetW_() { STU_MEMO_ = null; board21Bust_(); return sheet_(SHEETS.STUDENTS); }
function logSheetW_() { LOG_MEMO_ = null; board21Bust_(); return sheet_(SHEETS.LOGS); }
function planSheetW_() { PLN_MEMO_ = null; board21Bust_(); return sheet_(SHEETS.PLANS); }
function students_() { if (!STU_MEMO_) STU_MEMO_ = studentsRead_(); return STU_MEMO_.slice(); }
function logs_() { if (!LOG_MEMO_) LOG_MEMO_ = logsRead_(); return LOG_MEMO_.slice(); }
function plansAll_() { if (!PLN_MEMO_) PLN_MEMO_ = plansAllRead_(); return PLN_MEMO_.slice(); }

function studentsRead_() {
  const rows = sheet_(SHEETS.STUDENTS).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === '' || rows[i][0] === null) continue;
    out.push({
      row: i + 1,
      no: Number(rows[i][0]),
      name: String(rows[i][1]).trim(),
      pinHash: String(rows[i][2] || ''),
      pinAt: rows[i][9] instanceof Date ? Utilities.formatDate(rows[i][9], tz_(), 'yyyy-MM-dd HH:mm') : String(rows[i][9] || ''),
      start: rows[i][3] ? (rows[i][3] instanceof Date ? ymd_(rows[i][3]) : String(rows[i][3])) : '',
      done: rows[i][4] ? (rows[i][4] instanceof Date ? ymd_(rows[i][4]) : String(rows[i][4])) : '',
      memo: String(rows[i][5] || ''),
      round: Number(rows[i][7]) || 1,
      approval: String(rows[i][10] || ''),
      req: String(rows[i][11] || ''),
      pinLen: Number(rows[i][12]) || (rows[i][2] ? 4 : 0),
      stamp: String(rows[i][13] || '')
    });
  }
  out.sort(function (a, b) { return a.no - b.no; });
  return out;
}

function findStudent_(no) {
  const all = students_();
  for (let i = 0; i < all.length; i++) if (all[i].no === Number(no)) return all[i];
  throw new Error('명단에 없는 번호입니다: ' + no);
}

/** PIN 확인. 미등록이면 최초 등록 처리 */
/* ================= 학급 로그인 (보안) =================
 *  - 가입: 학생이 학번 · 이름을 직접 적고 PIN 6자리를 정해 '신청' → 담임 선생님 승인 후 로그인
 *  - 로그인: 학번 + PIN → '로그인 표(token)'를 받아 기기에 저장, 30일 동안 모든 탭에서 다시 묻지 않음
 *  - 예전 4자리 PIN 학생: 로그인할 때 6자리로 바꿔야만 들어갈 수 있음
 *  - 승인 취소 · PIN 초기화 · PIN 변경 때 인증 표식(stamp)이 바뀌어, 그 전에 받은 표는 모두 무효가 됨
 * 학생명단 11~14번째 칸: 승인상태 · 가입신청 · PIN자리수 · 인증표식 */
var STU_COL = { APPROVE: 11, REQ: 12, PINLEN: 13, STAMP: 14 };
var GATE_DAYS = 30;
function stuStatus_(st) { return st.pinHash ? (st.approval || '승인') : ''; }
function stuSet_(st, col, v) { stuSheetW_().getRange(st.row, col).setValue(v); }
function newStamp_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function sidOf_(no) {
  var c = getConfig_();
  return String(c['학년'] || '1') + ('0' + (c['반'] || '2')).slice(-2) + ('0' + no).slice(-2);
}
function sidToNo_(sid) {
  var s = String(sid || '').replace(/\D/g, '');
  if (s.length < 4 || s.length > 6) throw new Error('학번을 숫자로 적어 주세요. 예) 10203');
  var c = getConfig_(), prefix = String(c['학년'] || '1') + ('0' + (c['반'] || '2')).slice(-2);
  if (s.slice(0, -2) !== prefix) throw new Error('우리 반 학번이 아니에요. 학번을 다시 확인해 주세요.');
  return Number(s.slice(-2));
}
function pinVerify_(st, pin) {
  var status = stuStatus_(st);
  if (!st.pinHash) throw new Error('아직 학급가입을 하지 않았어요. [학급가입]에서 먼저 신청해 주세요.');
  if (status === '대기') throw new Error('담임 선생님의 가입 승인을 기다리는 중이에요. 승인되면 로그인할 수 있어요.');
  if (status === '거절') throw new Error('가입이 승인되지 않았어요. 담임 선생님께 말해 주세요.');
  secCheck_('pin', st.no);
  if (!secEqual_(st.pinHash, hashPin_(st.no, pin))) {
    var left = secFail_('pin', st.no);
    throw new Error('학번이나 PIN이 맞지 않아요. (' + left + '번 더 틀리면 잠깁니다)');
  }
  secOk_('pin', st.no);
}
/* 로그인 표 */
function tokProps_() { return PropertiesService.getScriptProperties(); }
function tokNew_(st) {
  var stamp = st.stamp;
  if (!stamp) { stamp = newStamp_(); stuSet_(st, STU_COL.STAMP, stamp); }
  var tok = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var P = tokProps_(), now = Date.now();
  try {   /* 지난 표 정리 */
    var all = P.getProperties();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('tk_') !== 0) return;
      try { if (JSON.parse(all[k]).exp < now) P.deleteProperty(k); } catch (e) { P.deleteProperty(k); }
    });
  } catch (e) {}
  P.setProperty('tk_' + tok, JSON.stringify({ no: st.no, st: stamp, exp: now + GATE_DAYS * 864e5 }));
  return tok;
}
function tokAuth_(no, tok) {
  var raw = null;
  try { raw = tokProps_().getProperty('tk_' + String(tok || '')); } catch (e) {}
  var p = null;
  try { p = raw ? JSON.parse(raw) : null; } catch (e) {}
  if (!p || p.exp < Date.now() || Number(p.no) !== Number(no)) throw new Error('LOGIN: 다시 로그인해 주세요.');
  var st = findStudent_(p.no);
  if (stuStatus_(st) !== '승인' || !st.stamp || st.stamp !== p.st) throw new Error('LOGIN: 다시 로그인해 주세요.');
  return st;
}
/* 모든 학생 기능이 쓰는 확인: 로그인 표(t:…) 또는 PIN 6자리 */
function auth_(no, pin) {
  pin = String(pin || '').trim();
  if (pin.indexOf('t:') === 0) return tokAuth_(no, pin.slice(2));
  if (!/^\d{4}$|^\d{6}$/.test(pin)) throw new Error('PIN 6자리를 넣어 주세요.');
  var st = findStudent_(no);
  pinVerify_(st, pin);
  if (st.pinLen !== 6) throw new Error('PIN을 6자리로 바꿔야 해요. [학급가입 → PIN 바꾸기]에서 바꾼 뒤 다시 해 주세요.');
  return st;
}
/* 반 전체 자료(현황판 등)를 볼 때: 학생 로그인 또는 담임 선생님(관리자 비밀번호) */
function gateAuth_(no, pin) {
  var p = String(pin || '');
  if (p.indexOf('pw:') === 0) { isAdmin_(p.slice(3)); return { teacher: true }; }
  return auth_(no, p);
}

/* ---------- 학생: 로그인 · 가입 · PIN 바꾸기 ---------- */
function pinOk6_(pin) {
  pin = String(pin || '').trim();
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN은 숫자 6자리로 정해 주세요.');
  if (/^(\d)\1{5}$/.test(pin) || '01234567890'.indexOf(pin) >= 0 || '09876543210'.indexOf(pin) >= 0)
    throw new Error('너무 쉬운 PIN이에요. 같거나 이어진 숫자는 피해 주세요.');
  return pin;
}
function gateOut_(st, tok) { return { ok: true, no: st.no, sid: sidOf_(st.no), name: st.name, tok: tok }; }
function apiGateLogin(sid, pin) {
  {
    var no = sidToNo_(sid);
    pin = String(pin || '').trim();
    if (!/^\d{4}$|^\d{6}$/.test(pin)) throw new Error('PIN 6자리를 넣어 주세요.');
    var st = findStudent_(no);
    pinVerify_(st, pin);
    if (st.pinLen !== 6) return { ok: true, needUpgrade: true, no: st.no, sid: sidOf_(st.no), name: st.name };
    return gateOut_(st, tokNew_(st));
  }
}
function apiGateUpgrade(sid, oldPin, newPin) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var no = sidToNo_(sid), st = findStudent_(no);
    pinVerify_(st, String(oldPin || '').trim());
    newPin = pinOk6_(newPin);
    if (newPin === String(oldPin).trim()) throw new Error('지금 PIN과 다른 번호로 정해 주세요.');
    var stamp = newStamp_();
    var sh = stuSheetW_();
    sh.getRange(st.row, 3).setValue(hashPin_(st.no, newPin));
    sh.getRange(st.row, 10).setValue(Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'));
    sh.getRange(st.row, STU_COL.PINLEN).setValue(6);
    sh.getRange(st.row, STU_COL.STAMP).setValue(stamp);
    st.stamp = stamp;
    return gateOut_(st, tokNew_(st));
  } finally { lock.releaseLock(); }
}
function apiGateCheck(no, tok) {
  var st = tokAuth_(no, tok);
  return { ok: true, no: st.no, sid: sidOf_(st.no), name: st.name };
}
function apiGateLogout(tok) {
  try { tokProps_().deleteProperty('tk_' + String(tok || '')); } catch (e) {}
  return { ok: true };
}
function apiJoinInfo() {
  /* 명단은 보내지 않습니다. 가입암호가 필요한지만 알려 줍니다. */
  return { needJoin: !!String(getConfig_()['가입암호'] || '').trim() };
}
function apiJoinRequest(sid, name, pin, joinPw) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var no = sidToNo_(sid), st = findStudent_(no);
    var nm = String(name || '').replace(/\s/g, '');
    if (nm.length < 2) throw new Error('이름을 적어 주세요.');
    secCheck_('pin', st.no);
    if (nm !== String(st.name).replace(/\s/g, '')) {
      secFail_('pin', st.no);
      throw new Error('학번과 이름이 명단과 맞지 않아요. 다시 확인해 주세요.');
    }
    var need = String(getConfig_()['가입암호'] || '').trim();
    if (need && !secEqual_(String(joinPw || '').trim(), need)) { secFail_('pin', st.no); throw new Error('가입암호가 맞지 않아요.'); }
    var status = stuStatus_(st);
    if (status === '승인') throw new Error('이미 가입되어 있어요. PIN을 잊었다면 담임 선생님께 초기화를 부탁해 주세요.');
    pin = pinOk6_(pin);
    var sh = stuSheetW_(), now = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
    sh.getRange(st.row, 3).setValue(hashPin_(st.no, pin));
    sh.getRange(st.row, 10).setValue(now);
    sh.getRange(st.row, STU_COL.APPROVE, 1, 4).setValues([['대기', JSON.stringify({ sid: String(sid).replace(/\D/g, ''), name: String(name).trim(), at: now }), 6, newStamp_()]]);
    secOk_('pin', st.no);
    return { ok: true, pending: true };
  } finally { lock.releaseLock(); }
}
function apiChangePin(sid, oldPin, newPin) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var no = sidToNo_(sid), st = findStudent_(no);
    pinVerify_(st, String(oldPin || '').trim());
    newPin = pinOk6_(newPin);
    if (newPin === String(oldPin).trim()) throw new Error('지금 PIN과 다른 번호로 정해 주세요.');
    var stamp = newStamp_(), sh = stuSheetW_();
    sh.getRange(st.row, 3).setValue(hashPin_(st.no, newPin));
    sh.getRange(st.row, 10).setValue(Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'));
    sh.getRange(st.row, STU_COL.PINLEN).setValue(6);
    sh.getRange(st.row, STU_COL.STAMP).setValue(stamp);
    st.stamp = stamp;
    return gateOut_(st, tokNew_(st));
  } finally { lock.releaseLock(); }
}

/* ---------- 담임 선생님: 가입 승인 ---------- */
function apiGateAdmin(pw) {
  isAdmin_(pw);
  return { list: students_().map(function (s) {
    var r = null; try { r = s.req ? JSON.parse(s.req) : null; } catch (e) {}
    return { no: s.no, sid: sidOf_(s.no), name: s.name, status: stuStatus_(s), pinLen: s.pinHash ? s.pinLen : 0, pinAt: s.pinAt, req: r };
  }) };
}
function apiGateDecide(pw, no, op) {
  isAdmin_(pw);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var targets = op === 'approveAll' ? students_().filter(function (s) { return stuStatus_(s) === '대기'; }) : [findStudent_(no)];
    targets.forEach(function (st) {
      var sh = stuSheetW_();
      if (op === 'approve' || op === 'approveAll') sh.getRange(st.row, STU_COL.APPROVE).setValue('승인');
      else if (op === 'reject' || op === 'revoke') { sh.getRange(st.row, STU_COL.APPROVE).setValue('거절'); sh.getRange(st.row, STU_COL.STAMP).setValue(newStamp_()); }
      else if (op === 'reset') {
        sh.getRange(st.row, 3).setValue(''); sh.getRange(st.row, 10).setValue('');
        sh.getRange(st.row, STU_COL.APPROVE, 1, 4).setValues([['', '', '', newStamp_()]]);
        secOk_('pin', st.no);
      }
    });
  } finally { lock.releaseLock(); }
  return apiGateAdmin(pw);
}

/** 클라이언트용: 로그인 (없으면 등록) */
function apiJoin() { throw new Error('새 학급가입 화면을 써 주세요. (학번 · 이름 · PIN 6자리)'); }

function apiLogin(no, pin) {
  {
    const st = auth_(no, pin);
    return { ok: true, no: st.no, name: st.name, mine: mine_(st) };
  }
}

/* ============ 기록 조회 ============ */

function ensureRoundCols_() {
  const put = function (sh, col, label) {
    if (String(sh.getRange(1, col).getValue() || '') === '') sh.getRange(1, col).setValue(label).setFontWeight('bold');
  };
  put(logSheetW_(), 10, '회차');
  put(planSheetW_(), 10, '회차');
  put(stuSheetW_(), 8, '현재회차');
}

function logsRead_() {
  const sh = sheet_(SHEETS.LOGS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 10).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    out.push({
      row: i + 2,
      id: String(rows[i][0]),
      at: rows[i][1] instanceof Date ? Utilities.formatDate(rows[i][1], tz_(), 'yyyy-MM-dd HH:mm') : String(rows[i][1]),
      no: Number(rows[i][2]),
      name: String(rows[i][3]),
      date: rows[i][4] instanceof Date ? ymd_(rows[i][4]) : String(rows[i][4]),
      day: Number(rows[i][5]),
      text: String(rows[i][6] || ''),
      fileName: String(rows[i][7] || ''),
      fileUrl: String(rows[i][8] || ''),
      round: Number(rows[i][9]) || 1
    });
  }
  return out;
}

/** 모든 회차의 계획서 */
function plansAllRead_() {
  const sh = sheet_(SHEETS.PLANS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 10).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    out.push({
      row: i + 2,
      no: Number(rows[i][0]),
      name: String(rows[i][1] || ''),
      job: String(rows[i][2] || ''),
      skill: String(rows[i][3] || ''),
      motive: String(rows[i][4] || ''),
      topic: String(rows[i][5] || ''),
      detail: String(rows[i][6] || ''),
      approved: String(rows[i][7] || '') === '승인',
      round: Number(rows[i][9]) || 1
    });
  }
  return out;
}

/** 학생마다 지금 회차의 계획서만: { 번호: 계획서 } */
function plans_() {
  const cur = {};
  students_().forEach(function (s) { cur[s.no] = s.round; });
  const map = {};
  plansAll_().forEach(function (p) { if (p.round === (cur[p.no] || 1)) map[p.no] = p; });
  return map;
}

/** 회차별 인증 수: { 회차: 건수 } */
function roundCounts_(no, lgs) {
  const c = {};
  lgs.forEach(function (l) { if (l.no === no) c[l.round] = (c[l.round] || 0) + 1; });
  return c;
}
function trophiesOf_(no, lgs, total) {
  const c = roundCounts_(no, lgs);
  return Object.keys(c).filter(function (r) { return c[r] >= total; }).length;
}

/** 메인 현황판 */
function apiBoard(no, pin) { gateAuth_(no, pin); return board21Cached_(); }
function board21Cached_() {
  var ch = CacheService.getScriptCache();
  try { var c = ch.get('b21v2'); if (c) return JSON.parse(c); } catch (e) {}
  var d = board21Data_();
  try { var str = JSON.stringify(d); if (str.length < 90000) ch.put('b21v2', str, 20); } catch (e) {}
  return d;
}
function board21Data_() {
  const cfg = getConfig_();
  const total = Number(cfg['총일수'] || 21);
  const openLogs = (cfg['기록공개'] || '아니오') === '예';
  const sts = students_();
  const lgs = logs_();
  const pls = plans_();
  const INQR = inqRows_();

  const byNo = {};
  sts.forEach(function (s) {
    byNo[s.no] = {
      no: s.no, name: s.name, start: s.start, done: s.done, round: s.round,
      count: 0, days: [], last: '',
      trophies: trophiesOf_(s.no, lgs, total),
      topic: pls[s.no] ? pls[s.no].topic : '',
      approved: pls[s.no] ? pls[s.no].approved : false,
      hasPin: !!s.pinHash,
      inq: s.round >= 2 ? (function () { var q = inqOf_(s.no, s.round, INQR); return { done: q.done, total: q.total, topic: q.bridge ? q.bridge.topic : '' }; })() : null
    };
  });

  lgs.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  lgs.forEach(function (l) {
    const b = byNo[l.no];
    if (!b || l.round !== b.round) return;
    b.count++;
    b.days.push({ d: l.date, n: b.count, text: openLogs ? l.text : '', file: openLogs ? l.fileUrl : '' });
    if (!b.last || l.date > b.last) b.last = l.date;
  });

  const today = today_();
  const list = sts.map(function (s) {
    const b = byNo[s.no];
    b.count = Math.min(b.count, total);
    b.pct = Math.round(b.count / total * 100);
    b.completed = b.count >= total;
    b.todayDone = b.days.some(function (x) { return x.d === today; });
    b.elapsed = b.start ? daysBetween_(b.start, today) + 1 : 0;
    b.target = b.start ? addDays_(b.start, total - 1) : '';
    return b;
  });

  const sum = list.reduce(function (a, x) { return a + x.count; }, 0);

  return {
    total: total,
    today: today,
    list: list,
    stat: {
      students: list.length,
      completed: list.filter(function (x) { return x.completed; }).length,
      trophies: list.reduce(function (a, x) { return a + x.trophies; }, 0),
      todayDone: list.filter(function (x) { return x.todayDone; }).length,
      avg: list.length ? Math.round(sum / list.length * 10) / 10 : 0
    }
  };
}

/* ================= 2회차부터: 탐구 노트 =================
 * 1회차(21일 매일 인증)를 마치면 '다리'(한계 → 질문 → 주제)를 쓰고 2회차로 넘어갑니다.
 * 2회차부터는 날짜 제한 없이, 학생이 스스로 점검하는 '탐구 격 체크' 5단계를 따라 진행합니다.
 *   ① 주제 선정(구체화) ② 이론적 배경(이론화) ③ 탐구 과정(실증화) ④ 결론 및 제언(실천화) ⑤ 배우고 느낀 것(내면화)
 * 시트 '탐구기록': 번호 · 이름 · 회차 · 단계(0=다리, 1~5) · 내용(JSON) · 점검(JSON) · 수정시각 */
var INQ_SHEET = '탐구기록';
var INQ_BRIDGE = [
  { k: 'limit', label: '1회차(21일)를 하며 잘 안 되었던 점 · 아쉬웠던 점', ph: '예) 문제를 많이 풀었지만 왜 틀리는지는 끝까지 몰랐다' },
  { k: 'question', label: '그 한계를 겪으며 새로 생긴 질문', ph: '예) 같은 유형을 반복해서 틀리는 이유는 무엇일까?' },
  { k: 'topic', label: '2회차에서 탐구해 보고 싶은 주제 (한 줄)', ph: '예) 고1 학생의 반복 오답 원인 분석과 오답 노트 방법 비교' }
];
var INQ_STAGES = [
  { n: 1, title: '주제 선정', level: '구체화', ask: '주제가 너무 넓지 않은가? 무엇(대상, 변수)을 탐구하려 하는가?',
    fields: ['탐구 주제 (한 문장으로)', '탐구할 대상과 변수', '이 주제를 고른 까닭 (1회차에서 이어진 점)'],
    checks: ['주제를 한 문장으로 좁혀 말할 수 있다', '무엇을(대상 · 변수) 탐구할지 정했다'] },
  { n: 2, title: '이론적 배경', level: '이론화', ask: '내 생각인가, 근거가 있는가? 활용할 이론, 전문 도서는?',
    fields: ['활용할 이론 · 개념', '참고한 자료 (책 · 논문 · 기사 · 사이트)'],
    checks: ['내 생각에 근거(이론 · 자료)가 있다', '참고한 자료의 출처를 적었다'] },
  { n: 3, title: '탐구 과정', level: '실증화', ask: '말로만 주장했는가? 데이터(통계, 실험, 설문)는 있는가?',
    fields: ['탐구 방법과 순서', '모은 데이터와 결과 (통계 · 실험 · 설문)'],
    checks: ['직접 모은 데이터(통계 · 실험 · 설문)가 있다', '방법과 과정을 다른 사람이 따라 할 수 있게 적었다'] },
  { n: 4, title: '결론 및 제언', level: '실천화', ask: '알기만 하고 끝났는가? 구체적 대안, 산출물은?',
    fields: ['결론', '구체적인 대안 · 만든 산출물'],
    checks: ['결과를 바탕으로 구체적인 대안을 냈다', '산출물(보고서 · 제안서 · 캠페인 등)을 만들었다'] },
  { n: 5, title: '배우고 느낀 것', level: '내면화', ask: '지식 습득을 넘어섰는가? 직업관, 태도의 변화는?',
    fields: ['배우고 느낀 것', '나의 변화 (생각 · 태도 · 직업관)'],
    checks: ['알게 된 것을 넘어 생각이나 태도가 바뀐 점을 적었다', '나의 진로 · 직업관과 연결해 보았다'] }
];
function inqSheet_() {
  var ss = ss_(), sh = ss.getSheetByName(INQ_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INQ_SHEET);
    sh.getRange(1, 1, 1, 7).setValues([['번호', '이름', '회차', '단계', '내용', '점검', '수정시각']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function inqRows_() {
  var sh = ss_().getSheetByName(INQ_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().map(function (r, i) {
    var j = function (v, d) { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } };
    return { row: i + 2, no: Number(r[0]), name: String(r[1] || ''), round: Number(r[2]) || 0, step: Number(r[3]),
      fields: j(String(r[4] || ''), {}), checks: j(String(r[5] || ''), []),
      at: r[6] instanceof Date ? Utilities.formatDate(r[6], tz_(), 'yyyy-MM-dd HH:mm') : String(r[6] || '') };
  }).filter(function (x) { return x.no; });
}
function inqStageDone_(stg, rec) {
  if (!rec) return false;
  var f = rec.fields || [];
  var filled = stg.fields.every(function (_, i) { return String(f[i] || '').replace(/\s/g, '').length >= 5; });
  var checked = stg.checks.every(function (_, i) { return !!(rec.checks || [])[i]; });
  return filled && checked;
}
function inqOf_(no, round, rows) {
  rows = rows || inqRows_();
  var mine = rows.filter(function (x) { return x.no === no && x.round === round; });
  var bridge = mine.filter(function (x) { return x.step === 0; })[0];
  var stages = INQ_STAGES.map(function (stg) {
    var rec = mine.filter(function (x) { return x.step === stg.n; })[0];
    return { n: stg.n, fields: rec ? rec.fields : [], checks: rec ? rec.checks : [], at: rec ? rec.at : '', done: inqStageDone_(stg, rec) };
  });
  var done = stages.filter(function (x) { return x.done; }).length;
  return { round: round, bridge: bridge ? bridge.fields : null, stages: stages, done: done, total: INQ_STAGES.length, complete: done === INQ_STAGES.length };
}
function inqUpsert_(st, round, step, fields, checks) {
  board21Bust_();
  var sh = inqSheet_();
  var cur = inqRows_().filter(function (x) { return x.no === st.no && x.round === round && x.step === step; })[0];
  var vals = [st.no, st.name, round, step, JSON.stringify(fields), JSON.stringify(checks || []), new Date()];
  if (cur) sh.getRange(cur.row, 1, 1, 7).setValues([vals]);
  else sh.appendRow(vals);
}
/* 학생: 단계 저장 */
function apiInqSave(no, pin, step, fields, checks) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var st = auth_(no, pin);
    if (st.round < 2) throw new Error('탐구 노트는 2회차부터 써요.');
    var stg = INQ_STAGES.filter(function (x) { return x.n === Number(step); })[0];
    if (!stg) throw new Error('없는 단계입니다.');
    var f = stg.fields.map(function (_, i) { return String((fields || [])[i] || '').trim().slice(0, 3000); });
    var c = stg.checks.map(function (_, i) { return !!(checks || [])[i]; });
    inqUpsert_(st, st.round, stg.n, f, c);
    return { ok: true, mine: mine_(findStudent_(st.no)) };
  } finally { lock.releaseLock(); }
}
/* 담임 기록실 '생기부 정리' 원자료 */
function inqHubSources_(push, sts) {
  var area = getConfig_()['21일_영역'] || '자율';
  var rows = inqRows_();
  sts.forEach(function (st) {
    var rounds = {};
    rows.forEach(function (x) { if (x.no === st.no) rounds[x.round] = true; });
    Object.keys(rounds).map(Number).forEach(function (r) {
      var q = inqOf_(st.no, r, rows), L = [];
      if (q.bridge) L.push('출발점(이전 회차의 한계): ' + (q.bridge.limit || '') + ' / 새 질문: ' + (q.bridge.question || ''));
      INQ_STAGES.forEach(function (stg, i) {
        var s = q.stages[i];
        var body = stg.fields.map(function (lb, k) { return s.fields[k] ? lb + ': ' + s.fields[k] : ''; }).filter(Boolean).join(' / ');
        if (body) L.push('[' + stg.title + '(' + stg.level + ')' + (s.done ? ' ✓' : '') + '] ' + body);
      });
      if (!L.length) return;
      var date = q.stages.map(function (s) { return s.at; }).filter(Boolean).sort().pop() || '';
      push(st.no, { id: 'inq:' + st.no + ':' + r, src: '21일 프로젝트 ' + r + '회차 탐구', area: area, date: String(date).slice(0, 10),
        title: (q.bridge && q.bridge.topic ? q.bridge.topic : r + '회차 탐구') + ' (' + q.done + '/' + q.total + '단계)', text: L.join('\n') });
    });
  });
}

function mine_(st) {
  const cfg = getConfig_();
  const total = Number(cfg['총일수'] || 21);
  const all = logs_().filter(function (l) { return l.no === st.no; });
  const my = all.filter(function (l) { return l.round === st.round; });
  my.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  my.forEach(function (l, i) { l.day = i + 1; });
  const pl = plans_()[st.no] || null;
  const counts = roundCounts_(st.no, all);
  const allPlans = plansAll_().filter(function (p) { return p.no === st.no; });
  const history = Object.keys(counts).map(Number).filter(function (r) { return r !== st.round; })
    .sort(function (a, b) { return a - b; }).map(function (r) {
      const ls = all.filter(function (l) { return l.round === r; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      const p = allPlans.filter(function (x) { return x.round === r; })[0];
      return { round: r, count: counts[r], done: counts[r] >= total, topic: p ? p.topic : '',
        start: ls.length ? ls[0].date : '', end: ls.length ? ls[ls.length - 1].date : '' };
    });
  return {
    no: st.no, name: st.name, start: st.start, done: st.done,
    round: st.round,
    mode: st.round >= 2 ? 'inquiry' : 'daily',
    inquiry: st.round >= 2 ? inqOf_(st.no, st.round) : null,
    stages: INQ_STAGES, bridgeForm: INQ_BRIDGE,
    trophies: Object.keys(counts).filter(function (r) { return Number(r) < 2 && counts[r] >= total; }).length +
      (function () { var rs = {}, n = 0; inqRows_().forEach(function (x) { if (x.no === st.no && x.round >= 2) rs[x.round] = true; });
        Object.keys(rs).forEach(function (r) { if (inqOf_(st.no, Number(r)).complete) n++; }); return n; })(),
    history: history,
    total: total,
    count: my.length,
    logs: my,
    plan: pl,
    todayDone: my.some(function (l) { return l.date === today_(); })
  };
}

function apiMine(no, pin) {
  const st = auth_(no, pin);
  return mine_(st);
}

/* ============ 새 프로젝트 (다음 회차) ============ */

function apiStartNewRound(no, pin, bridge) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    ensureRoundCols_();
    const total = Number(getConfig_()['총일수'] || 21);
    if (st.round < 2) {
      const cnt = logs_().filter(function (l) { return l.no === st.no && l.round === st.round; }).length;
      if (cnt < total) throw new Error('1회차 21일을 먼저 채워야 2회차로 넘어갈 수 있어요. (' + cnt + '/' + total + '일)');
    } else if (!inqOf_(st.no, st.round).complete) {
      throw new Error('지금 회차의 탐구 5단계를 모두 마쳐야 다음 회차로 넘어갈 수 있어요.');
    }
    const b = bridge || {};
    const f = {};
    INQ_BRIDGE.forEach(function (x) { f[x.k] = String(b[x.k] || '').trim().slice(0, 1000); });
    if (f.limit.replace(/\s/g, '').length < 10 || f.question.replace(/\s/g, '').length < 5 || f.topic.replace(/\s/g, '').length < 4)
      throw new Error('한계 · 새 질문 · 주제를 조금 더 자세히 적어 주세요.');
    const next = st.round + 1;
    inqUpsert_(st, next, 0, f, []);
    const sh = stuSheetW_();
    sh.getRange(st.row, 8).setValue(next);
    sh.getRange(st.row, 4, 1, 2).setValues([['', '']]);
    return { ok: true, round: next, mine: mine_(findStudent_(st.no)) };
  } finally {
    lock.releaseLock();
  }
}

/* ============ 인증 제출 ============ */

function apiSubmit(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cfg = getConfig_();
    const total = Number(cfg['총일수'] || 21);
    const backDays = Number(cfg['소급허용일수'] || 1);
    const st = auth_(payload.no, payload.pin);
    if (st.round >= 2) throw new Error('2회차부터는 날짜 제한 없는 탐구 활동이에요. [탐구 노트]에서 단계별로 진행해 주세요.');

    const date = String(payload.date || today_()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 형식이 올바르지 않습니다.');
    const diff = daysBetween_(date, today_());
    if (diff < 0) throw new Error('미래 날짜는 인증할 수 없습니다.');
    if (diff > backDays) throw new Error('지난 인증은 ' + backDays + '일 전까지만 가능합니다. 그 이전 날짜는 담임 선생님께 요청하세요.');

    const my = logs_().filter(function (l) { return l.no === st.no && l.round === st.round; });
    if (my.some(function (l) { return l.date === date; })) {
      throw new Error(date + ' 인증은 이미 완료했습니다. 하루에 한 번만 인증할 수 있어요.');
    }
    if (my.length >= total) throw new Error('이번 회차 ' + total + '일을 모두 채웠습니다. [새 프로젝트 시작하기]로 다음 회차를 시작해 주세요.');

    const text = String(payload.text || '').trim();
    if (!text && !(payload.file && payload.file.data)) {
      throw new Error('기록 내용을 쓰거나 파일을 올려 주세요.');
    }

    // 파일 저장
    let fileName = '', fileUrl = '';
    if (payload.file && payload.file.data) {
      if ((cfg['파일업로드허용'] || '예') !== '예') throw new Error('파일 업로드가 꺼져 있습니다.');
      const maxMB = Number(cfg['최대파일MB'] || 10);
      const bytes = Utilities.base64Decode(payload.file.data);
      if (bytes.length > maxMB * 1024 * 1024) throw new Error('파일이 너무 큽니다. ' + maxMB + 'MB 이하로 올려 주세요.');
      const blob = Utilities.newBlob(bytes, payload.file.mime || 'application/octet-stream', payload.file.name || 'upload');
      const saved = saveFile_(st, date, my.length + 1, blob);
      fileName = saved.name;
      fileUrl = saved.url;
    }

    const day = my.length + 1;
    const id = Utilities.getUuid().slice(0, 8);
    logSheetW_().appendRow([id, new Date(), st.no, st.name, date, day, text, fileName, fileUrl, st.round]);

    // 시작일 / 완료일 기록
    const shSt = stuSheetW_();
    if (!st.start) shSt.getRange(st.row, 4).setValue(date);
    if (day >= total) shSt.getRange(st.row, 5).setValue(date);

    return { ok: true, day: day, total: total, completed: day >= total, mine: mine_(findStudent_(st.no)) };
  } finally {
    lock.releaseLock();
  }
}

function saveFile_(st, date, day, blob) {
  const cfg = getConfig_();
  let rootId = cfg['드라이브폴더ID'];
  let root;
  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; }
  }
  if (!root) {
    root = DriveApp.createFolder('21일프로젝트_인증파일');
    setConfigValue_('드라이브폴더ID', root.getId());
  }
  const subName = ('0' + st.no).slice(-2) + '_' + st.name.replace(/\s/g, '');
  let sub = null;
  const it = root.getFoldersByName(subName);
  sub = it.hasNext() ? it.next() : root.createFolder(subName);

  const ext = (blob.getName() || '').indexOf('.') > -1 ? blob.getName().split('.').pop() : 'dat';
  const base = ('0' + st.no).slice(-2) + '_' + st.name.replace(/\s/g, '') + '_' + ('0' + day).slice(-2) + '일차_' + date;
  blob.setName(base + '.' + ext);
  const f = sub.createFile(blob);
  if ((cfg['파일링크공개'] || '예') === '예') {
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  }
  return { name: f.getName(), url: f.getUrl() };
}

/* ============ 계획서 ============ */

function apiSavePlan(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(payload.no, payload.pin);
    const sh = planSheetW_();
    const cur = plans_()[st.no];
    const vals = [st.no, st.name,
      String(payload.job || ''), String(payload.skill || ''), String(payload.motive || ''),
      String(payload.topic || ''), String(payload.detail || ''),
      cur ? (cur.approved ? '승인' : '') : '',
      Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), st.round];
    if (cur) {
      sh.getRange(cur.row, 1, 1, 10).setValues([vals]);
    } else {
      sh.appendRow(vals);
    }
    return { ok: true, mine: mine_(findStudent_(st.no)) };
  } finally {
    lock.releaseLock();
  }
}

/* ============ 관리자 ============ */

/* ---- 담임 로그인 표: 한 번 비밀번호로 들어오면 다른 탭 · 화면에서도 다시 묻지 않습니다.
 * 표는 마지막으로 쓴 뒤 20분이 지나면 저절로 없어지고, [나가기]를 누르면 바로 없어집니다. */
var ADM_TOK_TTL = 1200;
function admTokOk_(pw) {
  pw = String(pw || '');
  if (!/^at_[0-9a-f]{32}$/.test(pw)) return null;
  var c = CacheService.getScriptCache(), k = 'admtok_' + pw;
  if (!c.get(k)) return false;
  c.put(k, '1', ADM_TOK_TTL);
  return true;
}
function admTokNew_() {
  var t = 'at_' + Utilities.getUuid().replace(/-/g, '').toLowerCase();
  CacheService.getScriptCache().put('admtok_' + t, '1', ADM_TOK_TTL);
  return t;
}
function admTokFor_(pw) { return admTokOk_(pw) === true ? String(pw) : admTokNew_(); }
function apiAdminLogout(tok) {
  if (/^at_[0-9a-f]{32}$/.test(String(tok || ''))) { try { CacheService.getScriptCache().remove('admtok_' + tok); } catch (e) {} }
  return { ok: true };
}

function isAdmin_(pw) {
  var tk = admTokOk_(pw);
  if (tk === true) return true;
  if (tk === false) throw new Error('담임 로그인 시간이 지났어요. 관리자 비밀번호를 다시 넣어 주세요.');
  const real = getConfig_()['관리자비밀번호'];
  if (!real) throw new Error('관리자비밀번호가 설정되지 않았습니다. [설정] 시트를 확인해 주세요.');
  if (String(real).length < 6) throw new Error('관리자 비밀번호가 너무 짧습니다. [설정] 시트에서 6자 이상으로 바꿔 주세요.');
  secCheck_('admin', 'teacher');
  if (!secEqual_(pw, real)) {
    const left = secFail_('admin', 'teacher');
    throw new Error('관리자 비밀번호가 맞지 않습니다. (' + left + '번 더 틀리면 잠깁니다)');
  }
  secOk_('admin', 'teacher');
  return true;
}

function apiAdminLogin(pw, dev, ua) {
  isAdmin_(pw);
  if (dev && admTokOk_(pw) !== true) secAdminDevice_(dev, ua, '학생 화면(선생님 점검)');
  return { ok: true, cfg: secSafeCfg_(getConfig_()), url: webBase_(), admTok: admTokFor_(pw) };
}

function apiAdminData(pw) {
  isAdmin_(pw);
  return {
    students: students_().map(function (s) {
      return { no: s.no, name: s.name, start: s.start, done: s.done, hasPin: !!s.pinHash, pinAt: s.pinAt, memo: s.memo };
    }),
    logs: logs_(),
    plans: plans_(),
    board: board21Data_().list,
    cfg: secSafeCfg_(getConfig_()),
    url: webBase_()
  };
}

function apiAdminDeleteLog(pw, id) {
  isAdmin_(pw);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = logSheetW_();
    const all = logs_();
    for (let i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        const no = all[i].no, round = all[i].round;
        sh.deleteRow(all[i].row);
        renumber_(no, round);
        return { ok: true };
      }
    }
    throw new Error('기록을 찾을 수 없습니다.');
  } finally {
    lock.releaseLock();
  }
}

/** 삭제/추가 후 일차 다시 매기고 완료일 정리 */
function renumber_(no, round) {
  const st = findStudent_(no);
  round = round || st.round;
  const sh = logSheetW_();
  const all = logs_().filter(function (l) { return l.no === Number(no) && l.round === round; });
  all.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  all.forEach(function (l, i) { sh.getRange(l.row, 6).setValue(i + 1); });
  if (round !== st.round) return;
  const total = Number(getConfig_()['총일수'] || 21);
  const shSt = stuSheetW_();
  shSt.getRange(st.row, 4).setValue(all.length ? all[0].date : '');
  shSt.getRange(st.row, 5).setValue(all.length >= total ? all[total - 1].date : '');
}

function apiAdminAddLog(pw, no, date, text) {
  isAdmin_(pw);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = findStudent_(no);
    const my = logs_().filter(function (l) { return l.no === st.no && l.round === st.round; });
    if (my.some(function (l) { return l.date === date; })) throw new Error('그 날짜는 이미 인증되어 있습니다.');
    logSheetW_().appendRow([Utilities.getUuid().slice(0, 8), new Date(), st.no, st.name,
      date, my.length + 1, '[담임 대리 입력] ' + String(text || ''), '', '', st.round]);
    renumber_(st.no, st.round);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function apiAdminResetPin(pw, no) {
  /* 초기화하면 가입부터 다시 해야 합니다 (학번 · 이름 · PIN 6자리 → 승인). 그 전에 받은 로그인 표도 모두 무효. */
  isAdmin_(pw);
  const st = findStudent_(no);
  const sh = stuSheetW_();
  sh.getRange(st.row, 3).setValue('');
  sh.getRange(st.row, 10).setValue('');
  sh.getRange(st.row, STU_COL.APPROVE, 1, 4).setValues([['', '', '', newStamp_()]]);
  secOk_('pin', st.no);
  return { ok: true };
}

function apiAdminApprove(pw, no, approve) {
  isAdmin_(pw);
  const sh = planSheetW_();
  const p = plans_()[Number(no)];
  if (!p) throw new Error('아직 계획서를 제출하지 않은 학생입니다.');
  sh.getRange(p.row, 8).setValue(approve ? '승인' : '');
  return { ok: true };
}

function apiAdminSetConfig(pw, key, value) {
  isAdmin_(pw);
  if (key === 'PIN솔트') throw new Error('PIN솔트는 변경할 수 없습니다. (바꾸면 학생 PIN이 모두 무효가 됩니다)');
  setConfigValue_(key, value);
  return { ok: true, cfg: secSafeCfg_(getConfig_()) };
}

function apiAdminSetRoster(pw, text) {
  isAdmin_(pw);
  const lines = String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lines.length) throw new Error('명단이 비어 있습니다.');
  const sh = stuSheetW_();
  const old = students_();
  const oldMap = {};
  old.forEach(function (s) { oldMap[s.name.replace(/\s/g, '')] = s; });

  const rows = lines.map(function (line, i) {
    /* '1 김민수' · '1. 김민수' · '1,김민수' · '1<탭>김민수' · '김민수' 모두 됩니다 */
    const m = line.match(/^(\d{1,3})\s*[.,)\t ]\s*(.+)$/);
    const no = m ? Number(m[1]) : i + 1;
    const name = (m ? m[2] : line).replace(/[\t,]+/g, ' ').trim();
    const prev = oldMap[name.replace(/\s/g, '')];
    return [no, name, prev ? prev.pinHash : '', prev ? prev.start : '', prev ? prev.done : '', prev ? prev.memo : ''];
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).clearContent();
  sh.getRange(2, 1, rows.length, 6).setValues(rows);
  if (sh.getLastRow() > 1) sh.getRange(2, 8, sh.getLastRow() - 1, 1).clearContent();
  sh.getRange(2, 8, rows.length, 1).setValues(rows.map(function (r) {
    const prev = oldMap[String(r[1]).replace(/\s/g, '')];
    return [prev && prev.round > 1 ? prev.round : ''];
  }));
  return { ok: true, count: rows.length };
}

function apiAdminCsv(pw) {
  isAdmin_(pw);
  const total = Number(getConfig_()['총일수'] || 21);
  const board = board21Data_();
  const pls = plans_();
  const head = ['번호', '이름', '프로젝트 주제', '승인', '시작일', '인증일수', '달성률(%)', '완료여부', '최근인증일'];
  const lines = [head.join(',')];
  board.list.forEach(function (b) {
    const p = pls[b.no];
    lines.push([
      b.no, q_(b.name), q_(p ? p.topic : ''), (p && p.approved) ? '승인' : '',
      b.start, b.count, b.pct, b.completed ? '완료' : '진행중', b.last
    ].join(','));
  });
  lines.push('');
  lines.push(['번호', '이름', '인증날짜', '일차', '기록내용', '파일'].join(','));
  logs_().sort(function (a, b) { return a.no - b.no || (a.date < b.date ? -1 : 1); })
    .forEach(function (l) {
      lines.push([l.no, q_(l.name), l.date, l.day, q_(l.text), q_(l.fileUrl)].join(','));
    });
  return '﻿' + lines.join('\n');
}

/* ---- 엑셀(.xlsx) 내려받기 : 생활기록부 정리용 (담임 전용) ---- */
const DOW_ = ['일', '월', '화', '수', '목', '금', '토'];

function apiAdminXlsx(pw) {
  isAdmin_(pw);
  const total = Number(getConfig_()['총일수'] || 21);
  const board = board21Data_();
  const pls = plans_();
  const lgs = logs_();
  const stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  const fileName = '21일프로젝트_생기부정리_' + stamp + '.xlsx';

  const tmp = SpreadsheetApp.create('__tmp_21day_' + Utilities.getUuid().slice(0, 6));
  const tmpId = tmp.getId();

  try {
    /* 1) 요약 */
    const s1 = tmp.getSheets()[0];
    s1.setName('요약');
    const h1 = ['번호', '이름', '프로젝트 주제', '희망직업(진로)', '핵심역량', '활동 동기', '세부 계획',
      '담임승인', '시작일', '완료일', '인증일수', '달성률(%)', '완료여부', '최근인증일', '현재 회차', '완주 횟수(트로피)'];
    const r1 = [h1];
    board.list.forEach(function (b) {
      const p = pls[b.no] || {};
      r1.push([b.no, b.name, p.topic || '', p.job || '', p.skill || '', p.motive || '', p.detail || '',
        p.approved ? '승인' : '', b.start || '', b.completed ? b.last : '',
        b.count, b.pct, b.completed ? '완료' : '진행중', b.last || '', b.round, b.trophies]);
    });
    s1.getRange(1, 1, r1.length, h1.length).setValues(r1);

    /* 2) 전체 인증기록 */
    const s2 = tmp.insertSheet('인증기록(전체)');
    const h2 = ['번호', '이름', '회차', '인증날짜', '요일', '일차', '기록 내용', '파일명', '파일 링크', '제출시각'];
    const r2 = [h2];
    lgs.slice().sort(function (a, b) { return a.no - b.no || a.round - b.round || (a.date < b.date ? -1 : 1); })
      .forEach(function (l) {
        r2.push([l.no, l.name, l.round, l.date, DOW_[parseYmd_(l.date).getDay()], l.day,
          l.text, l.fileName, l.fileUrl, l.at]);
      });
    s2.getRange(1, 1, r2.length, h2.length).setValues(r2);

    /* 3) 학생별 기록 모음 (생기부 문장 만들 때 바로 쓰기 좋게 한 칸에 합침) */
    const s3 = tmp.insertSheet('학생별 기록모음');
    const h3 = ['번호', '이름', '프로젝트 주제', '인증일수', '완료여부', '활동 동기', '전체 기록(날짜순)'];
    const r3 = [h3];
    board.list.forEach(function (b) {
      const p = pls[b.no] || {};
      const my = lgs.filter(function (l) { return l.no === b.no; })
        .sort(function (a, c) { return a.round - c.round || (a.date < c.date ? -1 : 1); });
      const joined = my.map(function (l) {
        return (l.round > 1 ? l.round + '회차 ' : '') + l.day + '일차(' + l.date.slice(5) + ') ' + (l.text || '(파일 인증)');
      }).join(' / ');
      r3.push([b.no, b.name, p.topic || '', b.count + '/' + total,
        (b.completed ? '완료' : '진행중') + (b.trophies ? ' · 🏆' + b.trophies : ''), p.motive || '', joined]);
    });
    s3.getRange(1, 1, r3.length, h3.length).setValues(r3);

    /* 서식 */
    [[s1, h1.length], [s2, h2.length], [s3, h3.length]].forEach(function (x) {
      const sh = x[0], n = x[1];
      sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#EEF2F7');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, sh.getMaxRows(), n).setVerticalAlignment('top').setWrap(true);
      for (let c = 1; c <= n; c++) sh.autoResizeColumn(c);
      for (let c = 1; c <= n; c++) {
        if (sh.getColumnWidth(c) > 420) sh.setColumnWidth(c, 420);
        if (sh.getColumnWidth(c) < 60) sh.setColumnWidth(c, 60);
      }
    });
    SpreadsheetApp.flush();

    /* xlsx로 내보내기 */
    const res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmpId + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) throw new Error('엑셀 변환에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    return { name: fileName, data: Utilities.base64Encode(res.getBlob().getBytes()) };
  } finally {
    try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (e) {}
  }
}

function q_(s) {
  s = String(s == null ? '' : s).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return '"' + s + '"';
}

/*═══════════════════════════════════════════════════════
 *  ②  학교·사회 문제 해결 프로젝트
 *    발견하기 → 조사하기 → 제안하기 → 조정하기 → 확인하기
 *═══════════════════════════════════════════════════════*/

/* ---- 읽기 ---- */

/** 기존 설치본에는 신청자/모집상태 칸이 없을 수 있으므로 없으면 만들어 줌 (데이터는 건드리지 않음) */
function pblEnsureTeamCols_() {
  const sh = sheet_(SHEETS.PBL_TEAM);
  if (sh.getLastColumn() < 14) {
    sh.getRange(1, 12, 1, 3).setValues([['신청자번호', '신청자이름', '모집마감']]);
  }
}

function pblTeams_() {
  pblEnsureTeamCols_();
  const sh = sheet_(SHEETS.PBL_TEAM);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 14).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    out.push({
      row: i + 2,
      id: String(rows[i][0]),
      name: String(rows[i][1] || ''),
      type: String(rows[i][2] || '모둠'),
      memberNos: String(rows[i][3] || '').split(',')
        .map(function (x) { return Number(String(x).trim()); })
        .filter(function (x) { return x > 0; }),
      memberNames: String(rows[i][4] || ''),
      topic: String(rows[i][5] || ''),
      done: Number(rows[i][6] || 0),
      comment: String(rows[i][7] || ''),
      confirmed: String(rows[i][8] || '') === '확인',
      created: rows[i][9] instanceof Date ? Utilities.formatDate(rows[i][9], tz_(), 'yyyy-MM-dd') : String(rows[i][9] || ''),
      updated: rows[i][10] instanceof Date ? Utilities.formatDate(rows[i][10], tz_(), 'yyyy-MM-dd HH:mm') : String(rows[i][10] || ''),
      pendingNos: String(rows[i][11] || '').split(',')
        .map(function (x) { return Number(String(x).trim()); })
        .filter(function (x) { return x > 0; }),
      pendingNames: String(rows[i][12] || ''),
      recruitClosed: String(rows[i][13] || '') === '마감'
    });
  }
  return out;
}

function pblFindTeam_(id) {
  const all = pblTeams_();
  for (let i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  throw new Error('모둠을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
}

function pblTeamOf_(no) {
  const all = pblTeams_();
  for (let i = 0; i < all.length; i++) {
    if (all[i].memberNos.indexOf(Number(no)) > -1) return all[i];
  }
  return null;
}

/** 그 모둠의 조장인지 (첫 번째로 등록된 사람 = 모둠을 만든 사람) */
function pblIsLeader_(team, no) {
  return team.memberNos.length > 0 && team.memberNos[0] === Number(no);
}

/** 이 번호가 신청(대기) 중인 모둠 찾기 */
function pblPendingTeamOf_(no) {
  const all = pblTeams_();
  for (let i = 0; i < all.length; i++) {
    if (all[i].pendingNos.indexOf(Number(no)) > -1) return all[i];
  }
  return null;
}

/** 한 사람은 신청도 한 곳만 — 다른 모둠에 걸려 있던 신청은 정리 */
function pblClearPendingElsewhere_(no, exceptTeamId) {
  const all = pblTeams_();
  all.forEach(function (t) {
    if (t.id === exceptTeamId) return;
    if (t.pendingNos.indexOf(Number(no)) > -1) {
      t.pendingNos = t.pendingNos.filter(function (n) { return n !== Number(no); });
      pblSyncTeamRow_(t);
    }
  });
}

function pblWorks_() {
  const sh = sheet_(SHEETS.PBL_WORK);
  const last = sh.getLastRow();
  const map = {};
  if (last < 2) return map;
  const rows = sh.getRange(2, 1, last - 1, 19).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const o = { row: i + 2, id: String(rows[i][0]), name: String(rows[i][1] || '') };
    PBL_WORK_COLS.forEach(function (k, j) { o[k] = String(rows[i][2 + j] || ''); });
    o.updated = rows[i][18] instanceof Date
      ? Utilities.formatDate(rows[i][18], tz_(), 'yyyy-MM-dd HH:mm') : String(rows[i][18] || '');
    map[o.id] = o;
  }
  return map;
}

function pblEvals_() {
  const sh = sheet_(SHEETS.PBL_EVAL);
  const last = sh.getLastRow();
  const map = {};
  if (last < 2) return map;
  const rows = sh.getRange(2, 1, last - 1, 10).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    map[Number(rows[i][0])] = {
      row: i + 2,
      no: Number(rows[i][0]),
      name: String(rows[i][1] || ''),
      teamId: String(rows[i][2] || ''),
      teamName: String(rows[i][3] || ''),
      scores: [4, 5, 6, 7, 8].map(function (c) { return Number(rows[i][c] || 0); }),
      avg: Number(rows[i][9] || 0)
    };
  }
  return map;
}

function pblFiles_() {
  const sh = sheet_(SHEETS.PBL_FILE);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 8).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    out.push({
      row: i + 2,
      id: String(rows[i][0]),
      teamId: String(rows[i][1]),
      teamName: String(rows[i][2] || ''),
      step: Number(rows[i][3] || 0),
      by: String(rows[i][4] || ''),
      fileName: String(rows[i][5] || ''),
      fileUrl: String(rows[i][6] || ''),
      at: rows[i][7] instanceof Date ? Utilities.formatDate(rows[i][7], tz_(), 'yyyy-MM-dd HH:mm') : String(rows[i][7] || '')
    });
  }
  return out;
}

/* ---- 단계 완료 계산 ---- */

function pblStepFilled_(work, stepNo) {
  if (!work) return false;
  const def = PBL_STEPS[stepNo - 1];
  for (let i = 0; i < def.fields.length; i++) {
    if (!String(work[def.fields[i]] || '').trim()) return false;
  }
  return true;
}

/** 1단계부터 연속으로 채워진 마지막 단계 번호 */
function pblDoneLevel_(work) {
  let n = 0;
  for (let s = 1; s <= 5; s++) {
    if (pblStepFilled_(work, s)) n = s; else break;
  }
  return n;
}

/* ---- 현황판 ---- */

function apiPblBoard(no, pin) { gateAuth_(no, pin); return pblBoardCached_(); }
function pblBoardCached_() {
  var ch = CacheService.getScriptCache();
  try { var c = ch.get('bpv2'); if (c) return JSON.parse(c); } catch (e) {}
  var d = pblBoardData_();
  try { var str = JSON.stringify(d); if (str.length < 90000) ch.put('bpv2', str, 15); } catch (e) {}
  return d;
}
/* 화면을 열 때 서버를 한 번만 부르도록: 현황 + 내 정보를 같이 보냅니다 */
function apiHome21(no, pin) {
  const st = auth_(no, pin);
  return { ok: true, no: st.no, name: st.name, mine: mine_(st), board: board21Cached_() };
}
function apiHomePbl(no, pin) {
  const st = auth_(no, pin);
  return { mine: pblMine_(st), board: pblBoardCached_() };
}
/* 담임 선생님 점검용: 학생이 보는 화면을 읽기 전용으로 봅니다 (아무것도 바꾸지 않음) */
function apiAdminStudents(pw) {
  isAdmin_(pw);
  return students_().map(function (s) { return { no: s.no, name: s.name, sid: sidOf_(s.no), round: s.round, status: stuStatus_(s) }; });
}
function apiAdminMine(pw, no) {
  isAdmin_(pw);
  const st = findStudent_(no);
  return { ok: true, no: st.no, name: st.name, mine: mine_(st) };
}
function apiAdminPblMine(pw, no) {
  isAdmin_(pw);
  return pblMine_(findStudent_(no));
}
function pblBoardData_() {
  const teams = pblTeams_();
  const works = pblWorks_();
  const evals = pblEvals_();
  const evalByTeam = {};
  Object.keys(evals).forEach(function (k) {
    const e = evals[k];
    if (!e.teamId) return;
    evalByTeam[e.teamId] = (evalByTeam[e.teamId] || 0) + 1;
  });

  const list = teams.map(function (t) {
    const w = works[t.id];
    const done = pblDoneLevel_(w);
    return {
      id: t.id, name: t.name, type: t.type,
      members: t.memberNames, memberNos: t.memberNos, size: t.memberNos.length,
      topic: w ? String(w.s1a || '') : '',
      done: done, pct: Math.round(done / 5 * 100),
      completed: done >= 5,
      confirmed: t.confirmed,
      hasComment: !!t.comment,
      evalCount: evalByTeam[t.id] || 0,
      updated: t.updated, created: t.created
    };
  });

  list.sort(function (a, b) {
    if (a.type !== b.type) return a.type === '모둠' ? -1 : 1;
    return (a.memberNos[0] || 999) - (b.memberNos[0] || 999);
  });

  const joined = {};
  teams.forEach(function (t) { t.memberNos.forEach(function (n) { joined[n] = true; }); });
  const notJoined = students_().filter(function (s) { return !joined[s.no]; })
    .map(function (s) { return { no: s.no, name: s.name }; });

  return {
    list: list,
    notJoined: notJoined,
    stat: {
      teams: list.length,
      groups: list.filter(function (x) { return x.type === '모둠'; }).length,
      solo: list.filter(function (x) { return x.type === '개인'; }).length,
      completed: list.filter(function (x) { return x.completed; }).length,
      joined: Object.keys(joined).length,
      totalStudents: students_().length
    }
  };
}

/* ---- 학생 화면 ---- */

function pblMine_(st) {
  const team = pblTeamOf_(st.no);
  const evals = pblEvals_();
  const myEval = evals[st.no] || null;

  if (!team) {
    // 아직 팀이 없으면 신청할 수 있는(모집 중인) 모둠 목록을 내려보냄
    const cfg = getConfig_();
    const max = Number(cfg['문제해결_모둠최대인원'] || 6);
    const myPending = pblPendingTeamOf_(st.no);
    const open = pblTeams_().filter(function (t) {
      return t.type === '모둠';
    }).map(function (t) {
      return {
        id: t.id, name: t.name, members: t.memberNames, size: t.memberNos.length,
        topic: t.topic, pendingCount: t.pendingNos.length,
        closed: t.recruitClosed, full: t.memberNos.length >= max,
        applied: t.pendingNos.indexOf(st.no) > -1
      };
    });
    return {
      no: st.no, name: st.name, team: null, openTeams: open, maxMembers: max,
      myPending: myPending ? { id: myPending.id, name: myPending.name } : null
    };
  }

  const works = pblWorks_();
  const w = works[team.id] || {};
  const work = {};
  PBL_WORK_COLS.forEach(function (k) { work[k] = String(w[k] || ''); });
  const done = pblDoneLevel_(w);
  const files = pblFiles_().filter(function (f) { return f.teamId === team.id; });
  const pending = team.pendingNos.map(function (n) {
    try { return { no: n, name: findStudent_(n).name }; } catch (e) { return { no: n, name: String(n) }; }
  });

  return {
    no: st.no, name: st.name,
    team: {
      id: team.id, name: team.name, type: team.type,
      members: team.memberNames, memberNos: team.memberNos,
      comment: team.comment, confirmed: team.confirmed,
      created: team.created, updated: team.updated,
      recruitClosed: team.recruitClosed,
      pending: pending
    },
    isLeader: pblIsLeader_(team, st.no),
    maxMembers: Number(getConfig_()['문제해결_모둠최대인원'] || 6),
    work: work,
    done: done,
    canEditUpTo: Math.min(done + 1, 5),
    files: files,
    myEval: myEval ? myEval.scores : null,
    evalOpen: done >= 5
  };
}

function apiPblMine(no, pin) {
  const st = auth_(no, pin);
  return pblMine_(st);
}

/* ---- 팀 만들기 / 합류 / 나가기 ---- */

function pblSyncTeamRow_(team) {
  const sh = sheet_(SHEETS.PBL_TEAM);
  const names = team.memberNos.map(function (n) {
    try { return n + '.' + findStudent_(n).name; } catch (e) { return String(n); }
  }).join(', ');
  const pendingNames = (team.pendingNos || []).map(function (n) {
    try { return n + '.' + findStudent_(n).name; } catch (e) { return String(n); }
  }).join(', ');
  sh.getRange(team.row, 4).setValue(team.memberNos.join(','));
  sh.getRange(team.row, 5).setValue(names);
  sh.getRange(team.row, 11).setValue(new Date());
  sh.getRange(team.row, 12).setValue((team.pendingNos || []).join(','));
  sh.getRange(team.row, 13).setValue(pendingNames);
  sh.getRange(team.row, 14).setValue(team.recruitClosed ? '마감' : '');
  return names;
}

function apiPblCreateTeam(no, pin, type, teamName, topic) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    if (pblTeamOf_(st.no)) throw new Error('이미 참여 중인 모둠이 있습니다. 먼저 나가기를 해 주세요.');

    type = (String(type) === '개인') ? '개인' : '모둠';
    let name = String(teamName || '').trim();
    topic = String(topic || '').trim();
    if (type === '개인') {
      name = st.no + '번 ' + st.name;
    } else {
      if (!name) throw new Error('모둠 이름(팀명)을 적어 주세요.');
      if (name.length > 20) throw new Error('모둠 이름은 20자 이내로 적어 주세요.');
      if (!topic) throw new Error('먼저 우리 모둠이 다룰 문제를 한 줄로 적어 주세요. 조원들이 이 내용을 보고 신청합니다.');
      if (topic.length > 120) throw new Error('문제 주제는 120자 이내로 적어 주세요.');
      const dup = pblTeams_().some(function (t) {
        return t.name.replace(/\s/g, '') === name.replace(/\s/g, '');
      });
      if (dup) throw new Error('같은 이름의 모둠이 이미 있습니다. 다른 이름으로 정해 주세요.');
    }

    const id = 'T' + Utilities.getUuid().slice(0, 6).toUpperCase();
    sheet_(SHEETS.PBL_TEAM).appendRow([id, name, type, String(st.no),
      st.no + '.' + st.name, type === '모둠' ? topic : '', 0, '', '', new Date(), new Date(),
      '', '', '']);
    sheet_(SHEETS.PBL_WORK).appendRow([id, name, type === '모둠' ? topic : ''].concat(
      PBL_WORK_COLS.slice(1).map(function () { return ''; })).concat([new Date()]));

    pblClearPendingElsewhere_(st.no, id);

    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

/** 조원이 모둠에 신청하기 (바로 가입되지 않고, 조장 승인을 기다립니다) */
function apiPblApply(no, pin, teamId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    if (pblTeamOf_(st.no)) throw new Error('이미 참여 중인 모둠이 있습니다. 먼저 나가기를 해 주세요.');
    const team = pblFindTeam_(teamId);
    if (team.type === '개인') throw new Error('개인 활동에는 신청할 수 없습니다.');
    if (team.recruitClosed) throw new Error('이 모둠은 지금 신청을 받지 않고 있습니다.');
    const max = Number(getConfig_()['문제해결_모둠최대인원'] || 6);
    if (team.memberNos.length >= max) throw new Error('이 모둠은 정원(' + max + '명)이 가득 찼습니다.');

    if (team.pendingNos.indexOf(st.no) === -1) {
      team.pendingNos.push(st.no);
      pblClearPendingElsewhere_(st.no, team.id);
      pblSyncTeamRow_(team);
    }
    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

/** 신청 취소 (조원이 직접) */
function apiPblCancelApply(no, pin, teamId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    const team = pblFindTeam_(teamId);
    team.pendingNos = team.pendingNos.filter(function (n) { return n !== st.no; });
    pblSyncTeamRow_(team);
    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

/** 조장이 신청을 수락 → 정식 팀원이 됨 */
function apiPblApprove(no, pin, teamId, applicantNo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    const team = pblFindTeam_(teamId);
    if (!pblIsLeader_(team, st.no)) throw new Error('조장만 신청을 수락할 수 있습니다.');
    applicantNo = Number(applicantNo);
    if (team.pendingNos.indexOf(applicantNo) === -1) {
      throw new Error('신청 목록에 없는 학생입니다. 새로고침 후 다시 시도해 주세요.');
    }
    team.pendingNos = team.pendingNos.filter(function (n) { return n !== applicantNo; });

    const already = pblTeamOf_(applicantNo);
    if (already) {
      pblSyncTeamRow_(team);
      throw new Error(findStudent_(applicantNo).name + ' 학생은 이미 다른 모둠에 들어가 있어서 받을 수 없습니다.');
    }
    const max = Number(getConfig_()['문제해결_모둠최대인원'] || 6);
    if (team.memberNos.length >= max) {
      pblSyncTeamRow_(team);
      throw new Error('이 모둠은 정원(' + max + '명)이 가득 찼습니다.');
    }

    team.memberNos.push(applicantNo);
    pblClearPendingElsewhere_(applicantNo, team.id);
    pblSyncTeamRow_(team);
    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

/** 조장이 신청을 거절 */
function apiPblReject(no, pin, teamId, applicantNo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    const team = pblFindTeam_(teamId);
    if (!pblIsLeader_(team, st.no)) throw new Error('조장만 신청을 거절할 수 있습니다.');
    applicantNo = Number(applicantNo);
    team.pendingNos = team.pendingNos.filter(function (n) { return n !== applicantNo; });
    pblSyncTeamRow_(team);
    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

/** 조장이 모집 마감 / 다시 열기 */
function apiPblSetRecruit(no, pin, teamId, closed) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    const team = pblFindTeam_(teamId);
    if (!pblIsLeader_(team, st.no)) throw new Error('조장만 모집 상태를 바꿀 수 있습니다.');
    team.recruitClosed = !!closed;
    pblSyncTeamRow_(team);
    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

function apiPblLeaveTeam(no, pin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    const team = pblTeamOf_(st.no);
    if (!team) throw new Error('참여 중인 모둠이 없습니다.');

    team.memberNos = team.memberNos.filter(function (n) { return n !== st.no; });
    if (team.memberNos.length === 0) {
      pblDeleteTeamById_(team.id);
    } else {
      pblSyncTeamRow_(team);
    }
    // 자기평가도 함께 정리
    const ev = pblEvals_()[st.no];
    if (ev) sheet_(SHEETS.PBL_EVAL).deleteRow(ev.row);

    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

function pblDeleteTeamById_(teamId) {
  const t = pblFindTeam_(teamId);
  sheet_(SHEETS.PBL_TEAM).deleteRow(t.row);
  const w = pblWorks_()[teamId];
  if (w) sheet_(SHEETS.PBL_WORK).deleteRow(w.row);
  const evs = pblEvals_();
  Object.keys(evs).map(function (k) { return evs[k]; })
    .filter(function (e) { return e.teamId === teamId; })
    .sort(function (a, b) { return b.row - a.row; })
    .forEach(function (e) { sheet_(SHEETS.PBL_EVAL).deleteRow(e.row); });
  pblFiles_().filter(function (f) { return f.teamId === teamId; })
    .sort(function (a, b) { return b.row - a.row; })
    .forEach(function (f) { sheet_(SHEETS.PBL_FILE).deleteRow(f.row); });
}

/* ---- 단계 저장 ---- */

function apiPblSaveStep(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const st = auth_(payload.no, payload.pin);
    const team = pblTeamOf_(st.no);
    if (!team) throw new Error('먼저 모둠을 만들거나 합류해 주세요.');
    if (team.confirmed) throw new Error('담임 선생님이 최종 확인한 활동지는 수정할 수 없습니다.');

    const step = Number(payload.step);
    if (!(step >= 1 && step <= 5)) throw new Error('단계 번호가 올바르지 않습니다.');

    const works = pblWorks_();
    const w = works[team.id];
    if (!w) throw new Error('활동지를 찾을 수 없습니다.');
    const done = pblDoneLevel_(w);
    if (step > done + 1) {
      throw new Error('STEP ' + done + '까지 먼저 완성해 주세요. 단계는 순서대로 진행됩니다.');
    }

    // 저장
    const def = PBL_STEPS[step - 1];
    const sh = sheet_(SHEETS.PBL_WORK);
    def.fields.forEach(function (f) {
      const idx = PBL_WORK_COLS.indexOf(f);
      const v = String((payload.fields || {})[f] || '').trim();
      sh.getRange(w.row, 3 + idx).setValue(v);
      w[f] = v;
    });
    sh.getRange(w.row, 19).setValue(new Date());

    // 파일
    let fileInfo = null;
    if (payload.file && payload.file.data) {
      const cfg = getConfig_();
      if ((cfg['파일업로드허용'] || '예') !== '예') throw new Error('파일 업로드가 꺼져 있습니다.');
      const maxMB = Number(cfg['최대파일MB'] || 10);
      const bytes = Utilities.base64Decode(payload.file.data);
      if (bytes.length > maxMB * 1024 * 1024) throw new Error('파일이 너무 큽니다. ' + maxMB + 'MB 이하로 올려 주세요.');
      const blob = Utilities.newBlob(bytes, payload.file.mime || 'application/octet-stream',
        payload.file.name || 'upload');
      const saved = pblSaveFile_(team, step, st, blob);
      sheet_(SHEETS.PBL_FILE).appendRow([Utilities.getUuid().slice(0, 8), team.id, team.name,
        step, st.no + '.' + st.name, saved.name, saved.url, new Date()]);
      fileInfo = saved;
    }

    // 팀 시트 요약 갱신
    const newDone = pblDoneLevel_(w);
    const shT = sheet_(SHEETS.PBL_TEAM);
    shT.getRange(team.row, 6).setValue(String(w.s1a || ''));
    shT.getRange(team.row, 7).setValue(newDone);
    shT.getRange(team.row, 11).setValue(new Date());

    return {
      ok: true,
      stepDone: pblStepFilled_(w, step),
      done: newDone,
      justCompleted: newDone >= 5 && done < 5,
      file: fileInfo,
      mine: pblMine_(st)
    };
  } finally {
    lock.releaseLock();
  }
}

function pblSaveFile_(team, step, st, blob) {
  const cfg = getConfig_();
  let rootId = cfg['드라이브폴더ID'];
  let root = null;
  if (rootId) { try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder('21일프로젝트_인증파일');
    setConfigValue_('드라이브폴더ID', root.getId());
  }
  let pblRoot;
  const it0 = root.getFoldersByName('문제해결프로젝트');
  pblRoot = it0.hasNext() ? it0.next() : root.createFolder('문제해결프로젝트');

  const subName = team.name.replace(/[\\/:*?"<>|]/g, '_');
  const it = pblRoot.getFoldersByName(subName);
  const sub = it.hasNext() ? it.next() : pblRoot.createFolder(subName);

  const orig = blob.getName() || 'file';
  const ext = orig.indexOf('.') > -1 ? orig.split('.').pop() : 'dat';
  blob.setName(subName + '_STEP' + step + '_' + st.name.replace(/\s/g, '') + '_' + today_() + '.' + ext);
  const f = sub.createFile(blob);
  if ((cfg['파일링크공개'] || '예') === '예') {
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  }
  return { name: f.getName(), url: f.getUrl() };
}

/* ---- 자기평가 ---- */

function apiPblSaveEval(no, pin, scores) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const st = auth_(no, pin);
    const team = pblTeamOf_(st.no);
    if (!team) throw new Error('먼저 모둠을 만들거나 합류해 주세요.');

    const w = pblWorks_()[team.id];
    if (pblDoneLevel_(w) < 5) throw new Error('STEP 5까지 모두 완성한 뒤에 자기평가를 할 수 있습니다.');

    const s = (scores || []).map(function (x) { return Number(x); });
    if (s.length !== 5 || s.some(function (x) { return !(x >= 1 && x <= 5); })) {
      throw new Error('5개 항목을 모두 1~5점으로 선택해 주세요.');
    }
    const avg = Math.round(s.reduce(function (a, b) { return a + b; }, 0) / 5 * 10) / 10;
    const vals = [st.no, st.name, team.id, team.name].concat(s).concat([avg]);

    const cur = pblEvals_()[st.no];
    if (cur) sheet_(SHEETS.PBL_EVAL).getRange(cur.row, 1, 1, 10).setValues([vals]);
    else sheet_(SHEETS.PBL_EVAL).appendRow(vals);

    return { ok: true, mine: pblMine_(st) };
  } finally {
    lock.releaseLock();
  }
}

/* ---- 담임 ---- */

function apiPblAdminData(pw) {
  isAdmin_(pw);
  const teams = pblTeams_();
  const works = pblWorks_();
  const evals = pblEvals_();
  return {
    teams: teams.map(function (t) {
      const w = works[t.id] || {};
      return {
        id: t.id, name: t.name, type: t.type, members: t.memberNames, memberNos: t.memberNos,
        topic: String(w.s1a || ''), done: pblDoneLevel_(w),
        comment: t.comment, confirmed: t.confirmed, created: t.created, updated: t.updated,
        recruitClosed: t.recruitClosed, pendingCount: t.pendingNos.length, pendingNames: t.pendingNames,
        work: (function () { const o = {}; PBL_WORK_COLS.forEach(function (k) { o[k] = String(w[k] || ''); }); return o; })()
      };
    }),
    evals: Object.keys(evals).map(function (k) { return evals[k]; })
      .sort(function (a, b) { return a.no - b.no; }),
    files: pblFiles_(),
    board: pblBoardData_(),
    cfg: secSafeCfg_(getConfig_()),
    steps: PBL_STEPS,
    evalItems: PBL_EVAL_ITEMS
  };
}

function apiPblAdminComment(pw, teamId, text, confirmed) {
  isAdmin_(pw);
  const t = pblFindTeam_(teamId);
  const sh = sheet_(SHEETS.PBL_TEAM);
  sh.getRange(t.row, 8).setValue(String(text || ''));
  sh.getRange(t.row, 9).setValue(confirmed ? '확인' : '');
  sh.getRange(t.row, 11).setValue(new Date());
  return { ok: true };
}

function apiPblAdminDeleteTeam(pw, teamId) {
  isAdmin_(pw);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    pblDeleteTeamById_(teamId);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---- 문제해결 엑셀 내보내기 ---- */

function apiPblXlsx(pw) {
  isAdmin_(pw);
  const teams = pblTeams_();
  const works = pblWorks_();
  const evals = pblEvals_();
  const stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  const fileName = '문제해결프로젝트_생기부정리_' + stamp + '.xlsx';

  const tmp = SpreadsheetApp.create('__tmp_pbl_' + Utilities.getUuid().slice(0, 6));
  const tmpId = tmp.getId();

  try {
    /* 1) 모둠 요약 */
    const s1 = tmp.getSheets()[0];
    s1.setName('모둠 요약');
    const h1 = ['팀ID', '팀명', '유형', '구성원', '문제 주제', '완료단계', '최종확인',
      '선생님 코멘트', '시작일', '최종수정'];
    const r1 = [h1];
    teams.forEach(function (t) {
      const w = works[t.id] || {};
      r1.push([t.id, t.name, t.type, t.memberNames, String(w.s1a || ''),
        pblDoneLevel_(w) + '/5', t.confirmed ? '확인' : '', t.comment, t.created, t.updated]);
    });
    s1.getRange(1, 1, r1.length, h1.length).setValues(r1);

    /* 2) 활동지 전문 */
    const s2 = tmp.insertSheet('활동지 전문');
    const h2 = ['팀명', '구성원',
      '1-① 발견한 문제', '1-② 알게 된 경위', '1-③ 어려움을 겪는 사람·중요한 이유',
      '2-① 조사 방법', '2-② 알게 된 점',
      '3-① 해결 방안', '3-② 전달 대상·방법', '3-③ 더 준비할 점',
      '4-① 제안에 대한 반응', '4-② 다른 의견과 그 이유', '4-③ 최종 합의 내용', '4-④ 조정에서 배운 점',
      '5-① 실제로 달라진 점', '5-② 잘한 점', '5-③ 아쉬운 점', '5-④ 배운 점 활용 계획'];
    const r2 = [h2];
    teams.forEach(function (t) {
      const w = works[t.id] || {};
      r2.push([t.name, t.memberNames].concat(PBL_WORK_COLS.map(function (k) { return String(w[k] || ''); })));
    });
    s2.getRange(1, 1, r2.length, h2.length).setValues(r2);

    /* 3) 자기평가 */
    const s3 = tmp.insertSheet('자기평가');
    const h3 = ['번호', '이름', '팀명'].concat(
      PBL_EVAL_ITEMS.map(function (t, i) { return '★' + (i + 1) + ' ' + t; })).concat(['평균']);
    const r3 = [h3];
    students_().forEach(function (st) {
      const e = evals[st.no];
      if (!e) { r3.push([st.no, st.name, '', '', '', '', '', '', '']); return; }
      r3.push([e.no, e.name, e.teamName].concat(e.scores).concat([e.avg]));
    });
    s3.getRange(1, 1, r3.length, h3.length).setValues(r3);

    /* 4) 학생별 정리 (생기부용) */
    const s4 = tmp.insertSheet('학생별 정리');
    const h4 = ['번호', '이름', '팀명', '유형', '문제 주제', '완료단계', '자기평가 평균',
      '활동 전체 내용(단계순)', '선생님 코멘트'];
    const r4 = [h4];
    students_().forEach(function (st) {
      const t = pblTeamOf_(st.no);
      if (!t) { r4.push([st.no, st.name, '(미참여)', '', '', '', '', '', '']); return; }
      const w = works[t.id] || {};
      const e = evals[st.no];
      const joined = PBL_STEPS.map(function (def) {
        const body = def.fields.map(function (f) { return String(w[f] || ''); })
          .filter(Boolean).join(' ');
        return body ? ('[STEP' + def.n + ' ' + def.title + '] ' + body) : '';
      }).filter(Boolean).join(' / ');
      r4.push([st.no, st.name, t.name, t.type, String(w.s1a || ''),
        pblDoneLevel_(w) + '/5', e ? e.avg : '', joined, t.comment]);
    });
    s4.getRange(1, 1, r4.length, h4.length).setValues(r4);

    /* 서식 */
    [[s1, h1.length], [s2, h2.length], [s3, h3.length], [s4, h4.length]].forEach(function (x) {
      const sh = x[0], n = x[1];
      sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#EEF2F7');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, sh.getMaxRows(), n).setVerticalAlignment('top').setWrap(true);
      for (let c = 1; c <= n; c++) sh.autoResizeColumn(c);
      for (let c = 1; c <= n; c++) {
        if (sh.getColumnWidth(c) > 420) sh.setColumnWidth(c, 420);
        if (sh.getColumnWidth(c) < 60) sh.setColumnWidth(c, 60);
      }
    });
    SpreadsheetApp.flush();

    const res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + tmpId + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) throw new Error('엑셀 변환에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    return { name: fileName, data: Utilities.base64Encode(res.getBlob().getBytes()) };
  } finally {
    try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (e) {}
  }
}

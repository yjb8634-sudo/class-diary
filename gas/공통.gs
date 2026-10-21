/*******************************************************
 * 강릉제일고 1-2 학급 운영 통합 웹앱 — 공통 (진입점 · 메뉴 · 설치 · 연동)
 *
 *  한 주소로 세 화면을 엽니다.
 *   · (기본)          학생 활동 선택 → 21일 프로젝트 / 문제 해결 / 상담 신청
 *   · ?p=counsel      상담 신청판
 *   · ?p=teacher      담임 기록실 (관찰 기록 · 학생별 누가기록 · 생기부 초안)
 *   · ?p=board&t=키    교실 화면 (전자칠판 · 스마트 TV)
 *   · ?key=조회키      상담 오늘 일정 JSON (카톡 알림용, 기존과 동일)
 *   · POST            다른 수업 프로그램에서 기록을 보내는 입구 (연동키 필요)
 *
 *  파일 구성: 공통.gs / 자율.gs / 상담.gs / 담임.gs
 *            Index.html(자율) / 상담.html / 담임.html
 *******************************************************/

var FILEVER_공통 = '2026-11-03b';
var RELEASE = '2026-10-27a';

/* ---------- 파일 버전 한눈에 보기 ----------
 * 파일마다 버전을 적어 두고, 이번 묶음(RELEASE)에 맞는지 표로 보여 줍니다.
 *  - 스프레드시트 메뉴에서 보면: 편집기에 '저장된' 파일 기준
 *  - 담임 기록실에서 보면: 실제로 '배포된' 파일 기준 (새 버전 배포를 했는지 확인)
 * 새 파일이 생기거나 버전이 바뀌면 이 표만 고치면 됩니다. */
var FILE_EXPECT = [
  ['code.gs (21일 · 문제해결)', 'gs', 'FILEVER_자율', '2026-11-03a'],
  ['공통.gs', 'gs', 'FILEVER_공통', '2026-11-03b'],
  ['담임.gs', 'gs', 'FILEVER_담임', '2026-11-03a'],
  ['상담.gs', 'gs', 'FILEVER_상담', '2026-11-01a'],
  ['교실.gs', 'gs', 'FILEVER_교실', '2026-11-02a'],
  ['알림장.gs (새 파일)', 'gs', 'FILEVER_알림장', '2026-11-03a'],
  ['앱.gs', 'gs', 'FILEVER_앱', '2026-10-24a'],
  ['활동.gs (새 파일)', 'gs', 'FILEVER_활동', '2026-10-24a'],
  ['보안.gs', 'gs', 'FILEVER_보안', '2026-10-30a'],
  ['연결.gs (새 파일 · 학생 앱 연결 통로)', 'gs', 'FILEVER_연결', '2026-11-03a'],
  ['Index.html', 'html', 'Index', '2026-11-01a'],
  ['프로젝트21.html (새 파일 · 21일 화면)', 'html', '프로젝트21', '2026-11-01a'],
  ['문제해결.html (새 파일 · 문제 해결 화면)', 'html', '문제해결', '2026-11-01a'],
  ['담임화면.html', 'html', '담임화면', '2026-11-02a'],
  ['상담화면.html', 'html', '상담화면', '2026-11-01a'],
  ['교실화면.html', 'html', '교실화면', '2026-11-02a'],
  ['활동화면.html (새 파일)', 'html', '활동화면', '2026-10-25a'],
  ['게이트.html (새 파일 · 공용 로그인 창)', 'html', '게이트', '2026-11-01a'],
  ['테마.html (새 파일 · 공용 디자인)', 'html', '테마', '2026-10-26b'],
  ['설치화면.html (교실 화면 단독판 설치 창)', 'html', '설치화면', '2026-11-03b']
];
var SOLO_SKIP_ = ['Index', '프로젝트21', '문제해결', '활동화면'];   /* 단독판에 없는 화면 */
function fileVersions_() {
  var list = solo_() ? FILE_EXPECT.filter(function (f) { return SOLO_SKIP_.indexOf(f[2]) < 0; })
    .map(function (f) { return [f[2] === 'FILEVER_자율' ? 'code.gs (기본)' : f[0].replace(/ \(.*\)$/, ''), f[1], f[2], f[3]]; }) : FILE_EXPECT;
  return list.map(function (f) {
    var have = '';
    if (f[1] === 'gs') {
      try { have = String(globalThis[f[2]] || ''); } catch (e) { have = ''; }
    } else {
      try {
        var m = HtmlService.createHtmlOutputFromFile(f[2]).getContent().match(/FILE_VER = '([^']+)'/);
        have = m ? m[1] : '';
      } catch (e) { have = '파일 없음'; }
    }
    return { file: f[0], need: f[3], have: have || '없음', ok: have === f[3] };
  });
}
function 파일버전점검() {
  var L = fileVersions_(), bad = L.filter(function (x) { return !x.ok; });
  var lines = L.map(function (x) { return (x.ok ? '✅ ' : '❌ ') + x.file + '  —  ' + x.have + (x.ok ? '' : '  (필요: ' + x.need + ')'); });
  lines.push('');
  lines.push(bad.length ? '❌ 표시된 ' + bad.length + '개 파일을 새로 받아 붙여넣어 주세요. "없음"이면 예전 파일이거나, 새 파일(알림장.gs)을 아직 만들지 않은 것입니다.'
    : '✅ 모든 파일이 이번 묶음(' + RELEASE + ')입니다. [배포 → 배포 관리 → 연필 → 새 버전 → 배포]를 해 주세요.');
  lines.push('');
  lines.push('※ 이 창은 편집기에 저장된 파일 기준입니다. 실제 배포된 버전은 담임 기록실 → 데이터 · 백업 → [파일 버전]에서 확인합니다.');
  SpreadsheetApp.getUi().alert('파일 버전 한눈에 보기', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
/* 담임 기록실에서 부름: 지금 '배포된' 코드 기준 */
function apiFileVersions(pw) {
  isAdmin_(pw);
  return { release: RELEASE, list: fileVersions_() };
}

/* ---------- 새 학년도 준비 ----------
 * 1) 스프레드시트를 통째로 '○○학년도 보관' 사본으로 남기고
 * 2) 학생 · 기록 시트를 비우고 (머리줄은 남김)
 * 3) PIN을 모두 무효로 만들고, 반마다 달라지는 설정을 비웁니다.
 * 교실 TV 주소 · 학생 앱 주소 · 화면 설정 · 시간표 교시 시각은 그대로 둡니다. */
function 새학년도준비() {
  var ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = ui.alert('새 학년도 준비',
    '올해 기록을 보관 사본으로 남긴 뒤, 이 스프레드시트의 학생 명단과 기록을 비웁니다.\n\n' +
    '• 보관 사본: 지금 상태 그대로 드라이브에 따로 저장됩니다.\n' +
    '• 비우는 것: 학생 명단, PIN, 21일 · 문제해결 기록, 상담 신청, 관찰 기록, 생기부 문구, 알림 · 조사 · 건의 · 일정 · 알림장, 소감문 · 학급 회의\n' +
    '• 그대로 두는 것: 교실 TV · 학생 앱 주소, 화면 설정, 교시 시각, 관리자 비밀번호\n\n계속할까요?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  var c2 = ui.prompt('한 번 더 확인', '되돌릴 수 없습니다. 진행하려면 새학년도 라고 입력해 주세요.', ui.ButtonSet.OK_CANCEL);
  if (c2.getSelectedButton() !== ui.Button.OK || c2.getResponseText().replace(/\s/g, '') !== '새학년도') { ui.alert('취소했습니다. 아무것도 바뀌지 않았어요.'); return; }

  var tz = Session.getScriptTimeZone() || 'Asia/Seoul';
  var cfg = getConfig_();
  var label = Utilities.formatDate(new Date(), tz, 'yyyy') + '학년도 ' + (cfg['학년'] || '') + '-' + (cfg['반'] || '');
  var copy = DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' (' + label + ' 보관 ' + Utilities.formatDate(new Date(), tz, 'MM-dd HH:mm') + ')');

  var CLEAR = [SHEETS.STUDENTS, SHEETS.PLANS, SHEETS.LOGS, SHEETS.PBL_TEAM, SHEETS.PBL_WORK, SHEETS.PBL_EVAL, SHEETS.PBL_FILE,
    '상담신청', '상담휴무', '관찰기록', '생기부', '외부기록',
    '교실공지', '교실조사', '교실응답', '교실건의', '교실일정', '알림장', '알림장제출',
    '소감문과제', '소감문제출', '회의의제', '회의기록', '회의투표', '회의표', '탐구기록'];
  var cleared = [];
  CLEAR.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last > 1) { sh.getRange(2, 1, last - 1, sh.getMaxColumns()).clearContent(); cleared.push(n + ' ' + (last - 1) + '줄'); }
  });

  setConfigValue_('PIN솔트', Utilities.getUuid());
  [['가입암호', ''], ['회의_서기', ''], ['교실_호출', ''], ['교실_디데이', '[]'], ['교실_교사', '{}'], ['교실_시간표', '{}']].forEach(function (kv) {
    if (kv[0] in getConfig_()) setConfigValue_(kv[0], kv[1]);
  });

  var g = ui.prompt('새 학년 · 반', '새로 맡을 학년과 반을 2-3 처럼 적어 주세요. (그대로 두려면 비워 두고 확인)', ui.ButtonSet.OK_CANCEL);
  var gm = g.getSelectedButton() === ui.Button.OK ? g.getResponseText().trim().match(/^(\d)\s*-\s*(\d{1,2})$/) : null;
  if (gm) { setConfigValue_('학년', gm[1]); setConfigValue_('반', gm[2]); }

  try {
    var ch = CacheService.getScriptCache();
    ['bready_' + BOARD_VER, 'nready_' + FILEVER_알림장, 'bd_tv_' + BOARD_VER, 'bd_phone_' + BOARD_VER, 'bslow_' + BOARD_VER, 'cfg_v1', 'cs_pub_v1', 'cs_ready_v1', 'b21v2', 'bpv2'].forEach(function (k) { ch.remove(k); });
  } catch (e) {}

  ui.alert('새 학년도 준비 완료',
    '보관 사본: ' + copy.getName() + '\n' + copy.getUrl() + '\n\n' +
    '비운 기록: ' + (cleared.length ? cleared.join(', ') : '없음') + '\n' +
    (gm ? '새 학년 · 반: ' + gm[1] + '-' + gm[2] + '\n' : '') + '\n' +
    '다음 할 일\n' +
    '1) 담임 기록실 → 명단 · 설정에서 새 학생 명단 넣기\n' +
    '2) [설정] 시트에서 상담 기간(시작일 · 종료일) 바꾸기\n' +
    '3) 교실 화면 → 시간표의 과목 · 선생님 다시 넣기\n' +
    '4) 학생들에게 21일 프로젝트에서 PIN을 새로 정하라고 안내하기 (필요하면 가입암호 먼저 정하기)',
    ui.ButtonSet.OK);
}

/* 화면 파일 안에 다른 HTML 파일(공용 로그인 창 등)을 끼워 넣을 때 씁니다. */
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/* '교실 화면 단독판'(다른 선생님들이 사본을 만들어 쓰는 판)인지 — 단독판 사본에만 있는 단독판.gs 파일이 SOLO_EDITION = true 를 정합니다 */
function solo_() { return typeof SOLO_EDITION !== 'undefined' && SOLO_EDITION === true; }

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (solo_()) {
    if (p.p === 'board') return 교실페이지_(e);
    if (p.key || p.p === 'counsel') return 상담페이지_(e);
    return 담임페이지_();   /* 단독판은 첫 화면이 곧 '교실 화면 관리' */
  }
  if (p.p === 'board') return 교실페이지_(e);
  if (p.p === 'act') return 활동페이지_(e);
  if (p.key || p.p === 'counsel') return 상담페이지_(e);
  if (p.p === 'teacher') return 담임페이지_();
  return 자율페이지_(e);
}

function doPost(e) {
  /* 학생 앱(GitHub 주소)에서 온 요청이면 연결 통로로, 아니면 예전처럼 외부 기록 받기로 */
  var body = null;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || ''); } catch (x) {}
  if (body && body.__fn) return 연결응답_(body);
  return 외부기록받기_(e);
}

/* 시트를 손으로 고치면(설정 · 명단 · 상담 신청 등) 서버 저장본을 비워 바로 반영되게 합니다. */
function onEdit(e) {
  try {
    var ch = CacheService.getScriptCache();
    ch.removeAll(['cfg_v1', 'cs_pub_v1', 'cs_ready_v1', 'b21v2', 'bpv2']);
    if (typeof boardBust_ === 'function') boardBust_();
  } catch (x) {}
}

function onOpen() {
  if (solo_()) {
    SpreadsheetApp.getUi()
      .createMenu('🖥 교실 화면')
      .addItem('설치 · 내 주소 보기', '설치창열기')
      .addSeparator()
      .addItem('파일 버전 확인', '파일버전점검')
      .addToUi();
    try { 시작하기안내_(); } catch (e) {}
    return;
  }
  SpreadsheetApp.getUi()
    .createMenu('학급 운영')
    .addItem('통합 설치 / 시트 만들기', '통합설치')
    .addItem('기존 상담 신청판 데이터 가져오기', '상담데이터가져오기')
    .addSeparator()
    .addItem('웹앱 주소 보기', '통합주소보기')
    .addItem('교실화면 파일 점검', '교실화면점검')
    .addItem('파일 버전 한눈에 보기', '파일버전점검')
    .addSeparator()
    .addItem('새 학년도 준비', '새학년도준비')
    .addToUi();
}

/* 자율(setup) → 상담(준비) → 담임(담임준비_) 순서로 필요한 시트를 모두 만듭니다.
   이미 있는 시트와 데이터는 건드리지 않습니다. */
function 통합설치() {
  setup();
  준비(true);
  담임준비_();
  board준비_();
  SpreadsheetApp.getUi().alert(
    '통합 설치가 끝났습니다.\n\n' +
    '1) [설정] 시트에서 학년 · 반 값을 확인해 주세요. (상담 신청 학번 확인에 씁니다)\n' +
    '2) 예전 상담 신청판을 쓰셨다면 메뉴 [기존 상담 신청판 데이터 가져오기]를 실행하세요.\n' +
    '3) 배포 > 배포 관리 > 연필 아이콘 > 버전: 새 버전 > 배포\n' +
    '   (새 배포가 아니라 기존 배포를 새 버전으로 바꾸면 학생들이 쓰던 주소가 그대로 유지됩니다.)'
  );
}

function 통합주소보기() {
  var url = ScriptApp.getService().getUrl();
  var ui = SpreadsheetApp.getUi();
  if (!url) { ui.alert('아직 배포되지 않았습니다.'); return; }
  if (solo_()) {
    ui.alert('웹앱 주소', '교실 화면 관리 (선생님만 · 학생에게 알려 주지 마세요)\n' + url +
      '\n\n교실 TV 주소는 관리 화면 → [설정 · 시간표] 탭에서 복사하세요.', ui.ButtonSet.OK);
    return;
  }
  ui.alert('웹앱 주소',
    '학생 활동 선택\n' + url + '\n\n' +
    '상담 신청판 바로 가기\n' + url + '?p=counsel\n\n' +
    '담임 기록실 (학생에게 공유하지 마세요)\n' + url + '?p=teacher',
    ui.ButtonSet.OK);
}

/* ---------- 기존 상담 신청판 스프레드시트에서 데이터 옮기기 ----------
   예전 [신청] · [휴무] 시트 내용을 이 파일의 [상담신청] · [상담휴무] 시트로 복사합니다.
   같은 신청(번호 칸의 ID)이 이미 있으면 건너뛰므로 여러 번 실행해도 중복되지 않습니다. */
function 상담데이터가져오기() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('기존 상담 신청판 가져오기',
    '예전 상담 신청판 스프레드시트의 주소(URL)를 붙여 넣어 주세요.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var m = String(r.getResponseText()).match(/[-\w]{25,}/);
  if (!m) { ui.alert('주소에서 스프레드시트 ID를 찾지 못했습니다.'); return; }

  준비(true);
  var src;
  try { src = SpreadsheetApp.openById(m[0]); }
  catch (e) { ui.alert('그 스프레드시트를 열 수 없습니다. 주소와 권한을 확인해 주세요.'); return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var 옮긴신청 = 0, 옮긴휴무 = 0, 옮긴설정 = 0;

  /* 신청 */
  var sb = src.getSheetByName('신청');
  if (sb && sb.getLastRow() >= 2) {
    var dst = ss.getSheetByName(SH_BOOK);
    var 있는ID = {};
    if (dst.getLastRow() >= 2) {
      dst.getRange(2, 1, dst.getLastRow() - 1, 1).getValues()
        .forEach(function (x) { 있는ID[String(x[0])] = true; });
    }
    var w = Math.min(sb.getLastColumn(), 신청머리.length);
    var rows = sb.getRange(2, 1, sb.getLastRow() - 1, w).getValues()
      .filter(function (x) { return x[0] && !있는ID[String(x[0])]; })
      .map(function (x) { while (x.length < 신청머리.length) x.push(''); return x; });
    if (rows.length) {
      dst.getRange(dst.getLastRow() + 1, 1, rows.length, 신청머리.length).setValues(rows);
      옮긴신청 = rows.length;
    }
  }

  /* 휴무 (예전 2칸 형식도 처리) */
  var so = src.getSheetByName('휴무');
  if (so && so.getLastRow() >= 2) {
    var dstO = ss.getSheetByName(SH_OFF);
    var 있는휴무 = {};
    if (dstO.getLastRow() >= 2) {
      dstO.getRange(2, 1, dstO.getLastRow() - 1, 2).getValues().forEach(function (x) {
        있는휴무[날짜문자(x[0]) + '|' + String(x[1] || '전체').trim()] = true;
      });
    }
    var 머리 = so.getRange(1, 1, 1, Math.max(2, so.getLastColumn())).getValues()[0];
    var 세칸 = String(머리[1] || '').trim() === '구분';
    var ov = so.getRange(2, 1, so.getLastRow() - 1, 세칸 ? 3 : 2).getValues();
    var 추가 = [];
    ov.forEach(function (x) {
      var d = 날짜문자(x[0]);
      if (!d) return;
      var g = 세칸 ? (String(x[1] || '전체').trim()) : '전체';
      var why = 세칸 ? x[2] : x[1];
      if (있는휴무[d + '|' + g]) return;
      있는휴무[d + '|' + g] = true;
      추가.push([d, g, why || '휴무']);
    });
    if (추가.length) {
      dstO.getRange(dstO.getLastRow() + 1, 1, 추가.length, 3).setValues(추가);
      옮긴휴무 = 추가.length;
    }
  }

  /* 상담에만 쓰던 설정값 */
  var sc = src.getSheetByName('설정');
  if (sc) {
    var 옮길키 = ['담임', '안내문구', '점심시간', '방과후시간', '이름공개', '시작일', '종료일', '조회키'];
    sc.getDataRange().getValues().forEach(function (x, i) {
      if (!i) return;
      var k = String(x[0]).trim();
      if (옮길키.indexOf(k) < 0) return;
      var v = x[1] instanceof Date ? 날짜문자(x[1]) : String(x[1] == null ? '' : x[1]);
      if (v === '') return;
      setConfigValue_(k, v);
      옮긴설정++;
    });
  }

  ui.alert('가져오기 완료\n\n신청 ' + 옮긴신청 + '건 · 휴무 ' + 옮긴휴무 + '건 · 설정 ' + 옮긴설정 + '개를 옮겼습니다.\n' +
    '예전 스프레드시트는 그대로 남아 있습니다.');
}

/* ---------- 다른 수업 프로그램에서 기록 받기 ----------
 * 보내는 쪽(다른 Apps Script)에서:
 *   UrlFetchApp.fetch(이_웹앱_주소, { method:'post', contentType:'application/json',
 *     payload: JSON.stringify({ key:'연동키', source:'수학 수업',
 *       records:[{ id:'고유번호', 번호:3, 날짜:'2026-10-02', 영역:'세특',
 *                  제목:'모둠 탐구 발표', 내용:'...', 링크:'' }] }) });
 * 번호 대신 학번(10203)이나 이름으로 보내도 됩니다. 같은 source+id로 다시 보내면 덮어씁니다.
 */
function 외부기록받기_(e) {
  function out(o) {
    return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  }
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, reason: 'json' }); }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (x) { return out({ ok: false, reason: 'busy' }); }
  try {
    담임준비_();
    var key = getConfig_()['연동키'];
    if (!key || String(body.key || '') !== key) return out({ ok: false, reason: 'auth' });

    var source = String(body.source || '외부').slice(0, 40);
    var recs = Array.isArray(body.records) ? body.records.slice(0, 500) : [];
    var sh = ss_().getSheetByName(HUB.EXT);
    var 있는행 = {};
    hubExt_().forEach(function (x) { 있는행[x.id] = x.row; });

    var 저장 = 0, 못찾음 = [];
    recs.forEach(function (r, i) {
      var no = hubFindNo_(r['번호'] || r.no, r['학번'] || r.sid, r['이름'] || r.name);
      if (!no) { 못찾음.push(i); return; }
      var st = findStudent_(no);
      var id = source + ':' + String(r.id || Utilities.getUuid().slice(0, 8));
      var row = [id, new Date(), source, no, st.name,
        String(r['날짜'] || r.date || today_()).slice(0, 10),
        String(r['영역'] || r.area || '세특').slice(0, 10),
        String(r['제목'] || r.title || '').slice(0, 100),
        String(r['내용'] || r.text || '').slice(0, 3000),
        String(r['링크'] || r.link || '').slice(0, 500)];
      if (있는행[id]) sh.getRange(있는행[id], 1, 1, row.length).setValues([row]);
      else { sh.appendRow(row); 있는행[id] = sh.getLastRow(); }
      저장++;
    });
    return out({ ok: true, saved: 저장, notFound: 못찾음 });
  } finally {
    lock.releaseLock();
  }
}


/* ================= 교실 화면 단독판: 설치 =================
 * 다른 선생님이 사본을 만든 뒤 메뉴 [🖥 교실 화면 → 설치 · 내 주소 보기] 로 엽니다.
 * 21일 · 문제해결 · 담임 기록 시트는 만들지 않고, 교실 화면에 필요한 시트만 만듭니다. */
function 교실화면_처음설정() { 설치창열기(); }
function 설치창열기() {
  if (!solo_()) { SpreadsheetApp.getUi().alert('이 메뉴는 교실 화면 단독판에서만 씁니다.'); return; }
  var h = HtmlService.createHtmlOutputFromFile('설치화면').setWidth(700).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(h, '교실 화면 설치');
}
function 단독판_상태() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), c = {};
  var installed = !!ss.getSheetByName('설정');
  if (installed) { try { c = getConfig_(); } catch (e) { c = {}; } }
  installed = installed && !!c['관리자비밀번호'] && !!c['교실_키'];
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!/\/exec$/.test(url) && /\/exec$/.test(String(c['단독판_주소'] || ''))) url = String(c['단독판_주소']);
  var out = {
    installed: installed, grade: c['학년'] || '', klass: c['반'] || '', teacher: String(c['담임'] || '').replace(/\s*선생님$/, ''),
    deployed: /\/exec$/.test(url), url: url,
    editor: 'https://script.google.com/home/projects/' + ScriptApp.getScriptId() + '/edit',
    tv: '', view: ''
  };
  if (out.deployed && installed) {
    out.tv = url + '?p=board&t=' + c['교실_키'];
    out.view = c['교실_보기키'] ? url + '?p=board&t=' + c['교실_보기키'] : '';
    try { 시작하기주소_(out); } catch (e) {}
  }
  return out;
}
/* 배포를 마쳤는데 자동으로 못 찾을 때: 배포 창의 '웹 앱 URL'을 붙여 넣어 저장 */
function 단독판_주소저장(url) {
  url = String(url || '').trim();
  if (!/^https:\/\/script\.google\.com\/[^\s?#]*\/exec$/.test(url)) throw new Error('배포 창에 나온 "웹 앱" 주소(https://script.google.com/… /exec 로 끝남)를 그대로 붙여 넣어 주세요.');
  setConfigValue_('단독판_주소', url);
  cfgBust_();
  return 단독판_상태();
}
function 단독판_설치(f) {
  if (!solo_()) throw new Error('단독판이 아닙니다.');
  f = f || {};
  var grade = String(f.grade || '').trim(), klass = String(f.klass || '').trim(), pw = String(f.pw || '');
  var teacher = String(f.teacher || '').trim().slice(0, 20);
  if (!/^[1-6]$/.test(grade)) throw new Error('학년을 숫자로 적어 주세요. (1~6)');
  if (teacher.length < 2) throw new Error('선생님 성함을 적어 주세요. (상담 신청판에 나옵니다)');
  if (!/^\d{1,2}$/.test(klass) || Number(klass) < 1) throw new Error('반을 숫자로 적어 주세요.');
  if (pw.length < 6) throw new Error('비밀번호는 6자 이상으로 정해 주세요.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var first = !ss.getSheetByName('설정');
  if (first) {
    /* 원본에서 따라온 스크립트 속성(화면 배치 · 알림 기록 등)을 비웁니다 */
    try { PropertiesService.getScriptProperties().deleteAllProperties(); } catch (e) {}
  }
  단독판준비_();
  var put = function (k, v) { setConfigValue_(k, v); };
  put('학년', grade); put('반', klass); put('관리자비밀번호', pw);
  put('부제', grade + '학년 ' + klass + '반');
  put('담임', /선생님$/.test(teacher) ? teacher : teacher + ' 선생님');
  if (first || !getConfig_()['교실_키']) {
    put('교실_키', Utilities.getUuid().replace(/-/g, '').slice(0, 10));
    put('교실_보기키', 'v' + Utilities.getUuid().replace(/-/g, '').slice(0, 11));
    put('앱주소', ''); put('교실_호출', ''); put('교실_휴대폰참여', '아니오'); put('교실_첨부폴더ID', '');
    /* 학교: 강릉제일고등학교 (다른 학교면 관리 화면 → 설정 · 시간표 → 급식 · 나이스에서 바꾸기) */
    put('NEIS_교육청', 'K10'); put('NEIS_학교코드', '7801097'); put('NEIS_학교명', '강릉제일고등학교');
  }
  try { ss.rename(grade + '-' + klass + ' 교실 화면'); } catch (e) {}
  cfgBust_();
  return 단독판_상태();
}
/* 교실 화면에 필요한 시트만 */
function 단독판준비_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEETS.CONFIG)) {
    var c = ss.insertSheet(SHEETS.CONFIG);
    c.getRange(1, 1, 1, 2).setValues([['항목', '값']]).setFontWeight('bold');
    c.setColumnWidth(1, 180); c.setColumnWidth(2, 420); c.setFrozenRows(1);
  }
  if (!ss.getSheetByName(SHEETS.STUDENTS)) {
    var st = ss.insertSheet(SHEETS.STUDENTS);
    st.getRange(1, 1, 1, 14).setValues([['번호', '이름', 'PIN(암호화)', '시작일', '완료일', '비고', '별칭(인식 이름)', '현재회차', '생일',
      'PIN정한시각', '승인', '요청', 'PIN길이', '스탬프']]).setFontWeight('bold');
    st.setFrozenRows(1);
  }
  cfgBust_();
  준비(true);
  board준비_();
  note준비_();
  /* 빈 '시트1' 정리, '시작하기'를 맨 앞으로 */
  ss.getSheets().forEach(function (sh) {
    if (/^(시트|Sheet)\d+$/.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  var g = ss.getSheetByName('시작하기');
  if (g) { ss.setActiveSheet(g); ss.moveActiveSheet(1); }
}
/* 사본을 연 순간(설치 전) 첫 시트에 큰 글씨 안내를 적어 둡니다 — 단순 트리거라 권한 없이도 됩니다 */
function 시작하기안내_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var g = ss.getSheetByName('시작하기');
  if (!g) {
    var s0 = ss.getSheets()[0];
    if (ss.getSheets().length === 1 && s0.getLastRow() === 0) { g = s0; g.setName('시작하기'); }
    else return;
  }
  if (g.getRange('A1').getValue()) return;
  var L = [
    ['🖥 교실 화면 설치하기'], [''],
    ['① 위쪽 메뉴 [🖥 교실 화면] → [설치 · 내 주소 보기] 를 누르세요.'],
    ['    메뉴가 안 보이면 10초쯤 기다렸다가 새로고침(F5) 해 주세요.'], [''],
    ['② 처음 한 번 \'승인 필요\' 창이 뜹니다.'],
    ['    [계속] → 내 계정 선택 → [고급] → [교실 화면(으)로 이동] → [허용]'],
    ['    선생님 드라이브에만 저장되는 선생님 소유의 사본이라 나오는 안내입니다.'], [''],
    ['③ 다시 [🖥 교실 화면] → [설치 · 내 주소 보기] 를 누르고, 안내 창을 따라 하면 끝!'], [''],
    ['※ 이 시트의 탭들은 교실 화면 자료가 저장되는 곳입니다. 지우거나 이름을 바꾸지 마세요.']
  ];
  g.getRange(1, 1, L.length, 1).setValues(L);
  g.getRange('A1').setFontSize(22).setFontWeight('bold');
  g.getRange(3, 1, L.length - 2, 1).setFontSize(13);
  g.getRange('A3').setFontWeight('bold'); g.getRange('A10').setFontWeight('bold');
  g.setColumnWidth(1, 900);
}
function 시작하기주소_(o) {
  var g = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('시작하기');
  if (!g) return;
  var rows = [['✅ 설치 완료 — 내 주소 (메뉴 [🖥 교실 화면 → 설치 · 내 주소 보기] 에서도 다시 볼 수 있어요)'],
    ['교실 화면 관리 (선생님만): ' + o.url], ['교실 TV 주소: ' + o.tv], ['학부모 · 학생 보기 주소: ' + o.view]];
  g.getRange(14, 1, rows.length, 1).setValues(rows);
  g.getRange(14, 1).setFontWeight('bold').setFontSize(13);
}

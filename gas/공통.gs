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

var FILEVER_공통 = '2026-11-02a';
var RELEASE = '2026-10-27a';

/* ---------- 파일 버전 한눈에 보기 ----------
 * 파일마다 버전을 적어 두고, 이번 묶음(RELEASE)에 맞는지 표로 보여 줍니다.
 *  - 스프레드시트 메뉴에서 보면: 편집기에 '저장된' 파일 기준
 *  - 담임 기록실에서 보면: 실제로 '배포된' 파일 기준 (새 버전 배포를 했는지 확인)
 * 새 파일이 생기거나 버전이 바뀌면 이 표만 고치면 됩니다. */
var FILE_EXPECT = [
  ['code.gs (21일 · 문제해결)', 'gs', 'FILEVER_자율', '2026-11-01a'],
  ['공통.gs', 'gs', 'FILEVER_공통', '2026-11-02a'],
  ['담임.gs', 'gs', 'FILEVER_담임', '2026-11-02a'],
  ['상담.gs', 'gs', 'FILEVER_상담', '2026-11-01a'],
  ['교실.gs', 'gs', 'FILEVER_교실', '2026-11-02a'],
  ['알림장.gs (새 파일)', 'gs', 'FILEVER_알림장', '2026-10-07a'],
  ['앱.gs', 'gs', 'FILEVER_앱', '2026-10-24a'],
  ['활동.gs (새 파일)', 'gs', 'FILEVER_활동', '2026-10-24a'],
  ['보안.gs', 'gs', 'FILEVER_보안', '2026-10-30a'],
  ['연결.gs (새 파일 · 학생 앱 연결 통로)', 'gs', 'FILEVER_연결', '2026-11-02a'],
  ['Index.html', 'html', 'Index', '2026-11-01a'],
  ['프로젝트21.html (새 파일 · 21일 화면)', 'html', '프로젝트21', '2026-11-01a'],
  ['문제해결.html (새 파일 · 문제 해결 화면)', 'html', '문제해결', '2026-11-01a'],
  ['담임화면.html', 'html', '담임화면', '2026-11-02a'],
  ['상담화면.html', 'html', '상담화면', '2026-11-01a'],
  ['교실화면.html', 'html', '교실화면', '2026-11-02a'],
  ['활동화면.html (새 파일)', 'html', '활동화면', '2026-10-25a'],
  ['게이트.html (새 파일 · 공용 로그인 창)', 'html', '게이트', '2026-11-01a'],
  ['테마.html (새 파일 · 공용 디자인)', 'html', '테마', '2026-10-26b']
];
function fileVersions_() {
  return FILE_EXPECT.map(function (f) {
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
      .createMenu('교실 화면')
      .addItem('① 처음 설정 (사본을 만든 뒤 한 번)', '교실화면_처음설정')
      .addItem('웹앱 주소 보기', '통합주소보기')
      .addItem('파일 버전 한눈에 보기', '파일버전점검')
      .addToUi();
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


/* ================= 교실 화면 단독판: 사본을 만든 선생님이 처음 한 번 실행 =================
 * 학년 · 반 · 관리자 비밀번호를 정하고, 시트를 만들고, 이 사본만의 새 주소 키를 만듭니다.
 * (원본 템플릿에서 따라온 값은 모두 새로 만듭니다) */
function 교실화면_처음설정() {
  var ui = SpreadsheetApp.getUi();
  if (!solo_()) { ui.alert('이 메뉴는 교실 화면 단독판에서만 씁니다.'); return; }
  var ask = function (title, msg, check) {
    for (;;) {
      var r = ui.prompt(title, msg, ui.ButtonSet.OK_CANCEL);
      if (r.getSelectedButton() !== ui.Button.OK) throw new Error('처음 설정을 멈췄어요. 메뉴에서 다시 실행하면 됩니다.');
      var v = String(r.getResponseText() || '').trim(), bad = check(v);
      if (!bad) return v;
      ui.alert(bad);
    }
  };
  var grade = ask('처음 설정 1/3 · 학년', '몇 학년인가요? 숫자만 적어 주세요. (예: 1)', function (v) { return /^[1-3]$/.test(v) ? '' : '1 · 2 · 3 중 하나를 적어 주세요.'; });
  var klass = ask('처음 설정 2/3 · 반', '몇 반인가요? 숫자만 적어 주세요. (예: 2)', function (v) { return /^\d{1,2}$/.test(v) ? '' : '반을 숫자로 적어 주세요.'; });
  var pw = ask('처음 설정 3/3 · 관리자 비밀번호',
    '교실 화면 관리에 들어갈 때 쓰는 비밀번호를 정해 주세요. (6자 이상, 학생에게 알려 주지 마세요)',
    function (v) { return v.length >= 6 ? '' : '6자 이상으로 정해 주세요.'; });

  /* 원본에서 따라온 스크립트 속성(화면 배치 · 알림 기록 등)을 비웁니다 */
  try { PropertiesService.getScriptProperties().deleteAllProperties(); } catch (e) {}
  try { CacheService.getScriptCache().removeAll(['cfg_v1', 'cs_pub_v1', 'cs_ready_v1', 'b21v2', 'bpv2']); } catch (e) {}

  setup(); 준비(true); 담임준비_(); board준비_();
  var put = function (k, v) { setConfigValue_(k, v); };
  put('학년', grade); put('반', klass); put('관리자비밀번호', pw);
  put('부제', grade + '-' + klass + ' 교실 화면');
  put('교실_키', Utilities.getUuid().replace(/-/g, '').slice(0, 10));
  put('교실_보기키', 'v' + Utilities.getUuid().replace(/-/g, '').slice(0, 11));
  put('PIN솔트', Utilities.getUuid());
  put('앱주소', '');
  put('교실_호출', '');
  put('교실_휴대폰참여', '아니오');
  /* 학교: 강릉제일고등학교 (다른 학교면 관리 화면 → 설정 · 시간표 → 급식 · 나이스에서 바꾸면 됩니다) */
  put('NEIS_교육청', 'K10'); put('NEIS_학교코드', '7801097'); put('NEIS_학교명', '강릉제일고등학교');
  /* 첨부 폴더는 이 선생님 드라이브에 새로 */
  put('교실_첨부폴더ID', '');
  /* 처음 만든 빈 시트(시트1)는 지웁니다 */
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(function (sh) {
    if (/^(시트|Sheet)\d+$/.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  cfgBust_();
  ui.alert('처음 설정을 마쳤어요',
    grade + '학년 ' + klass + '반 교실 화면을 준비했습니다.\n\n' +
    '이어서 할 일\n' +
    '1) 확장 프로그램 → Apps Script → 오른쪽 위 [배포] → [새 배포]\n' +
    '   · 유형: 웹 앱   · 실행: 나   · 액세스 권한: 모든 사용자  → [배포]\n' +
    '2) 나온 웹앱 주소를 열고 방금 정한 비밀번호로 들어갑니다. (즐겨찾기 해 두세요)\n' +
    '3) [명단 · 설정]에 학생 번호 · 이름을 붙여 넣고 저장합니다.\n' +
    '4) [교실 화면 → 설정 · 시간표]에서 교실 TV 주소를 복사해 TV에서 엽니다.',
    ui.ButtonSet.OK);
}

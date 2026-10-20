/*******************************************************
 * 연결 통로 — 화면을 학생 앱 주소(GitHub Pages)에서 열 때 씁니다.
 *  · 화면 파일(HTML)은 학생 휴대폰에 저장해 두고 바로 띄우고,
 *    이 파일은 자료만 주고받습니다. (Apps Script 주소로 여는 것도 그대로 됩니다)
 *  · 화면에서 부를 수 있는 함수는 아래 목록(API_ALLOW_)에 있는 것뿐입니다.
 *    새 기능에서 서버 함수를 새로 부르면 이 목록에도 이름을 넣어 주세요.
 *******************************************************/
var FILEVER_연결 = '2026-11-02a';

var API_ALLOW_ = {
  /* 소감문 · 학급 회의 (활동.gs) */
  'essayAdmin': 1, 'essaySubmit': 1, 'meetAdmin': 1, 'meetDecide': 1, 'meetDetail': 1, 'meetPropose': 1,
  'meetRecord': 1, 'meetRecordDel': 1, 'meetVote': 1, 'meetVoteClose': 1, 'meetVoteOpen': 1,
  'actAdmin': 1, 'actInit': 1, 'actStart': 1, 'adminData': 1, 'adminEdit': 1, 'adminXlsx': 1,
  'apiAdminAddLog': 1, 'apiAdminApprove': 1, 'apiAdminCsv': 1, 'apiAdminData': 1, 'apiAdminDeleteLog': 1,
  'apiAdminLogin': 1, 'apiAdminMine': 1, 'apiAdminPblMine': 1, 'apiAdminResetPin': 1, 'apiAdminSetConfig': 1,
  'apiAdminSetRoster': 1, 'apiAdminStudents': 1, 'apiAdminXlsx': 1, 'apiAppInfo': 1, 'apiBoard': 1,
  'apiHubAlerts': 1, 'apiAdminLogout': 1, 'apiHubAlertsSeen': 1, 'apiBoardAdminGet': 1, 'apiBoardAnswer': 1, 'apiBoardAppZip': 1, 'apiBoardBirthdays': 1,
  'apiBoardCheckPin': 1, 'apiBoardCounselBook': 1, 'apiBoardCounselSlots': 1, 'apiBoardData': 1,
  'apiBoardEvent': 1, 'apiBoardExt': 1, 'apiBoardFlashAck': 1, 'apiBoardFlashPoll': 1,
  'apiBoardFlashSend': 1, 'apiBoardFlashStop': 1, 'apiBoardLayoutAuth': 1, 'apiBoardNeisWeek': 1,
  'apiBoardNotice': 1, 'apiBoardProjects': 1, 'apiBoardRegenKey': 1, 'apiBoardRegenViewKey': 1,
  'apiBoardSaveLayout': 1, 'apiBoardSaveSettings': 1, 'apiBoardSuggest': 1, 'apiBoardSuggestOp': 1,
  'apiBoardSurvey': 1, 'apiBoardLinks': 1, 'apiBoardUncheck': 1, 'apiBoardWeather': 1, 'apiChangePin': 1, 'apiFileVersions': 1,
  'apiGateAdmin': 1, 'apiGateDecide': 1, 'apiGateLogin': 1, 'apiGateLogout': 1, 'apiGateUpgrade': 1,
  'apiHome21': 1, 'apiHomePbl': 1, 'apiHubBackupNow': 1, 'apiHubEditObs': 1, 'apiHubExportBackup': 1,
  'apiHubImportActivities': 1, 'apiHubImportBackup': 1, 'apiHubInit': 1, 'apiHubListBackups': 1,
  'apiHubRegenKey': 1, 'apiHubRestoreBackup': 1, 'apiHubSaveFinal': 1, 'apiHubSaveObs': 1,
  'apiHubSetAliases': 1, 'apiHubSetAutoBackup': 1, 'apiHubSetRoster': 1, 'apiHubXlsx': 1, 'apiInqSave': 1,
  'apiJoinInfo': 1, 'apiJoinRequest': 1, 'apiLogin': 1, 'apiNeisSchool': 1, 'apiNeisTest': 1, 'apiNote': 1,
  'apiNoteCalendar': 1, 'apiNoteMine': 1, 'apiPageBundle': 1, 'apiPblAdminComment': 1, 'apiPblAdminData': 1,
  'apiPblAdminDeleteTeam': 1, 'apiPblApply': 1, 'apiPblApprove': 1, 'apiPblBoard': 1, 'apiPblCancelApply': 1,
  'apiPblCreateTeam': 1, 'apiPblLeaveTeam': 1, 'apiPblMine': 1, 'apiPblReject': 1, 'apiPblSaveEval': 1,
  'apiPblSaveStep': 1, 'apiPblSetRecruit': 1, 'apiPblXlsx': 1, 'apiSavePlan': 1, 'apiStartNewRound': 1,
  'apiSubmit': 1, 'book': 1, 'getData': 1
};

/* 학생 앱 주소가 정해져 있으면 그 주소를, 아니면 Apps Script 주소를 씁니다. */
function webBase_() {
  var a = '';
  try { a = String(getConfig_()['앱주소'] || '').trim(); } catch (e) {}
  if (/^https:\/\/[^\s"'<>?#]+$/.test(a)) return /\/$/.test(a) ? a : a + '/';
  return ScriptApp.getService().getUrl() || '';
}

/* Apps Script 주소로 열 때: 화면 값으로 페이지를 만들어 보냅니다. */
function 화면내보내기_(r) {
  var t = HtmlService.createTemplateFromFile(r.template);
  Object.keys(r.vars || {}).forEach(function (k) { t[k] = r.vars[k]; });
  return t.evaluate()
    .setTitle(r.title || '학급 다이어리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* 주소(?p=…, ?go=…)에 맞는 화면 고르기 — doGet과 같은 규칙 */
function 화면고르기_(q) {
  q = q || {};
  if (typeof solo_ === 'function' && solo_()) {
    if (q.p === 'board') return 교실화면값_(q);
    if (q.p === 'counsel') return 상담화면값_(q);
    return 담임화면값_();
  }
  if (q.p === 'board') return 교실화면값_(q);
  if (q.p === 'act') return 활동화면값_(q);
  if (q.p === 'counsel') return 상담화면값_(q);
  if (q.p === 'teacher') return 담임화면값_();
  return 자율화면값_(q);
}

/* 화면 파일 내용과 지문(바뀌었는지 확인용) */
function 화면파일_(name) {
  var ch = null, key = 'tpl3_' + name + '_' + RELEASE;   /* 저장본은 1분만 둡니다 (파일을 바꿔 배포하면 1분 안에 새 화면) */
  try { ch = CacheService.getScriptCache(); var c = ch.get(key); if (c) return JSON.parse(c); } catch (e) {}
  var text = '';
  try { text = HtmlService.createTemplateFromFile(name).getRawContent(); } catch (e) { text = ''; }
  if (!text) text = HtmlService.createHtmlOutputFromFile(name).getContent();
  /* 구글이 <?…?> 표시를 &lt;?…?&gt; 로 바꿔 주는 경우 원래대로 되돌림 */
  text = text.replace(/&lt;\?([\s\S]*?)\?&gt;/g, function (_, m) {
    return '<?' + m.replace(/&#0*39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '?>';
  });
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8);
  var h = d.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  var out = { h: h, text: text };
  try { var s = JSON.stringify(out); if (s.length < 95000) ch.put(key, s, 60); } catch (e) {}
  return out;
}
function 화면파일목록_(main) {
  var seen = {}, list = [];
  (function walk(n) {
    if (seen[n]) return; seen[n] = true; list.push(n);
    var m, re = /include_\('([^']+)'\)/g, t = 화면파일_(n).text;
    while ((m = re.exec(t))) walk(m[1]);
  })(main);
  return list;
}

/* 학생 앱이 화면을 열 때 부르는 함수: 화면 값 + (바뀐) 화면 파일 */
function apiPageBundle(q, have) {
  have = have || {};
  var r = 화면고르기_(q);
  if (r.error) return { error: r.error, title: r.title };
  var files = {}, hashes = {};
  화면파일목록_(r.template).forEach(function (n) {
    var f = 화면파일_(n);
    hashes[n] = f.h;
    if (have[n] !== f.h) files[n] = f.text;
  });
  return { main: r.template, vars: r.vars, title: r.title, hashes: hashes, files: files, rel: RELEASE, today: today_() };
}

/* 학생 앱 아래 탭 목록 */
function apiAppInfo() {
  var c = getConfig_();
  var key = c['교실_보기키'] || '';
  var tabs = [{ id: 'home', label: '처음', icon: 'home', url: './?tab=home' }];
  if (key) tabs.push({ id: 'board', label: '클래스보드', icon: 'board', url: './?p=board&t=' + encodeURIComponent(key) + '&app=1' });
  tabs.push({ id: '21', label: '21일', icon: 'fire', url: './?go=21&app=1' });
  if ((c['문제해결_사용'] || '예') !== '아니오') tabs.push({ id: 'pbl', label: '문제해결', icon: 'bulb', url: './?go=pbl&app=1' });
  tabs.push({ id: 'essay', label: '소감문', icon: 'pen', url: './?p=act&tab=essay&app=1' });
  tabs.push({ id: 'meet', label: '학급회의', icon: 'meet', url: './?p=act&tab=meet&app=1' });
  tabs.push({ id: 'counsel', label: '상담', icon: 'chat', url: './?p=counsel&app=1' });
  return { tabs: tabs, rel: RELEASE };
}

/* doPost로 들어온 요청 가운데 화면이 보낸 것({__fn, args})을 처리합니다. */
function 연결응답_(body) {
  var out;
  try {
    var fn = String(body.__fn || '');
    if (!Object.prototype.hasOwnProperty.call(API_ALLOW_, fn) || typeof globalThis[fn] !== 'function') throw new Error('허용되지 않은 요청입니다: ' + fn);
    var args = Array.isArray(body.args) ? body.args : [];
    out = { ok: true, v: globalThis[fn].apply(null, args) };
  } catch (err) {
    out = { ok: false, e: String((err && err.message) || err) };
  }
  var s;
  try { s = JSON.stringify(out); } catch (e2) { s = JSON.stringify({ ok: false, e: '응답을 만들지 못했어요.' }); }
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

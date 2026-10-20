/*******************************************************
 * 교실 화면 (전자칠판 · 스마트 TV용)
 *  주소: 웹앱 주소?p=board&t=교실화면키
 *  - 시계 · 지금 교시 · 시간표 · 급식(나이스) · 공지 · 오늘 상담 · D-day
 *  - 터치: 조사(체크 선택) 참여, 상담 신청
 *  관리는 담임 기록실 → 교실 화면 에서 합니다.
 *******************************************************/

var BOARD = { NOTICE: '교실공지', SURVEY: '교실조사', RESP: '교실응답', SUGGEST: '교실건의', EVENT: '교실일정' };
/* 화면 파일을 바꿔 배포할 때마다 이 값을 바꾸면, 켜져 있던 교실 TV에 '새로 불러오기' 안내가 뜹니다. */
var BOARD_VER = '2026-10-31a';
var BOARD_ETC = '기타 (목록에 없음 · 직접 쓰기)';
var FILEVER_교실 = '2026-10-31c';
var BOARD_PERIODS = [
  { n: '1', s: '08:50', e: '09:40' }, { n: '2', s: '09:50', e: '10:40' }, { n: '3', s: '10:50', e: '11:40' },
  { n: '4', s: '11:50', e: '12:40' }, { n: '5', s: '13:40', e: '14:30' }, { n: '6', s: '14:40', e: '15:30' },
  { n: '7', s: '15:40', e: '16:30' }
];
var BOARD_CONF = [
  ['교실_키', ''],
  ['교실_시간표출처', '직접'],
  ['교실_교시', JSON.stringify(BOARD_PERIODS)],
  ['교실_점심', '12:40~13:40'],
  ['교실_시간표', '{}'],
  ['교실_디데이', '[]'],
  ['교실_상담표시', '가린이름'],
  ['교실_상담신청', '예'],
  ['NEIS_키', ''],
  ['NEIS_교육청', ''],
  ['NEIS_학교코드', ''],
  ['NEIS_학교명', ''],
  ['NEIS_캐시판', '0'],
  ['교실_건의', '예'],
  ['교실_호출', ''],
  ['교실_보기키', ''],
  ['교실_휴대폰참여', '아니오'],
  ['교실_교사', '{}'],
  ['교실_특별', JSON.stringify([{ name: '청소', s: '15:20', e: '15:40' }])],
  ['교실_일정나이스', '예'],
  ['교실_일정일수', '30'],
  ['교실_화면배치', '{}'],
  ['교실_첨부폴더ID', ''],
  ['교실_명언', JSON.stringify({ on: true, mode: 'day', list: [] })],
  ['날씨_표시', '예'],
  ['날씨_위치', JSON.stringify({ name: '강릉', lat: 37.7519, lon: 128.8761 })]
];

/* ---------- 준비 ---------- */
function board준비_() {
  /* 시트·설정 점검은 느리므로 6시간에 한 번만 합니다. (예전에는 15초마다 도는 확인에서도 매번 했습니다) */
  var flag = 'bready_' + BOARD_VER, cache = CacheService.getScriptCache();
  try { if (cache.get(flag)) return; } catch (e) {}
  var ss = ss_();
  function mk(name, head) {
    if (!ss.getSheetByName(name)) {
      var s = ss.insertSheet(name);
      s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      s.setFrozenRows(1);
    }
  }
  mk(BOARD.NOTICE, ['공지ID', '내용', '중요', '시작', '끝', '작성시각']);
  mk(BOARD.SURVEY, ['조사ID', '질문', '보기', '복수선택', '익명', '상태', '결과공개', '미응답표시', '만든시각']);
  mk(BOARD.RESP, ['조사ID', '번호', '이름', '선택', '시각']);
  mk(BOARD.SUGGEST, ['건의ID', '내용', '이름', '시각', '확인']);
  mk(BOARD.EVENT, ['일정ID', '시작', '끝', '제목', '작성시각']);
  boardHead_(ss.getSheetByName(BOARD.NOTICE), 7, ['첨부ID', '첨부이름', '첨부종류']);
  boardHead_(ss.getSheetByName(BOARD.SURVEY), 10, ['종류', '설명', '첨부ID', '첨부이름', '첨부종류', '기타입력']);
  boardHead_(ss.getSheetByName(BOARD.RESP), 6, ['기타내용']);
  boardHead_(stuSheetW_(), 9, ['생일']);
  var cur = getConfig_();
  BOARD_CONF.forEach(function (kv) { if (!(kv[0] in cur)) sheet_(SHEETS.CONFIG).appendRow([kv[0], kv[1]]); });
  cfgBust_();
  if (!getConfig_()['교실_키']) setConfigValue_('교실_키', Utilities.getUuid().replace(/-/g, '').slice(0, 10));
  if (!getConfig_()['교실_보기키']) setConfigValue_('교실_보기키', 'v' + Utilities.getUuid().replace(/-/g, '').slice(0, 11));
  cfgBust_();
  try { cache.put(flag, '1', 21600); } catch (e) {}
}

function boardHead_(sh, col, labels) {
  if (!sh) return;
  var cur = sh.getRange(1, col, 1, labels.length).getValues()[0];
  if (cur.every(function (x) { return !x; })) sh.getRange(1, col, 1, labels.length).setValues([labels]).setFontWeight('bold');
}
/* 학생이 적은 글이 '='로 시작해도 시트에서 수식이 되지 않게 글자로 저장합니다 */
function boardTxt_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function boardJson_(v, d) { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function boardCfg_() {
  var c = getConfig_();
  return {
    key: c['교실_키'] || '',
    source: c['교실_시간표출처'] === 'NEIS' ? 'NEIS' : '직접',
    periods: boardJson_(c['교실_교시'], BOARD_PERIODS),
    lunch: c['교실_점심'] || '12:40~13:40',
    timetable: boardJson_(c['교실_시간표'], {}),
    ddays: boardJson_(c['교실_디데이'], []),
    counselMode: c['교실_상담표시'] || '가린이름',
    counselOn: (c['교실_상담신청'] || '예') !== '아니오',
    suggestOn: (c['교실_건의'] || '예') !== '아니오',
    links: boardJson_(c['교실_링크'], []),
    viewKey: c['교실_보기키'] || '',
    phoneJoin: c['교실_휴대폰참여'] === '예',
    appUrl: c['앱주소'] || '',
    teachers: boardJson_(c['교실_교사'], {}),
    specials: boardJson_(c['교실_특별'], []),
    eventNeis: (c['교실_일정나이스'] || '예') !== '아니오',
    eventDays: Number(c['교실_일정일수']) || 30,
    layout: boardLayoutGet_(c),
    quote: boardJson_(c['교실_명언'], { on: true, mode: 'day', list: [] }),
    neis: { key: c['NEIS_키'] || '', atpt: c['NEIS_교육청'] || '', code: c['NEIS_학교코드'] || '', name: c['NEIS_학교명'] || '' },
    grade: c['학년'] || '1', klass: c['반'] || '2'
  };
}
function boardUrl_(key) {
  var base = webBase_();
  return base ? base + '?p=board&t=' + key : '';
}
/* 교실 TV 주소면 'tv', 학생 휴대폰용(보기 전용) 주소면 'phone' */
function boardAuth_(t) {
  board준비_();
  var c = getConfig_(), k = c['교실_키'], v = c['교실_보기키'];
  t = String(t || '');
  if (k && t === k) return 'tv';
  if (v && t === v) return 'phone';
  throw new Error('교실 화면 주소가 바뀌었습니다. 담임 기록실 → 교실 화면에서 새 주소를 받아 주세요.');
}
/* 참여(조사 · 건의 · 상담 신청)는 교실 TV에서만. 휴대폰 참여를 켜면 휴대폰에서도 됩니다. */
function boardAuthWrite_(t) {
  var m = boardAuth_(t);
  if (m === 'phone' && !boardCfg_().phoneJoin) throw new Error('휴대폰에서는 볼 수만 있어요. 참여는 교실 화면에서 해 주세요.');
  return m;
}
/* 누가 참여하는지 확인합니다.
 * 교실 TV: 공용 화면이라 PIN을 치면 옆에서 보이므로 이름만 누르면 됩니다.
 * 휴대폰: 21일 프로젝트에서 쓰는 PIN 4자리를 받습니다. */
function boardStudent_(mode, no, pin) {
  /* 교실 TV(공용 화면)는 이름만 고르면 되고, 휴대폰은 학급 로그인(로그인 표 또는 PIN 6자리)이 필요합니다. */
  if (mode !== 'phone') return findStudent_(no);
  return auth_(no, pin);
}

/* 앱에서 PIN을 한 번만 묻기 위해 미리 확인합니다. */
function apiBoardCheckPin(t, no, pin) {
  var m = boardAuthWrite_(t);
  var st = boardStudent_(m, no, pin);
  return { ok: true, no: st.no, name: st.name };
}

/* ---------- 날씨 · 미세먼지 (Open-Meteo, 인증키 없이) ----------
 * 학교 지역의 지금 날씨 · 기온 · 오늘 최고/최저 · 미세먼지(PM10) · 초미세먼지(PM2.5)
 * 20분 동안 저장해 두고 씁니다. 미세먼지 등급은 환경부 기준으로 나눕니다. */
function boardWeatherPlace_() {
  var p = boardJson_(getConfig_()['날씨_위치'], null);
  return (p && p.lat && p.lon) ? p : { name: '강릉', lat: 37.7519, lon: 128.8761 };
}
function boardSky_(c) {
  if (c === 0) return { t: '맑음', i: 'sun' };
  if (c === 1 || c === 2) return { t: '구름 조금', i: 'part' };
  if (c === 3) return { t: '흐림', i: 'cloud' };
  if (c === 45 || c === 48) return { t: '안개', i: 'fog' };
  if (c >= 51 && c <= 57) return { t: '이슬비', i: 'rain' };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { t: '비', i: 'rain' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { t: '눈', i: 'snow' };
  if (c >= 95) return { t: '뇌우', i: 'storm' };
  return { t: '흐림', i: 'cloud' };
}
function boardDust_(v, cut) {
  if (v == null || isNaN(v)) return '';
  return v <= cut[0] ? '좋음' : v <= cut[1] ? '보통' : v <= cut[2] ? '나쁨' : '매우나쁨';
}
function boardWeather_() {
  if ((getConfig_()['날씨_표시'] || '예') === '아니오') return null;
  var pl = boardWeatherPlace_(), key = 'wx_' + pl.lat + '_' + pl.lon, cache = CacheService.getScriptCache();
  var hit = null;
  try { hit = cache.get(key); } catch (e) {}
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  if (BOARD_FAST) return { pending: true };
  var down = false;
  try { down = !!cache.get('wx_down'); } catch (e) {}
  if (down) return { err: '날씨를 잠시 불러오지 못했어요' };
  try {
    var q = 'latitude=' + pl.lat + '&longitude=' + pl.lon + '&timezone=Asia%2FSeoul';
    var rs = UrlFetchApp.fetchAll([
      { url: 'https://api.open-meteo.com/v1/forecast?' + q + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1', muteHttpExceptions: true },
      { url: 'https://air-quality-api.open-meteo.com/v1/air-quality?' + q + '&current=pm10,pm2_5', muteHttpExceptions: true }
    ]);
    if (rs[0].getResponseCode() !== 200) throw new Error('weather ' + rs[0].getResponseCode());
    var w = JSON.parse(rs[0].getContentText());
    var a = rs[1].getResponseCode() === 200 ? JSON.parse(rs[1].getContentText()) : {};
    var code = Number(w.current.weather_code), sky = boardSky_(code);
    var out = {
      place: pl.name, temp: Math.round(w.current.temperature_2m),
      hi: w.daily ? Math.round(w.daily.temperature_2m_max[0]) : null, lo: w.daily ? Math.round(w.daily.temperature_2m_min[0]) : null,
      sky: sky.t, icon: sky.i, day: w.current.is_day !== 0,
      pm10: a.current && a.current.pm10 != null ? Math.round(a.current.pm10) : null,
      pm25: a.current && a.current.pm2_5 != null ? Math.round(a.current.pm2_5) : null
    };
    out.pm10g = boardDust_(out.pm10, [30, 80, 150]);
    out.pm25g = boardDust_(out.pm25, [15, 35, 75]);
    try { cache.put(key, JSON.stringify(out), 1200); } catch (e) {}
    return out;
  } catch (e) {
    try { cache.put('wx_down', '1', 600); } catch (e2) {}
    return { err: '날씨를 불러오지 못했어요' };
  }
}
/* 담임 기록실: 날씨 지역 찾기 · 켜기 · 끄기 */
function apiBoardWeather(pw, op, name) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  if (op === 'off') setConfigValue_('날씨_표시', '아니오');
  else if (op === 'on') setConfigValue_('날씨_표시', '예');
  else if (op === 'place') {
    var n = String(name || '').trim();
    if (!n) throw new Error('지역 이름을 적어 주세요. 예) 강릉, 강릉시 교동');
    var r = UrlFetchApp.fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(n) + '&count=5&language=ko&countryCode=KR', { muteHttpExceptions: true });
    var j = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : {};
    var g = (j.results || [])[0];
    if (!g) throw new Error('"' + n + '" 지역을 찾지 못했어요. 시 · 군 이름(예: 강릉)으로 다시 찾아 주세요.');
    setConfigValue_('날씨_위치', JSON.stringify({ name: g.name + (g.admin1 ? ' (' + g.admin1 + ')' : ''), lat: Math.round(g.latitude * 1e4) / 1e4, lon: Math.round(g.longitude * 1e4) / 1e4 }));
    setConfigValue_('날씨_표시', '예');
  }
  boardBust_();
  boardBust_();
  return apiBoardAdminGet(pw);
}

function boardViewUrl_() {
  var base = webBase_(), v = getConfig_()['교실_보기키'];
  return base && v ? base + '?p=board&t=' + v : '';
}

/* 웹 페이지 */
function 교실페이지_(e) {
  var r = 교실화면값_((e && e.parameter) || {});
  if (r.error) return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;padding:60px;font-size:22px;line-height:1.7">' + r.error + '</div>').setTitle('교실 화면');
  return 화면내보내기_(r);
}
function 교실화면값_(pr) {
  board준비_();
  var t = String(pr.t || '');
  var cf0 = getConfig_();
  if (!t || (t !== cf0['교실_키'] && t !== cf0['교실_보기키'])) {
    return { error: '교실 화면 주소가 올바르지 않습니다.<br>담임 기록실 → <b>교실 화면</b>에서 주소를 다시 열어 주세요.', title: '교실 화면' };
  }
  var boot = JSON.stringify({ t: t, preview: String(pr.preview || '') === '1', ver: BOARD_VER,
    phone: t === cf0['교실_보기키'], app: String(pr.app || '') === '1' });
  return { template: '교실화면', vars: { boot: boot }, title: '우리 반 교실 화면' };
}

/* ---------- 파일 점검 ----------
 * 스프레드시트 메뉴 [학급 운영]에서 실행하면, Apps Script에 들어 있는 교실화면 파일이
 * 온전한지 서버에서 직접 세어 알려 줍니다. (붙여넣기가 잘됐는지 확인용) */
function 교실화면점검() {
  var msg = boardFileReport_();
  try { SpreadsheetApp.getUi().alert('교실화면 파일 점검', msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(msg); }
  return msg;
}

function boardFileReport_() {
  var txt = '';
  try { txt = HtmlService.createHtmlOutputFromFile('교실화면').getContent(); }
  catch (e) { return '교실화면 파일을 찾을 수 없습니다.\n파일 이름이 정확히 "교실화면"(HTML)인지 확인해 주세요.\n\n' + (e && e.message ? e.message : e); }

  var count = function (hay, needle) { return hay.split(needle).length - 1; };
  var start = count(txt, 'BOARD_MARK_START = 1'), end = count(txt, 'BOARD_MARK_END = 1');
  var doctype = count(txt, '<!DOCTYPE'), html = count(txt, '</html>');
  var lines = count(txt, '\n') + 1;

  /* 구글이 파일을 읽을 때 주석을 지우므로, 표식은 모두 '코드'로 넣었습니다. */
  var NEED = '2026-10-31a';   /* 이 날짜이거나 더 최신이면 정상 */
  var vm = txt.match(/BOARD_FILE_VER = '([^']+)'/);
  var L = [];
  L.push('파일 버전: ' + (vm ? vm[1] : '없음 ❌ — 예전 파일입니다. 최신 교실화면.html을 다시 받아 주세요.'));
  L.push('필요한 버전: ' + NEED + ' 이상');
  L.push('');
  L.push('글자 수: ' + txt.length + ' (주석을 뺀 값이라 원래보다 조금 적게 나옵니다)');
  L.push('줄 수: ' + lines);
  L.push('시작 표식: ' + start + '개, 끝 표식: ' + end + '개  (각각 1개여야 정상)');
  L.push('<!DOCTYPE: ' + doctype + '개, </html>: ' + html + '개  (각각 1개여야 정상)');
  L.push('');

  if (!vm || vm[1] < NEED) {
    L.push('❌ 예전 파일입니다. 받은 파일 중 최신(BOARD_FILE_VER = ' + NEED + ')을 붙여넣어 주세요.');
    L.push('   다운로드 폴더에 같은 이름 파일이 여러 개 있으면 가장 최근 것을 쓰세요.');
  } else if (start === 1 && end === 1 && html === 1 && txt.length > 70000) {
    L.push('✅ 파일은 온전합니다. 이대로 [배포 → 배포 관리 → 연필 → 새 버전 → 배포]를 해 주세요.');
    L.push('   그래도 화면이 안 뜨면 이 점검 결과를 그대로 보여 주세요.');
  } else if (end === 0) {
    L.push('❌ 코드의 뒷부분이 없습니다. 파일이 일부만 붙여넣어졌습니다.');
    L.push('   교실화면 파일을 열어 Ctrl+A → Delete로 완전히 비운 뒤,');
    L.push('   받은 파일을 Ctrl+A → Ctrl+C → Ctrl+V로 통째로 붙여넣고 저장해 주세요.');
  } else if (start > 1 || end > 1 || html > 1) {
    L.push('❌ 같은 내용이 여러 번 들어 있습니다. 예전 내용을 지우지 않고 붙여넣은 것 같습니다.');
    L.push('   파일을 Ctrl+A → Delete로 비운 뒤 다시 한 번만 붙여넣어 주세요.');
  } else {
    L.push('❌ 파일이 보낸 것과 다릅니다. 비우고 다시 붙여넣어 주세요.');
  }
  L.push('');

  /* 어디가 다른지 바로 보이도록, 중요한 줄들을 그대로 보여 줍니다. */
  var lines = txt.split('\n');
  var show = function (label, needle) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(needle) >= 0) { L.push(label + ' → ' + (i + 1) + '번째 줄: ' + lines[i].slice(0, 70)); return; }
    }
    L.push(label + ' → 없음 ❌');
  };
  show('const BOOT 줄', 'const BOOT');
  show('시작 표식 줄', 'BOARD_MARK_START = 1');
  show('__boardStarted 줄', '__boardStarted = true');
  show('EXPECT 줄', '/*EXPECT*/');
  show('마지막 함수', 'setInterval(pollFlash');
  L.push('');
  L.push('마지막 20자: ' + JSON.stringify(txt.slice(-20)));
  return L.join('\n');
}

/* ---------- 날짜 · 시간 ---------- */
function boardYmd_(d) { return Utilities.formatDate(d, tz_(), 'yyyyMMdd'); }
function boardDow_(d) { return Number(Utilities.formatDate(d, tz_(), 'u')); } /* 1=월 … 7=일 */
function boardNextSchoolDay_(d) {
  var x = new Date(d.getTime());
  do { x = new Date(x.getTime() + 86400000); } while (boardDow_(x) > 5);
  return x;
}
/* 학부모 · 학생 휴대폰 보기(보기 주소)에서는 학생 이름을 가립니다 (예: 김○언). 교실 TV는 그대로 보여 줍니다. */
function boardMaskPhone_(d) {
  var mk = function (n) { return boardMask_(n, '가린이름'); };
  (d.students || []).forEach(function (s) { s.name = mk(s.name); });
  (d.birthdays || []).forEach(function (b) { b.name = mk(b.name); });
  d.counsel = boardMaskCounsel_(d.counsel);
  return d;
}
function boardMaskCounsel_(list) {
  return (list || []).map(function (c) {
    if (c && c.who) { var o = {}; for (var k in c) o[k] = c[k]; o.who = /○/.test(c.who) ? c.who : boardMask_(c.who, '가린이름'); return o; }
    return c;
  });
}
function boardMask_(name, mode) {
  name = String(name || '').replace(/\s/g, '');
  if (mode === '이름') return name;
  if (mode === '시간만' || !name) return '';
  if (name.length <= 2) return name.charAt(0) + '○';
  return name.charAt(0) + new Array(name.length - 1).join('○') + name.charAt(name.length - 1);
}

/* ---------- 나이스 ---------- */
function neisGet_(svc, params) {
  var cache = CacheService.getScriptCache();
  /* 나이스가 느리거나 안 될 때는 5분 동안 건너뜁니다. 기다리는 동안 칠판 전체가 멈추지 않게 하려는 것입니다. */
  if (!BOARD_FRESH) {
    var down = false;
    try { down = !!cache.get('neis_down'); } catch (e) {}
    if (down) return { rows: [], err: '나이스가 잠시 응답하지 않아요. 곧 다시 시도합니다.', code: 'DOWN', msg: '' };
  }
  var c = getConfig_();
  var q = { Type: 'json', pIndex: 1, pSize: c['NEIS_키'] ? 100 : 5 };
  if (c['NEIS_키']) q.KEY = c['NEIS_키'];
  Object.keys(params).forEach(function (k) { q[k] = params[k]; });
  var url = 'https://open.neis.go.kr/hub/' + svc + '?' +
    Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  var t0 = Date.now();
  var mark = function (sec) { try { cache.put('neis_down', '1', sec); } catch (e) {} };
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var status = res.getResponseCode();
    if (Date.now() - t0 > 10000) mark(180);
    if (status !== 200) { mark(300); return { rows: [], err: '나이스 응답 오류 ' + status, code: 'HTTP' + status, msg: '' }; }
    if (BOARD_FRESH) { try { cache.remove('neis_down'); } catch (e) {} }
    var j = JSON.parse(res.getContentText());
    if (j[svc] && j[svc][1] && j[svc][1].row) return { rows: j[svc][1].row, err: '', code: 'INFO-000', msg: '' };
    var r = j.RESULT || {};
    var code = String(r.CODE || ''), msg = String(r.MESSAGE || '');
    return { rows: [], err: code === 'INFO-200' ? '' : (msg || '응답 없음'), code: code, msg: msg };
  } catch (e) {
    mark(300);
    return { rows: [], err: '나이스에 연결하지 못했습니다. (' + String(e && e.message ? e.message : e).slice(0, 140) + ')', code: 'EXC', msg: '' };
  }
}

var BOARD_FRESH = false;
var BOARD_FAST = false;   /* true이면 나이스는 저장된 값만 쓰고, 없으면 '불러오는 중'으로 둡니다 */
function boardCached_(key, fn) {
  var cache = CacheService.getScriptCache();
  var cf = getConfig_();
  key = key + '_v' + (cf['NEIS_캐시판'] || '0') + (cf['NEIS_키'] ? 'k' : 'n');
  var hit = BOARD_FRESH ? null : cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  if (BOARD_FAST) return { pending: true, err: '', meals: [], subjects: [], events: [], count: 0 };
  var v = fn();
  var empty = (v.meals && !v.meals.length) || (v.subjects && !v.subjects.length) || (v.events && !v.events.length);
  try { cache.put(key, JSON.stringify(v), v.err ? 300 : (empty ? 600 : 21600)); } catch (e) {}
  return v;
}
function boardMeal_(d) {
  var c = boardCfg_();
  if (!c.neis.atpt || !c.neis.code) return { meals: [], err: '학교가 설정되지 않았습니다.' };
  var ymd = boardYmd_(d);
  return boardCached_('meal_' + c.neis.code + '_' + ymd, function () {
    var r = neisGet_('mealServiceDietInfo', { ATPT_OFCDC_SC_CODE: c.neis.atpt, SD_SCHUL_CODE: c.neis.code, MLSV_YMD: ymd });
    return {
      err: r.err, msg: r.msg,
      meals: r.rows.map(function (x) {
        return {
          kind: String(x.MMEAL_SC_NM || ''),
          cal: String(x.CAL_INFO || ''),
          dishes: String(x.DDISH_NM || '').split(/<br\s*\/?>/i).map(function (s) {
            return s.replace(/\([0-9.\s]*\)/g, '').replace(/[0-9.]+$/, '').replace(/[*#]/g, '').trim();
          }).filter(Boolean)
        };
      })
    };
  });
}
function boardNeisTimetable_(d) {
  var c = boardCfg_();
  if (!c.neis.atpt || !c.neis.code) return { subjects: [], err: '학교가 설정되지 않았습니다.' };
  var ymd = boardYmd_(d);
  return boardCached_('tt_' + c.neis.code + '_' + c.grade + '_' + c.klass + '_' + ymd, function () {
    var r = neisGet_('hisTimetable', {
      ATPT_OFCDC_SC_CODE: c.neis.atpt, SD_SCHUL_CODE: c.neis.code, ALL_TI_YMD: ymd, GRADE: c.grade, CLASS_NM: c.klass
    });
    var subj = [];
    r.rows.forEach(function (x) {
      var n = Number(x.PERIO);
      if (n > 0) {
        var t = String(x.ITRT_CNTNT || '').replace(/^-/, '').trim();
        subj[n - 1] = subj[n - 1] && subj[n - 1] !== t ? subj[n - 1] + '/' + t : t;
      }
    });
    for (var i = 0; i < subj.length; i++) if (subj[i] == null) subj[i] = '';
    return { subjects: subj, err: r.err, msg: r.msg, code: r.code, count: r.rows.length, date: ymd,
      grade: c.grade, klass: c.klass, partial: !getConfig_()['NEIS_키'] && r.rows.length >= 5 };
  });
}

function boardTodayTable_(d) {
  var c = boardCfg_();
  var dow = boardDow_(d);
  if (dow > 5) return { periods: [], note: '주말' };
  var subj = (c.timetable[dow] || []).slice();
  var note = '', pending = false;
  if (c.source === 'NEIS') {
    var r = boardNeisTimetable_(d);
    if (r.pending) pending = true;
    else if (r.subjects.length) subj = c.periods.map(function (p, i) { return r.subjects[i] || subj[i] || ''; });
    else note = r.err || ('나이스에 오늘 ' + c.grade + '학년 ' + c.klass + '반 시간표가 없어요');
    if (r.partial) note = '나이스 인증키가 없어 5교시까지만 받았습니다';
  }
  return {
    periods: c.periods.map(function (p, i) { return { n: p.n, s: p.s, e: p.e, subj: subj[i] || '', teacher: ((c.teachers[dow] || [])[i] || '').trim() }; })
      .filter(function (p) { return p.s && p.e; }),
    note: note, pending: pending
  };
}

/* ---------- 긴급 호출 (화면에 크게 띄우는 쪽지) ---------- */
function boardFlash_() {
  var f = boardJson_(getConfig_()['교실_호출'], null);
  if (!f || !f.until || new Date(f.until).getTime() < Date.now()) return null;
  return f;
}
function boardFlashOut_(f) {
  return f ? { id: f.id, who: f.who, text: f.text, level: f.level, until: f.until } : null;
}

/* 담임 기록실에서 보냅니다. */
function apiBoardFlashSend(pw, d) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  d = d || {};
  var who = String(d.who || '').trim().slice(0, 40);
  var text = String(d.text || '').trim().slice(0, 120);
  if (!who && !text) throw new Error('부를 사람이나 할 말을 적어 주세요.');
  var min = Math.max(1, Math.min(30, Number(d.min) || 5));
  setConfigValue_('교실_호출', JSON.stringify({
    id: 'f_' + Utilities.getUuid().slice(0, 8),
    who: who, text: text, level: d.level === '긴급' ? '긴급' : '알림',
    at: new Date().toISOString(),
    until: new Date(Date.now() + min * 60000).toISOString(),
    min: min, ackAt: ''
  }));
  boardBust_();
  return apiBoardAdminGet(pw);
}

function apiBoardFlashStop(pw) {
  boardBust_();
  isAdmin_(pw);
  setConfigValue_('교실_호출', '');
  boardBust_();
  return apiBoardAdminGet(pw);
}

/* 교실 화면에서 [확인했어요]를 누르면 바로 내려가고, 선생님 화면에 확인 시각이 남습니다. */
function apiBoardFlashAck(t, id) {
  boardBust_();
  boardAuth_(t);
  var f = boardFlash_();
  if (!f || f.id !== String(id)) return { ok: true };
  f.ackAt = new Date().toISOString();
  f.until = new Date(Date.now() - 1000).toISOString();
  setConfigValue_('교실_호출', JSON.stringify(f));
  return { ok: true };
}

/* 교실 화면이 자주 부르는 가벼운 확인용 */
function apiBoardFlashPoll(t) {
  boardAuth_(t);   /* 준비 점검은 6시간에 한 번, 설정은 한 번만 읽으므로 가볍습니다 */
  return { flash: boardFlashOut_(boardFlash_()), ver: BOARD_VER };
}

/* ---------- 공지 · 조사 읽기 ---------- */
function boardLevel_(v) {
  v = String(v || '').trim();
  return v === '긴급' ? 2 : ((v === '예' || v === '중요') ? 1 : 0);
}
function boardFileOf_(id, name, mime) {
  id = String(id || '').trim();
  return id ? { id: id, name: String(name || '첨부 파일'), mime: String(mime || '') } : null;
}
/* 공지 첨부: 한 개면 예전처럼 (id · 이름 · 종류), 여러 개면 G칸에 목록(JSON)을 담습니다. */
function boardFilesOf_(id, name, mime) {
  var g = String(id || '').trim();
  if (!g) return [];
  if (g.charAt(0) === '[') {
    try {
      return JSON.parse(g).filter(function (f) { return f && f.id; })
        .map(function (f) { return { id: String(f.id), name: String(f.name || '첨부 파일'), mime: String(f.mime || '') }; });
    } catch (e) { return []; }
  }
  return [{ id: g, name: String(name || '첨부 파일'), mime: String(mime || '') }];
}
function boardFilesCell_(list) {
  if (!list.length) return ['', '', ''];
  if (list.length === 1) return [list[0].id, list[0].name, list[0].mime];
  return [JSON.stringify(list.map(function (f) { return { id: f.id, name: f.name, mime: f.mime }; })), list[0].name + ' 외 ' + (list.length - 1) + '개', ''];
}
function boardNotices_(all) {
  var today = today_();
  return hubRows_(BOARD.NOTICE, 9).filter(function (x) { return x.r[0]; }).map(function (x) {
    var lv = boardLevel_(x.r[2]);
    return {
      row: x.row, id: String(x.r[0]), text: String(x.r[1] || ''), level: lv, important: lv > 0,
      start: hubDate_(x.r[3]), end: hubDate_(x.r[4]), at: hubTime_(x.r[5]),
      files: boardFilesOf_(x.r[6], x.r[7], x.r[8])
    };
  }).map(function (n) { n.file = n.files[0] || null; return n; }).filter(function (n) {
    return all || ((!n.start || n.start <= today) && (!n.end || n.end >= today));
  }).sort(function (a, b) { return (b.level - a.level) || (a.at < b.at ? 1 : -1); });
}

function boardSurveys_() {
  return hubRows_(BOARD.SURVEY, 15).filter(function (x) { return x.r[0]; }).map(function (x) {
    var kind = String(x.r[9]) === '체크' ? '체크' : '선택';
    return {
      row: x.row, id: String(x.r[0]), q: String(x.r[1] || ''), options: kind === '체크' ? ['체크'] : boardJson_(String(x.r[2] || ''), []),
      multi: kind === '체크' ? false : String(x.r[3]) === '예', anon: String(x.r[4]) === '예', open: String(x.r[5]) !== '마감',
      pub: String(x.r[6]) === '예', showMissing: String(x.r[7]) === '예', at: hubTime_(x.r[8]),
      kind: kind, desc: String(x.r[10] || ''), file: boardFileOf_(x.r[11], x.r[12], x.r[13]),
      etc: kind === '선택' && String(x.r[14]) === '예'
    };
  });
}

function boardResponses_() {
  return hubRows_(BOARD.RESP, 6).filter(function (x) { return x.r[0]; }).map(function (x) {
    return { row: x.row, id: String(x.r[0]), no: Number(x.r[1]), name: String(x.r[2] || ''),
      choices: boardJson_(String(x.r[3] || ''), []), at: hubTime_(x.r[4]), etc: String(x.r[5] || '') };
  });
}
function boardSurveySummary_(s, resps, sts, forTeacher) {
  var mine = resps.filter(function (r) { return r.id === s.id; });
  var counts = s.options.map(function () { return 0; });
  mine.forEach(function (r) { r.choices.forEach(function (i) { if (counts[i] != null) counts[i]++; }); });
  var done = {};
  mine.forEach(function (r) { done[r.no] = true; });
  var out = {
    id: s.id, q: s.q, options: s.options, multi: s.multi, anon: s.anon, open: s.open, pub: s.pub,
    showMissing: s.showMissing, total: sts.length, count: mine.length,
    kind: s.kind, desc: s.desc, file: s.file, etc: !!s.etc,
    doneNos: Object.keys(done).map(Number),
    counts: (forTeacher || s.pub) ? counts : null
  };
  if (forTeacher) {
    out.at = s.at;
    out.missing = sts.filter(function (st) { return !done[st.no]; }).map(function (st) { return { no: st.no, name: st.name }; });
    out.byOption = s.anon ? null : s.options.map(function (o, i) {
      return mine.filter(function (r) { return r.choices.indexOf(i) >= 0; }).map(function (r) { return r.no + '. ' + r.name; });
    });
    var ei = s.etc ? s.options.length - 1 : -1;
    out.responses = s.anon ? null : mine.map(function (r) {
      return { no: r.no, name: r.name, choices: r.choices.map(function (i) { return i === ei && r.etc ? '기타: ' + r.etc : s.options[i]; }), at: r.at, etc: r.etc };
    });
    /* '기타'로 직접 적은 답 (익명 조사면 이름 없이 글만) */
    out.etcList = s.etc ? mine.filter(function (r) { return r.choices.indexOf(ei) >= 0 && r.etc; })
      .sort(function (a, b) { return a.no - b.no; })
      .map(function (r) { return s.anon ? { text: r.etc } : { no: r.no, name: r.name, text: r.etc }; }) : [];
  }
  return out;
}

/* ---------- 학교 일정 ---------- */
function boardIso_(ymd8) { ymd8 = String(ymd8 || ''); return ymd8.slice(0, 4) + '-' + ymd8.slice(4, 6) + '-' + ymd8.slice(6, 8); }
function boardDaysBetween_(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
/* 사이 날짜가 모두 주말이면 이어진 것으로 봅니다 (금 → 월). */
function boardJoinable_(prev, next) {
  var gap = boardDaysBetween_(prev, next);
  if (gap === 1) return true;
  if (gap < 1 || gap > 3) return false;
  for (var i = 1; i < gap; i++) {
    var d = new Date(new Date(prev + 'T00:00:00Z').getTime() + i * 86400000).getUTCDay();
    if (d !== 0 && d !== 6) return false;
  }
  return true;
}
function boardNeisEvents_(from8, to8) {
  var c = boardCfg_();
  if (!c.neis.atpt || !c.neis.code) return { events: [], err: '학교가 설정되지 않았습니다.' };
  return boardCached_('sch_' + c.neis.code + '_' + c.grade + '_' + from8 + '_' + to8, function () {
    var r = neisGet_('SchoolSchedule', {
      ATPT_OFCDC_SC_CODE: c.neis.atpt, SD_SCHUL_CODE: c.neis.code, AA_FROM_YMD: from8, AA_TO_YMD: to8, pSize: c.neis.key ? 500 : 5
    });
    var flag = { 1: 'ONE_GRADE_EVENT_YN', 2: 'TW_GRADE_EVENT_YN', 3: 'THREE_GRADE_EVENT_YN' }[Number(c.grade)];
    var rows = r.rows.filter(function (x) {
      var nm = String(x.EVENT_NM || '').trim();
      if (!nm || nm === '토요휴업일') return false;
      return !flag || String(x[flag] || '') !== 'N';
    }).map(function (x) { return { date: boardIso_(x.AA_YMD), title: String(x.EVENT_NM).trim() }; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    var events = [];
    rows.forEach(function (x) {
      var hit = null;
      for (var i = events.length - 1; i >= 0; i--) {
        if (events[i].title === x.title && boardJoinable_(events[i].end, x.date)) { hit = events[i]; break; }
      }
      if (hit) { if (x.date > hit.end) hit.end = x.date; }
      else events.push({ title: x.title, start: x.date, end: x.date });
    });
    return { events: events, err: r.err, msg: r.msg, code: r.code, count: r.rows.length, partial: !c.neis.key && r.rows.length >= 5 };
  });
}
function boardManualEvents_() {
  return hubRows_(BOARD.EVENT, 5).filter(function (x) { return x.r[0]; }).map(function (x) {
    var st = hubDate_(x.r[1]), en = hubDate_(x.r[2]) || st;
    return { row: x.row, id: String(x.r[0]), start: st, end: en < st ? st : en, title: String(x.r[3] || '') };
  }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
}
/* 오늘부터 정한 기간 안의 일정 (학교 + 학급) */
function boardEvents_(now, days) {
  var c = boardCfg_(), today = today_();
  days = days || c.eventDays;
  var last = ymd_(new Date(now.getTime() + days * 86400000));
  var out = [], err = '', pendingEv = false;
  if (c.eventNeis) {
    var r = boardNeisEvents_(boardYmd_(new Date(now.getTime() - 10 * 86400000)), boardYmd_(new Date(now.getTime() + days * 86400000)));
    err = r.err || '';
    if (r.pending) pendingEv = true;
    (r.events || []).forEach(function (e) { out.push({ title: e.title, start: e.start, end: e.end, src: '학교' }); });
  }
  boardManualEvents_().forEach(function (e) { out.push({ title: e.title, start: e.start, end: e.end, src: '학급' }); });
  /* 학교·학급 구분 없이 보여 주므로, 같은 날 같은 이름이 두 번 들어 있으면 하나만 남깁니다. */
  var seen = {};
  out = out.filter(function (e) {
    var k = e.start + '|' + e.end + '|' + String(e.title).replace(/\s+/g, '');
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
  out = out.filter(function (e) { return e.end >= today && e.start <= last; })
    .sort(function (a, b) { return a.start < b.start ? -1 : (a.start > b.start ? 1 : (a.src < b.src ? 1 : -1)); });
  return { events: out.slice(0, 15), err: err, pending: pendingEv };
}

/* ---------- 생일 ---------- */
function boardBirthdays_() {
  var sh = stuSheetW_(), last = sh.getLastRow(), out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 9).getValues().forEach(function (r) {
    var no = Number(r[0]), v = r[8];
    if (!no || v === '' || v == null) return;
    var md = '';
    if (v instanceof Date) md = Utilities.formatDate(v, tz_(), 'MM-dd');
    else {
      var m = String(v).match(/(\d{1,2})\D+(\d{1,2})\D*$/);
      if (m) md = ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    }
    if (md) out[no] = md;
  });
  return out;
}
/* 이번 주(월~일)에 생일인 학생 */
function boardWeekBirthdays_(now, stsIn) {
  var bd = boardBirthdays_(), sts = stsIn || students_();
  var dow = boardDow_(now), today = ymd_(now);
  var days = [];
  for (var i = 0; i < 7; i++) days.push(new Date(now.getTime() + (i - (dow - 1)) * 86400000));
  var out = [];
  days.forEach(function (d) {
    var ds = ymd_(d), md = ds.slice(5), y = Number(ds.slice(0, 4));
    var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    sts.forEach(function (s) {
      var b = bd[s.no];
      if (!b) return;
      if (b === md || (b === '02-29' && !leap && md === '02-28')) {
        out.push({ no: s.no, name: s.name, date: ds, dow: boardDow_(d), today: ds === today });
      }
    });
  });
  return out;
}

/* ---------- 첨부 파일 (드라이브) ---------- */
function boardSaveFile_(f) {
  if (!f || !f.data) return null;
  var bytes = Utilities.base64Decode(String(f.data));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('첨부 파일은 15MB 이하로 올려 주세요.');
  var c = getConfig_(), folder = null;
  if (c['교실_첨부폴더ID']) { try { folder = DriveApp.getFolderById(c['교실_첨부폴더ID']); } catch (e) {} }
  if (!folder) {
    folder = DriveApp.createFolder('학급다이어리_교실화면_첨부');
    setConfigValue_('교실_첨부폴더ID', folder.getId());
  }
  var name = String(f.name || '첨부').slice(0, 120);
  var file = folder.createFile(Utilities.newBlob(bytes, String(f.mime || 'application/octet-stream'), name));
  var shared = true;
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { shared = false; }
  return { id: file.getId(), name: name, mime: String(f.mime || ''), shared: shared };
}

/* ---------- 상담: 칠판에서 고를 수 있는 자리 ---------- */
function boardHm_(s) { var m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }
function boardCounselSlots_() {
  var D = 공개자료();
  var now = new Date();
  var nowHm = Number(Utilities.formatDate(now, tz_(), 'H')) * 60 + Number(Utilities.formatDate(now, tz_(), 'm'));
  var today = today_();
  var out = [];
  for (var i = 0; i < 21 && out.length < 24; i++) {
    var d = new Date(now.getTime() + i * 86400000);
    var ds = ymd_(d), dow = boardDow_(d);
    if (dow > 5 || ds < D.start || ds > D.end) continue;
    ['lunch', 'after'].forEach(function (k) {
      if (D.off[ds] && D.off[ds][k]) return;
      if (D.taken[ds + '|' + k]) return;
      if (ds === today && boardHm_(D.slots[k].time) <= nowHm) return;
      out.push({ date: ds, dow: dow, slot: k, label: D.slots[k].label, time: D.slots[k].time });
    });
  }
  return out;
}

/* ---------- 칠판이 1분마다 부르는 자료 ---------- */
/* 모아 둔 칠판 자료를 버려서, 바뀐 내용이 바로 보이게 합니다. */
function boardBust_() {
  try { var ch = CacheService.getScriptCache(); ch.remove('bd_tv_' + BOARD_VER); ch.remove('bd_phone_' + BOARD_VER); } catch (e) {}
}

/* 칠판이 1분마다 부르는 자료.
 *  - 같은 자료를 20초 동안 모아 두고 모두에게 나눠 줍니다. (교실 TV와 학생 휴대폰이 동시에 불러도 서버는 한 번만 일합니다)
 *  - 나이스(급식·학사일정·시간표)는 기다리지 않습니다. 저장된 값이 없으면 needExt=true로 알려 주고,
 *    화면이 이어서 apiBoardExt를 불러 채웁니다. 나이스가 느려도 칠판은 바로 뜹니다. */
function apiBoardData(t, fresh) {
  var mode = boardAuth_(t);
  var cache = CacheService.getScriptCache(), key = 'bd_' + mode + '_' + BOARD_VER;
  var d = null;
  if (!fresh) { try { var s = cache.get(key); if (s) d = JSON.parse(s); } catch (e) {} }   /* 미리보기는 항상 새 자료 */
  if (!d) {
    BOARD_FAST = true;
    d = boardBuildData_(mode);
    if (mode === 'phone') boardMaskPhone_(d);
    try { var str = JSON.stringify(d); if (str.length < 90000) cache.put(key, str, 20); } catch (e) {}
  }
  /* 시계와 긴급 호출은 모아 둔 값을 쓰지 않고 항상 지금 값으로 */
  d.now = Date.now();
  d.flash = boardFlashOut_(boardFlash_());
  return d;
}

/* 나이스 자료를 채워 줍니다. 느릴 수 있으므로 칠판을 먼저 띄운 뒤 따로 부릅니다. */
function apiBoardExt(t) {
  var extMode = boardAuth_(t);
  BOARD_FAST = false;
  var c = boardCfg_(), now = new Date();
  var tt = boardTodayTable_(now), meal = boardMeal_(now), tom = boardNextSchoolDay_(now), mealTom = boardMeal_(tom);
  var ev = { events: [] };
  try { ev = boardEvents_(now); } catch (e) {}
  var slow = boardSlowParts_(c);
  try { var ch = CacheService.getScriptCache(); ch.remove('bd_tv_' + BOARD_VER); ch.remove('bd_phone_' + BOARD_VER); } catch (e) {}
  return {
    ok: true, periods: tt.periods, ttNote: tt.note,
    counsel: extMode === 'phone' ? boardMaskCounsel_(slow.counsel) : slow.counsel, stat21: slow.stat21, pbl: slow.pbl, weather: boardWeather_(),
    meal: meal.meals, mealErr: meal.err,
    mealTomorrow: { date: ymd_(tom), meals: mealTom.meals },
    events: ev.events
  };
}

/* 느린 부분: 오늘 상담 · 21일 현황 · 문제해결 현황 (여러 시트를 읽음) */
function boardSlowParts_(c) {
  var out = { counsel: [], stat21: null, pbl: null };
  try {
    var P = 공개자료();
    var times = { lunch: P.slots.lunch.time, after: P.slots.after.time };
    신청읽기().filter(function (r) { return r.date === today_(); })
      .sort(function (a, b) { return a.slot === b.slot ? 0 : (a.slot === 'lunch' ? -1 : 1); })
      .forEach(function (r) {
        out.counsel.push({ slot: r.slot, label: r.slot === 'after' ? '방과후' : '점심시간', time: times[r.slot] || '',
          who: boardMask_(r.name, c.counselMode) });
      });
  } catch (e) {}
  try { var b = board21Data_(); out.stat21 = { done: b.stat.todayDone, total: b.stat.students }; } catch (e) {}
  try { var p = pblBoardData_(); out.pbl = { teams: p.stat.teams, completed: p.stat.completed }; } catch (e) {}
  try { CacheService.getScriptCache().put('bslow_' + BOARD_VER, JSON.stringify(out), 90); } catch (e) {}
  return out;
}
function boardSlowCached_() {
  try { var s = CacheService.getScriptCache().get('bslow_' + BOARD_VER); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

function boardBuildData_(mode) {
  var c = boardCfg_();
  var now = new Date();
  var sts = students_();
  var tt = boardTodayTable_(now);
  var meal = boardMeal_(now);
  var tom = boardNextSchoolDay_(now);
  var mealTom = boardMeal_(tom);
  var evx = { events: [], pending: false };
  try { evx = boardEvents_(now); } catch (e) {}
  /* 칠판은 빨리 떠야 하므로 느린 부분은 저장된 값만 씁니다. 없으면 needExt로 알려 화면이 따로 채웁니다. */
  var slow = boardSlowCached_();
  var wx = boardWeather_();
  var needExt = !!(tt.pending || meal.pending || mealTom.pending || evx.pending || !slow || (wx && wx.pending));
  slow = slow || { counsel: [], stat21: null, pbl: null };

  var resps = boardResponses_();
  var surveys = boardSurveys_().filter(function (s) { return s.open || s.pub; })
    .map(function (s) { return boardSurveySummary_(s, resps, sts, false); });


  return {
    ok: true,
    now: now.getTime(),
    today: today_(),
    label: c.grade + '학년 ' + c.klass + '반',
    needExt: needExt,
    periods: tt.periods, ttNote: tt.pending ? '시간표를 불러오는 중…' : tt.note, lunch: c.lunch,
    meal: meal.meals, mealErr: meal.pending ? '급식을 불러오는 중…' : meal.err,
    mealTomorrow: { date: ymd_(tom), meals: mealTom.meals },
    notices: boardNotices_(false).map(function (n) { return { id: n.id, text: n.text, level: n.level, important: n.important, file: n.file, files: n.files }; }),
    notes: noteBoardList_(sts),
    birthdays: boardWeekBirthdays_(now, sts),
    suggestOn: c.suggestOn,
    links: (Array.isArray(c.links) ? c.links : []).filter(function (l) { return l && l.url && l.on !== false; })
      .map(function (l) { return { id: l.id, title: l.title, url: l.url }; }),
    specials: (c.specials || []).filter(function (x) { return x && x.name && x.s && x.e; }),
    events: evx.events,
    layout: c.layout || {},
    pbl: slow.pbl,
    ddays: c.ddays,
    quote: (c.quote && c.quote.on !== false && c.quote.list && c.quote.list.length) ? { mode: c.quote.mode, list: c.quote.list } : null,
    counsel: slow.counsel, counselOn: c.counselOn, counselMode: c.counselMode,
    surveys: surveys,
    students: sts.map(function (s) { return { no: s.no, name: s.name, hasPin: !!s.pinHash }; }),
    stat21: slow.stat21,
    weather: wx && !wx.pending ? wx : null,
    shareUrl: boardViewUrl_(),
    homeUrl: c.appUrl || webBase_() || '',
    flash: boardFlashOut_(boardFlash_()),
    ver: BOARD_VER, url: mode === 'phone' ? boardViewUrl_() : boardUrl_(c.key),
    phone: mode === 'phone', phoneJoin: c.phoneJoin, needPin: mode === 'phone'
  };
}

/* 조사 답하기 (같은 학생이 다시 하면 바뀝니다) */
function apiBoardAnswer(t, id, no, choices, pin, etcText) {
  boardBust_();
  var mode = boardAuthWrite_(t);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = boardSurveys_().filter(function (x) { return x.id === String(id); })[0];
    if (!s) throw new Error('없어진 조사입니다.');
    if (!s.open) throw new Error('이미 마감된 조사입니다.');
    var st = boardStudent_(mode, no, pin);
    var ch = (choices || []).map(Number).filter(function (i) { return i >= 0 && i < s.options.length; });
    ch = ch.filter(function (v, i) { return ch.indexOf(v) === i; });
    if (s.kind === '체크') ch = [0];
    if (!ch.length) throw new Error('보기를 하나 이상 골라 주세요.');
    if (!s.multi) ch = ch.slice(0, 1);
    var etc = '';
    if (s.etc && ch.indexOf(s.options.length - 1) >= 0) {
      etc = String(etcText || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!etc) throw new Error("'기타'를 골랐으면 내용을 적어 주세요.");
    }
    var sh = ss_().getSheetByName(BOARD.RESP);
    var cur = boardResponses_().filter(function (r) { return r.id === s.id && r.no === st.no; })[0];
    var row = [s.id, st.no, st.name, JSON.stringify(ch), new Date(), boardTxt_(etc)];
    if (cur) sh.getRange(cur.row, 1, 1, 6).setValues([row]); else sh.appendRow(row);
    var sum = boardSurveySummary_(s, boardResponses_(), students_(), false);
    return { ok: true, again: !!cur, survey: sum };
  } finally {
    lock.releaseLock();
  }
}

/* 체크형 조사에서 체크 취소 */
function apiBoardUncheck(t, id, no, pin) {
  boardBust_();
  var mode = boardAuthWrite_(t);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = boardSurveys_().filter(function (x) { return x.id === String(id); })[0];
    if (!s) throw new Error('없어진 조사입니다.');
    if (!s.open) throw new Error('이미 마감된 조사입니다.');
    var st = boardStudent_(mode, no, pin);
    var sh = ss_().getSheetByName(BOARD.RESP);
    boardResponses_().filter(function (r) { return r.id === s.id && r.no === st.no; })
      .sort(function (a, b) { return b.row - a.row; }).forEach(function (r) { sh.deleteRow(r.row); });
    return { ok: true, survey: boardSurveySummary_(s, boardResponses_(), students_(), false) };
  } finally {
    lock.releaseLock();
  }
}

/* 21일 · 문제해결 진행 상황 (칠판에서 누르면) */
function apiBoardProjects(t) {
  var pm = boardAuth_(t), mk = function (n) { return pm === 'phone' ? boardMask_(n, '가린이름') : n; };
  var out = { p21: null, pbl: null };
  try {
    var b = board21Data_();
    out.p21 = { total: b.total, stat: b.stat, list: b.list.map(function (x) {
      return { no: x.no, name: mk(x.name), count: x.count, completed: x.completed, todayDone: x.todayDone,
        trophies: x.trophies || 0, round: x.round || 1, topic: x.topic || '' };
    }) };
  } catch (e) {}
  try {
    var p = pblBoardData_();
    out.pbl = { stat: p.stat, notJoined: p.notJoined, list: p.list.map(function (x) {
      return { name: x.name, type: x.type, members: (x.members || []).map(mk), size: x.size, topic: x.topic, done: x.done,
        completed: x.completed, confirmed: x.confirmed };
    }) };
  } catch (e) {}
  return out;
}

/* 화면 배치 (칠판에서 관리자 비밀번호로) */
function apiBoardLayoutAuth(t, pw) {
  if (boardAuth_(t) !== 'tv') throw new Error('화면 크기 조절은 교실 TV 주소에서만 할 수 있어요.');
  isAdmin_(pw);
  return { ok: true };
}
/* 화면 배치는 스크립트 속성에도 저장해 두고 그 값을 먼저 씁니다.
   (설정 시트 값은 여러 화면이 동시에 읽어 가며 잠깐 저장해 두기 때문에, 저장 직후 예전 배치가 다시 보이는 일이 있었습니다) */
function boardLayoutGet_(c) {
  try { var v = PropertiesService.getScriptProperties().getProperty('board_layout'); if (v) return JSON.parse(v); } catch (e) {}
  return boardJson_((c || getConfig_())['교실_화면배치'], {});
}
function boardLayoutSet_(clean) {
  var s = JSON.stringify(clean);
  try { PropertiesService.getScriptProperties().setProperty('board_layout', s); } catch (e) {}
  setConfigValue_('교실_화면배치', s);
}
function boardCleanLayout_(o) {
  o = o || {};
  var num = function (v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  var out = { zoom: num(o.zoom, 0.5, 1.6, 1), top: num(o.top, 0, 200, 0), bottom: num(o.bottom, 0, 240, 0),
    left: num(o.left, 0, 240, 0), right: num(o.right, 0, 240, 0) };
  if (Array.isArray(o.cols) && o.cols.length === 3) out.cols = o.cols.map(function (x) { return num(x, 0.3, 3, 1); });
  /* 칸 위치: 세 줄(열)마다 칸 이름 목록. 여섯 칸이 빠짐없이 한 번씩 있어야 받아들입니다. */
  var MOV = ['clock', 'now', 'tt', 'sch', 'meal', 'nt'];
  if (Array.isArray(o.order) && o.order.length === 3) {
    var seen = {}, cnt = 0;
    var ord = o.order.map(function (c) {
      return (Array.isArray(c) ? c : []).map(String).filter(function (k) {
        if (MOV.indexOf(k) < 0 || seen[k]) return false; seen[k] = 1; cnt++; return true;
      });
    });
    if (cnt === MOV.length && ord.every(function (c) { return c.length > 0; })) out.order = ord;
  }
  out.blk = {};
  Object.keys(o.blk || {}).slice(0, 20).forEach(function (k) { if (/^[a-z0-9]{1,12}$/.test(k)) out.blk[k] = num(o.blk[k], 0.5, 2, 1); });
  return out;
}
function apiBoardSaveLayout(t, pw, layout) {
  boardBust_();
  if (boardAuth_(t) !== 'tv') throw new Error('화면 크기 조절은 교실 TV 주소에서만 할 수 있어요.');
  isAdmin_(pw);
  var clean = boardCleanLayout_(layout);
  boardLayoutSet_(clean);
  boardBust_();
  /* 방금 저장한 값을 그대로 돌려줍니다 (설정 저장본을 다시 읽다가 예전 값이 섞이지 않도록) */
  return { ok: true, layout: clean };
}

/* 건의사항 보내기 */
function apiBoardSuggest(t, text, no, pin) {
  boardBust_();
  var mode = boardAuthWrite_(t);
  if (!boardCfg_().suggestOn) throw new Error('지금은 건의사항을 받지 않습니다.');
  text = String(text || '').trim().slice(0, 300);
  if (text.length < 2) throw new Error('건의할 내용을 적어 주세요.');
  var name = '';
  /* 이름 없이 보내는 건의는 PIN을 묻지 않습니다. */
  if (no) name = boardStudent_(mode, no, pin).name;
  ss_().getSheetByName(BOARD.SUGGEST).appendRow(['g_' + Utilities.getUuid().slice(0, 8), boardTxt_(text), name, new Date(), '']);
  return { ok: true };
}

function apiBoardCounselSlots(t) {
  boardAuthWrite_(t);
  if (!boardCfg_().counselOn) throw new Error('지금은 교실 화면에서 상담 신청을 받지 않습니다.');
  return { slots: boardCounselSlots_() };
}

function apiBoardCounselBook(t, no, date, slot, pin) {
  var mode = boardAuthWrite_(t);
  if (!boardCfg_().counselOn) throw new Error('지금은 교실 화면에서 상담 신청을 받지 않습니다.');
  var st = boardStudent_(mode, no, pin);
  var r = 신청하기({ date: date, slot: slot === 'after' ? 'after' : 'lunch', sid: hub학번_(st.no), name: st.name, memo: '' });
  return { ok: !!r.ok, reason: r.reason || '' };
}

/* ---------- 담임 기록실 → 교실 화면 ---------- */
function apiBoardAdminGet(pw) {
  isAdmin_(pw);
  BOARD_FAST = false;
  board준비_();
  var c = boardCfg_();
  var sts = students_();
  var resps = boardResponses_();
  return {
    url: boardUrl_(c.key),
    phoneUrl: boardViewUrl_(),
    weatherCfg: { on: (getConfig_()['날씨_표시'] || '예') !== '아니오', place: boardWeatherPlace_().name },
    notes: (function () { try { return noteAdmin_(); } catch (e) { return { kinds: [], cal: { on: false }, items: [], err: String(e && e.message || e) }; } })(),
    flash: (function () {
      var f = boardJson_(getConfig_()['교실_호출'], null);
      if (!f) return null;
      f.live = !!(f.until && new Date(f.until).getTime() >= Date.now());
      return f;
    })(),
    baseUrl: webBase_(),
    cfg: c,
    today: today_(),
    notices: boardNotices_(true).map(function (n) {
      return { id: n.id, text: n.text, level: n.level, important: n.important, start: n.start, end: n.end, at: n.at, file: n.file, files: n.files };
    }),
    surveys: boardSurveys_().sort(function (a, b) { return a.at < b.at ? 1 : -1; })
      .map(function (s) { return boardSurveySummary_(s, resps, sts, true); }),
    students: sts.map(function (s) { return { no: s.no, name: s.name }; }),
    birthdays: boardBirthdays_(),
    weekBirthdays: boardWeekBirthdays_(new Date()),
    events: boardManualEvents_().map(function (e) { return { id: e.id, start: e.start, end: e.end, title: e.title }; }),
    eventsShown: (function () { try { return boardEvents_(new Date()); } catch (e) { return { events: [], err: String(e.message || e) }; } })(),
    suggestions: hubRows_(BOARD.SUGGEST, 5).filter(function (x) { return x.r[0]; }).map(function (x) {
      return { id: String(x.r[0]), text: String(x.r[1] || ''), name: String(x.r[2] || ''), at: hubTime_(x.r[3]), read: String(x.r[4]) === '확인' };
    }).sort(function (a, b) { return (a.read - b.read) || (a.at < b.at ? 1 : -1); })
  };
}

function apiBoardSaveSettings(pw, o) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  o = o || {};
  if ('source' in o) setConfigValue_('교실_시간표출처', o.source === 'NEIS' ? 'NEIS' : '직접');
  if ('periods' in o) setConfigValue_('교실_교시', JSON.stringify((o.periods || []).filter(function (p) { return p.s && p.e; })));
  if ('lunch' in o) setConfigValue_('교실_점심', String(o.lunch || ''));
  if ('timetable' in o) setConfigValue_('교실_시간표', JSON.stringify(o.timetable || {}));
  if ('ddays' in o) setConfigValue_('교실_디데이', JSON.stringify((o.ddays || []).filter(function (d) { return d.label && d.date; }).slice(0, 3)));
  if ('counselMode' in o) setConfigValue_('교실_상담표시', ['이름', '가린이름', '시간만'].indexOf(o.counselMode) >= 0 ? o.counselMode : '가린이름');
  if ('counselOn' in o) setConfigValue_('교실_상담신청', o.counselOn ? '예' : '아니오');
  if ('suggestOn' in o) setConfigValue_('교실_건의', o.suggestOn ? '예' : '아니오');
  if ('phoneJoin' in o) setConfigValue_('교실_휴대폰참여', o.phoneJoin ? '예' : '아니오');
  if ('appUrl' in o) {
    var au = String(o.appUrl || '').trim();
    if (au && !/^https:\/\/[^\s"'<>?#]+$/.test(au)) throw new Error('학생 앱 주소는 https:// 로 시작하는 주소여야 해요. (예: https://아이디.github.io/class-diary/)');
    if (au && !/\/$/.test(au)) au += '/';
    setConfigValue_('앱주소', au);
  }
  if ('teachers' in o) {
    var tch = {};
    [1, 2, 3, 4, 5].forEach(function (d) {
      tch[d] = ((o.teachers || {})[d] || []).map(function (x) { return String(x || '').trim().slice(0, 4); });
    });
    setConfigValue_('교실_교사', JSON.stringify(tch));
  }
  if ('specials' in o) {
    setConfigValue_('교실_특별', JSON.stringify((o.specials || []).map(function (x) {
      return { name: String(x.name || '').trim().slice(0, 12), s: String(x.s || ''), e: String(x.e || '') };
    }).filter(function (x) { return x.name && /^\d{1,2}:\d{2}$/.test(x.s) && /^\d{1,2}:\d{2}$/.test(x.e); }).slice(0, 8)));
  }
  if ('eventNeis' in o) setConfigValue_('교실_일정나이스', o.eventNeis ? '예' : '아니오');
  if ('eventDays' in o) setConfigValue_('교실_일정일수', String(Math.max(7, Math.min(90, Number(o.eventDays) || 30))));
  if ('layout' in o) boardLayoutSet_(boardCleanLayout_(o.layout));
  if ('quote' in o) {
    var q = o.quote || {};
    var list = (q.list || []).map(function (x) {
      return { t: String(x.t || '').trim().slice(0, 100), by: String(x.by || '').trim().slice(0, 30) };
    }).filter(function (x) { return x.t; }).slice(0, 150);
    setConfigValue_('교실_명언', JSON.stringify({ on: q.on !== false, mode: ['day', 'min', 'fix'].indexOf(q.mode) >= 0 ? q.mode : 'day', list: list }));
  }
  if ('neisKey' in o) setConfigValue_('NEIS_키', String(o.neisKey || '').trim());
  if ('neisKey' in o || o.school || 'source' in o) setConfigValue_('NEIS_캐시판', String(new Date().getTime()));
  if (o.school) {
    setConfigValue_('NEIS_교육청', o.school.atpt || '');
    setConfigValue_('NEIS_학교코드', o.school.code || '');
    setConfigValue_('NEIS_학교명', o.school.name || '');
  }
  boardBust_();
  return apiBoardAdminGet(pw);
}

function apiBoardRegenViewKey(pw) {
  boardBust_();
  isAdmin_(pw);
  setConfigValue_('교실_보기키', 'v' + Utilities.getUuid().replace(/-/g, '').slice(0, 11));
  boardBust_();
  return apiBoardAdminGet(pw);
}

function apiBoardRegenKey(pw) {
  boardBust_();
  isAdmin_(pw);
  setConfigValue_('교실_키', Utilities.getUuid().replace(/-/g, '').slice(0, 10));
  boardBust_();
  return apiBoardAdminGet(pw);
}

function apiBoardNotice(pw, op, d) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  var sh = ss_().getSheetByName(BOARD.NOTICE);
  d = d || {};
  var LV = ['', '중요', '긴급'], addedId = '';
  if (op === 'add') {
    var lines = (Array.isArray(d.lines) ? d.lines : [d.text]).map(function (x) { return String(x || '').trim().slice(0, 300); }).filter(Boolean).slice(0, 20);
    if (!lines.length) throw new Error('공지 내용을 적어 주세요.');
    var levels = Array.isArray(d.levels) ? d.levels : [];
    var f = boardSaveFile_(d.file);
    var cell0 = boardFilesCell_(f ? [f] : []);
    lines.forEach(function (text, i) {
      var lv = Number(levels[i] != null ? levels[i] : d.level) || 0;
      var id = 'n_' + Utilities.getUuid().slice(0, 8);
      if (i === 0) addedId = id;
      sh.appendRow([id, text, LV[lv] || '', String(d.start || ''), String(d.end || ''), new Date(),
        i === 0 ? cell0[0] : '', i === 0 ? cell0[1] : '', i === 0 ? cell0[2] : '']);
    });
  } else {
    var n = boardNotices_(true).filter(function (x) { return x.id === String(d.id); })[0];
    if (!n) throw new Error('이미 지워진 공지입니다.');
    if (op === 'del') sh.deleteRow(n.row);
    if (op === 'star') sh.getRange(n.row, 3).setValue(n.level ? '' : '중요');
    if (op === 'level') sh.getRange(n.row, 3).setValue(LV[Number(d.level) || 0] || '');
    if (op === 'text') sh.getRange(n.row, 2).setValue(String(d.text || '').trim().slice(0, 300) || n.text);
    if (op === 'edit') {
      /* 내용 · 보이는 기간 · 중요도를 한 번에 고칩니다. 작성 시각은 그대로라 순서가 바뀌지 않습니다. */
      var text = String(d.text || '').trim().slice(0, 300);
      if (!text) throw new Error('알림 내용을 비워 둘 수 없어요. 없애려면 [지우기]를 눌러 주세요.');
      var st = String(d.start || '').trim(), en = String(d.end || '').trim();
      var okDate = function (v) { return !v || /^\d{4}-\d{2}-\d{2}$/.test(v); };
      if (!okDate(st) || !okDate(en)) throw new Error('날짜를 다시 골라 주세요.');
      if (st && en && en < st) throw new Error('끝나는 날이 시작하는 날보다 빠를 수 없어요.');
      sh.getRange(n.row, 2).setValue(text);
      sh.getRange(n.row, 4, 1, 2).setNumberFormat('@').setValues([[st, en]]);
      if (d.level != null) sh.getRange(n.row, 3).setValue(LV[Number(d.level) || 0] || '');
    }
    if (op === 'attach') {
      /* 이미 붙은 파일 뒤에 더합니다 (공지 하나에 최대 12개) */
      if (n.files.length >= 12) throw new Error('첨부는 공지 하나에 12개까지 붙일 수 있어요.');
      var g = boardSaveFile_(d.file);
      if (g) sh.getRange(n.row, 7, 1, 3).setValues([boardFilesCell_(n.files.concat([g]))]);
    }
    if (op === 'unfile') {
      /* d.fileId 가 있으면 그 파일만, 없으면 모두 뺍니다 */
      var keep = d.fileId ? n.files.filter(function (f) { return f.id !== String(d.fileId); }) : [];
      sh.getRange(n.row, 7, 1, 3).setValues([boardFilesCell_(keep)]);
    }
  }
  boardBust_();
  var out = apiBoardAdminGet(pw);
  if (addedId) out.addedId = addedId;
  return out;
}

/* 설문 · 링크 버튼 (구글 설문 등 바깥 주소). 교실 화면 아래쪽에 버튼으로 나오고, 누르면 QR 코드가 뜹니다. */
function apiBoardLinks(pw, op, d) {
  isAdmin_(pw);
  d = d || {};
  var list = boardJson_(getConfig_()['교실_링크'], []);
  if (!Array.isArray(list)) list = [];
  if (op === 'add') {
    var title = String(d.title || '').trim().slice(0, 40);
    var url = String(d.url || '').trim();
    if (!title) throw new Error('버튼에 보일 이름을 적어 주세요.');
    if (!/^https:\/\/[^\s"'<>]+$/.test(url) || url.length > 500) throw new Error('https 로 시작하는 주소를 붙여 넣어 주세요.');
    if (list.length >= 6) throw new Error('링크 버튼은 6개까지 만들 수 있어요. 안 쓰는 버튼을 지워 주세요.');
    list.push({ id: 'l_' + Utilities.getUuid().slice(0, 8), title: title, url: url, on: true });
  } else {
    var i = list.map(function (l) { return l.id; }).indexOf(String(d.id));
    if (i < 0) throw new Error('이미 지워진 버튼입니다.');
    if (op === 'del') list.splice(i, 1);
    if (op === 'toggle') list[i].on = list[i].on === false;
  }
  setConfigValue_('교실_링크', JSON.stringify(list));
  boardBust_();
  return apiBoardAdminGet(pw);
}

function apiBoardSurvey(pw, op, d) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  var sh = ss_().getSheetByName(BOARD.SURVEY);
  d = d || {};
  if (op === 'add') {
    var q = String(d.q || '').trim().slice(0, 200);
    var kind = d.kind === '체크' ? '체크' : '선택';
    var etcOn = kind === '선택' && !!d.etc;
    var opts = kind === '체크' ? ['체크'] : (d.options || []).map(function (x) { return String(x).replace(/\t+/g, ' · ').trim().slice(0, 100); }).filter(Boolean).slice(0, 80);
    if (etcOn) opts.push(BOARD_ETC);
    if (!q) throw new Error('질문을 적어 주세요.');
    if (kind === '선택' && opts.length < 2) throw new Error('보기는 두 개 이상 적어 주세요.');
    var f = boardSaveFile_(d.file);
    sh.appendRow(['s_' + Utilities.getUuid().slice(0, 8), q, JSON.stringify(opts), d.multi && kind === '선택' ? '예' : '',
      d.anon ? '예' : '', '진행', d.pub ? '예' : '', d.showMissing ? '예' : '', new Date(),
      kind, String(d.desc || '').trim().slice(0, 600), f ? f.id : '', f ? f.name : '', f ? f.mime : '', etcOn ? '예' : '']);
    boardBust_();
    return apiBoardAdminGet(pw);
  }
  var s = boardSurveys_().filter(function (x) { return x.id === String(d.id); })[0];
  if (!s) throw new Error('이미 지워진 조사입니다.');
  if (op === 'close') sh.getRange(s.row, 6).setValue('마감');
  if (op === 'open') sh.getRange(s.row, 6).setValue('진행');
  if (op === 'pub') sh.getRange(s.row, 7).setValue(s.pub ? '' : '예');
  if (op === 'missing') sh.getRange(s.row, 8).setValue(s.showMissing ? '' : '예');
  if (op === 'attach') { var g = boardSaveFile_(d.file); if (g) sh.getRange(s.row, 12, 1, 3).setValues([[g.id, g.name, g.mime]]); }
  if (op === 'unfile') sh.getRange(s.row, 12, 1, 3).setValues([['', '', '']]);
  if (op === 'del') {
    var rs = ss_().getSheetByName(BOARD.RESP);
    boardResponses_().filter(function (r) { return r.id === s.id; }).sort(function (a, b) { return b.row - a.row; })
      .forEach(function (r) { rs.deleteRow(r.row); });
    sh.deleteRow(s.row);
  }
  boardBust_();
  return apiBoardAdminGet(pw);
}

function apiNeisSchool(pw, name) {
  isAdmin_(pw);
  board준비_();
  var r = neisGet_('schoolInfo', { SCHUL_NM: String(name || '').trim() });
  return {
    err: r.err,
    list: r.rows.map(function (x) {
      return { atpt: x.ATPT_OFCDC_SC_CODE, code: x.SD_SCHUL_CODE, name: x.SCHUL_NM, office: x.ATPT_OFCDC_SC_NM, addr: x.ORG_RDNMA || '' };
    })
  };
}

function apiNeisTest(pw) {
  isAdmin_(pw);
  BOARD_FRESH = true;
  BOARD_FAST = false;
  var c = boardCfg_();
  var now = new Date();
  var m = boardMeal_(now);
  var nxt = boardNextSchoolDay_(now);
  var m2 = boardMeal_(nxt);
  var tDay = boardDow_(now) > 5 ? nxt : now;
  var t = boardNeisTimetable_(tDay);
  var sc = boardNeisEvents_(boardYmd_(now), boardYmd_(new Date(now.getTime() + 30 * 86400000)));
  return {
    schedule: sc,
    meal: m, mealNext: { date: ymd_(nxt), meals: m2.meals }, timetable: t,
    hasKey: !!c.neis.key, school: c.neis.name, source: c.source, grade: c.grade, klass: c.klass, ttDate: boardYmd_(tDay)
  };
}

/* 이번 주(주말이면 다음 주) 월~금 시간표를 나이스에서 받아 표를 채울 값으로 돌려줍니다. */
function apiBoardNeisWeek(pw) {
  isAdmin_(pw);
  board준비_();
  BOARD_FRESH = true;
  BOARD_FAST = false;
  var c = boardCfg_();
  if (!c.neis.atpt || !c.neis.code) throw new Error('먼저 학교를 찾아 선택해 주세요.');
  if (!c.neis.key) throw new Error('나이스 인증키를 먼저 저장해 주세요. 키 없이는 5칸만 받을 수 있습니다.');
  var now = new Date();
  var dow = boardDow_(now);
  var mon = new Date(now.getTime() - (dow - 1) * 86400000);
  if (dow >= 6) mon = new Date(mon.getTime() + 7 * 86400000);
  var fri = new Date(mon.getTime() + 4 * 86400000);
  var from = boardYmd_(mon), to = boardYmd_(fri);
  var r = neisGet_('hisTimetable', {
    ATPT_OFCDC_SC_CODE: c.neis.atpt, SD_SCHUL_CODE: c.neis.code, GRADE: c.grade, CLASS_NM: c.klass,
    TI_FROM_YMD: from, TI_TO_YMD: to, pSize: 1000
  });
  var grid = { 1: [], 2: [], 3: [], 4: [], 5: [] }, maxN = 0, cells = 0;
  r.rows.forEach(function (x) {
    var ymd = String(x.ALL_TI_YMD || '');
    var wd = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))).getDay();
    var n = Number(x.PERIO);
    var t = String(x.ITRT_CNTNT || '').replace(/^-/, '').trim();
    if (wd < 1 || wd > 5 || !(n > 0) || !t) return;
    var cur = grid[wd][n - 1];
    if (cur == null) cells++;
    grid[wd][n - 1] = cur && cur !== t ? cur + '/' + t : t;
    if (n > maxN) maxN = n;
  });
  for (var d = 1; d <= 5; d++) for (var i = 0; i < maxN; i++) if (grid[d][i] == null) grid[d][i] = '';
  return { ok: true, grid: grid, periods: maxN, cells: cells, from: from, to: to, rows: r.rows.length,
    err: r.err, code: r.code, msg: r.msg, grade: c.grade, klass: c.klass };
}

/* 건의사항: 확인 표시 · 지우기 */
function apiBoardSuggestOp(pw, op, id) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  var sh = ss_().getSheetByName(BOARD.SUGGEST);
  var x = hubRows_(BOARD.SUGGEST, 5).filter(function (y) { return String(y.r[0]) === String(id); })[0];
  if (!x) throw new Error('이미 지워진 건의입니다.');
  if (op === 'read') sh.getRange(x.row, 5).setValue(String(x.r[4]) === '확인' ? '' : '확인');
  if (op === 'del') sh.deleteRow(x.row);
  boardBust_();
  return apiBoardAdminGet(pw);
}

/* 생일 저장: { 번호: 'MM-DD' 또는 '' } */
function apiBoardBirthdays(pw, map) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  var sh = stuSheetW_();
  students_().forEach(function (s) {
    if (!Object.prototype.hasOwnProperty.call(map || {}, s.no)) return;
    var v = String(map[s.no] || '').trim(), m = v.match(/^(\d{1,2})-(\d{1,2})$/);
    var ok = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31;
    sh.getRange(s.row, 9).setNumberFormat('@').setValue(ok ? ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2) : '');
  });
  boardBust_();
  return apiBoardAdminGet(pw);
}

/* 학급 일정 직접 넣기 · 지우기 */
function apiBoardEvent(pw, op, d) {
  boardBust_();
  isAdmin_(pw);
  board준비_();
  d = d || {};
  var sh = ss_().getSheetByName(BOARD.EVENT);
  if (op === 'add') {
    var title = String(d.title || '').trim().slice(0, 60);
    var st = String(d.start || ''), en = String(d.end || '') || st;
    if (!title) throw new Error('일정 이름을 적어 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(st)) throw new Error('시작 날짜를 골라 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(en) || en < st) en = st;
    sh.appendRow(['e_' + Utilities.getUuid().slice(0, 8), st, en, title, new Date()]);
  } else if (op === 'del') {
    var e = boardManualEvents_().filter(function (x) { return x.id === String(d.id); })[0];
    if (e) sh.deleteRow(e.row);
  }
  boardBust_();
  return apiBoardAdminGet(pw);
}

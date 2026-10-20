/* ================= Firebase로 옮기기 위한 전체 내보내기 =================
 * 학급 다이어리 스프레드시트의 모든 시트 + 스크립트 속성(화면 배치 등)을 JSON 파일 하나로 저장합니다.
 * 지금 앱은 아무것도 바뀌지 않습니다. (읽기만 합니다)
 *
 * 쓰는 법: Apps Script 편집기 위쪽 함수 고르는 칸에서 [파이어베이스_내보내기] 를 고르고 ▶ 실행.
 *          끝나면 아래 '실행 로그'에 드라이브 파일 주소가 나옵니다.
 *
 * ⚠ 이 파일에는 학생 이름 · 기록 · 상담 내용 · 관리자 비밀번호 · PIN 암호(암호화된 값)가 모두 들어 있습니다.
 *   선생님 드라이브에만 두고, GitHub이나 메신저에 절대 올리지 마세요.
 */
var FILEVER_내보내기 = '2026-11-01a';

function 파이어베이스_내보내기() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || ss_();
  var tz = ss.getSpreadsheetTimeZone() || 'Asia/Seoul';
  var cell = function (v) {
    if (v instanceof Date) return { $d: Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ssXXX") };
    return v;
  };
  var out = {
    kind: 'class-diary-export',
    version: 1,
    exportedAt: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    timeZone: tz,
    spreadsheet: { id: ss.getId(), name: ss.getName() },
    sheets: {},
    props: {},
    counts: {}
  };
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    var last = sh.getLastRow(), cols = sh.getLastColumn();
    var values = last && cols ? sh.getRange(1, 1, last, cols).getValues() : [];
    /* 맨 아래 빈 줄은 뺍니다 */
    while (values.length && values[values.length - 1].every(function (x) { return x === '' || x == null; })) values.pop();
    out.sheets[name] = {
      head: values.length ? values[0].map(String) : [],
      rows: values.slice(1).map(function (r) { return r.map(cell); })
    };
    out.counts[name] = Math.max(0, values.length - 1);
  });
  /* 스크립트 속성: 화면 배치(board_layout) · 알림 본 시각 등. 학생 로그인 표(tk_…)는 옮길 필요가 없어 뺍니다. */
  var p = PropertiesService.getScriptProperties().getProperties();
  Object.keys(p).forEach(function (k) { if (k.indexOf('tk_') !== 0) out.props[k] = p[k]; });

  var json = JSON.stringify(out);
  var folder = 내보내기폴더_();
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmm');
  var file = folder.createFile('학급다이어리_전체내보내기_' + stamp + '.json', json, MimeType.PLAIN_TEXT);
  try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}

  var lines = Object.keys(out.counts).map(function (k) { return '  · ' + k + ': ' + out.counts[k] + '줄'; });
  var msg = '내보내기를 마쳤어요. (' + Math.round(json.length / 1024) + 'KB)\n' +
    '파일: ' + file.getUrl() + '\n\n시트별 줄 수\n' + lines.join('\n') +
    '\n\n이 파일에는 개인정보와 관리자 비밀번호가 들어 있어요. 선생님 드라이브에만 두세요.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Firebase 내보내기', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return { ok: true, url: file.getUrl(), name: file.getName(), sizeKB: Math.round(json.length / 1024), counts: out.counts };
}

function 내보내기폴더_() {
  var name = '학급다이어리_Firebase_내보내기';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

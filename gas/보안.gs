/*******************************************************
 * 보안 (공통)
 *  - 비밀번호·PIN 반복 시도 막기 (무차별 대입 방지)
 *  - 비밀번호 비교를 한 글자씩 비교하지 않기 (시간 차 공격 방지)
 *  - 클라이언트로 내보낼 설정에서 비밀값 가리기
 *  이 파일은 다른 파일보다 먼저 쓰이므로 내용만 붙여넣으면 됩니다.
 *******************************************************/
var FILEVER_보안 = '2026-10-30a';

/* 실패가 쌓이면 잠시 막습니다. 성공하면 바로 풀립니다.
 * 같은 교실에서 여러 명이 쓰므로 사람(번호)별로 셉니다. */
var SEC_LIMITS = {
  pin:   { tries: 7,  lockMin: 10 },   /* 학생 PIN */
  admin: { tries: 5,  lockMin: 30 }    /* 관리자 비밀번호 */
};

function secCache_() { return CacheService.getScriptCache(); }
function secKey_(kind, who) { return 'sec_' + kind + '_' + String(who).replace(/\s/g, ''); }

/* 막혀 있으면 남은 시간을 알려 주고 멈춥니다. */
function secCheck_(kind, who) {
  var L = SEC_LIMITS[kind] || SEC_LIMITS.pin;
  var v = secCache_().get(secKey_(kind, who));
  if (!v) return;
  var o = {};
  try { o = JSON.parse(v); } catch (e) { return; }
  if (!o.until || o.until < Date.now()) return;
  var min = Math.max(1, Math.ceil((o.until - Date.now()) / 60000));
  throw new Error(kind === 'admin'
    ? '비밀번호를 여러 번 틀렸습니다. ' + min + '분 뒤에 다시 시도해 주세요.'
    : '여러 번 틀려서 ' + min + '분 동안 잠겼어요. 잠시 뒤에 다시 해 보거나 담임 선생님께 말해 주세요.');
}

/* 틀렸을 때 부릅니다. 한도를 넘으면 잠깁니다. */
function secFail_(kind, who) {
  var L = SEC_LIMITS[kind] || SEC_LIMITS.pin;
  var k = secKey_(kind, who), c = secCache_();
  var o = { n: 0, until: 0 };
  try { o = JSON.parse(c.get(k) || '{"n":0,"until":0}'); } catch (e) {}
  o.n = (Number(o.n) || 0) + 1;
  if (o.n >= L.tries) { o.until = Date.now() + L.lockMin * 60000; o.n = 0; }
  c.put(k, JSON.stringify(o), (L.lockMin + 10) * 60);
  if (o.until && kind === 'admin') {
    secNotify_('관리자 비밀번호가 여러 번 틀려 잠겼어요',
      secNow_() + ' 에 담임 기록실 관리자 비밀번호가 ' + L.tries + '번 연속으로 틀려 ' + L.lockMin + '분 동안 잠겼습니다.\n' +
      '선생님이 직접 틀린 것이 아니라면 누군가 비밀번호를 맞혀 보려 한 것일 수 있어요.\n' +
      '[설정] 시트의 관리자비밀번호를 길고 새로운 것으로 바꾸는 것을 권합니다.');
  }
  if (o.until) {
    throw new Error(kind === 'admin'
      ? '비밀번호를 여러 번 틀렸습니다. ' + L.lockMin + '분 동안 잠깁니다.'
      : '여러 번 틀려서 ' + L.lockMin + '분 동안 잠겼어요. 담임 선생님께 말해 주세요.');
  }
  return L.tries - o.n;
}

/* 맞았을 때 부릅니다. */
function secOk_(kind, who) { try { secCache_().remove(secKey_(kind, who)); } catch (e) {} }

/* 길이와 내용이 달라도 걸리는 시간이 같도록 비교합니다. */
function secEqual_(a, b) {
  a = String(a == null ? '' : a); b = String(b == null ? '' : b);
  var n = Math.max(a.length, b.length), diff = a.length ^ b.length;
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* 클라이언트로 내보내면 안 되는 설정값은 가립니다. */
var SEC_HIDDEN = ['관리자비밀번호', 'PIN솔트', '연동키', '조회키', '교실_키', '교실_보기키', 'NEIS_키', '가입암호'];
function secSafeCfg_(cfg) {
  var out = {};
  Object.keys(cfg || {}).forEach(function (k) {
    if (SEC_HIDDEN.indexOf(k) >= 0) { out[k] = cfg[k] ? '(설정됨)' : ''; return; }
    out[k] = cfg[k];
  });
  return out;
}

/* ---------- 담임 로그인 알림 메일 ----------
 * 받는 주소: [설정] 시트의 '알림메일' (비어 있으면 이 스크립트 주인의 구글 메일)
 * 메일 보내기 권한이 처음 필요할 때는 편집기에서 '알림메일시험'을 한 번 실행해 권한을 허용해 주세요. */
function secNow_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }
function secNotify_(subject, body) {
  try {
    if (String(getConfig_()['로그인알림'] || '예') === '아니오') return;
    var to = String(getConfig_()['알림메일'] || '').trim();
    if (!to) to = Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(to, '[학급 다이어리] ' + subject, body + '\n\n— 학급 다이어리 자동 알림 (끄려면 [설정] 시트 로그인알림 = 아니오)');
  } catch (e) {}
}
/* 처음 보는 기기에서 담임으로 들어오면 알립니다. 기기 표시는 그 기기 브라우저에만 저장된 무작위 값입니다. */
function secAdminDevice_(dev, ua, where) {
  dev = String(dev || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  if (dev.length < 12) return;
  var P = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  var isNew = false;
  try {
    lock.waitLock(5000);
    var list = [];
    try { list = JSON.parse(P.getProperty('adm_devs') || '[]'); } catch (e) { list = []; }
    var h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, dev)).slice(0, 16);
    if (list.indexOf(h) < 0) { isNew = true; list.push(h); P.setProperty('adm_devs', JSON.stringify(list.slice(-30))); }
  } catch (e) {
    return;
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
  if (isNew) {
    secNotify_('새 기기에서 담임으로 로그인했어요',
      secNow_() + ' 에 처음 보는 기기에서 ' + (where || '담임 기록실') + '에 관리자 비밀번호로 들어왔습니다.\n' +
      '기기 정보: ' + String(ua || '알 수 없음').slice(0, 160) + '\n\n' +
      '선생님이 직접 로그인한 것이라면 이 메일은 무시하셔도 됩니다.\n' +
      '아니라면 [설정] 시트의 관리자비밀번호를 바로 바꿔 주세요.');
  }
}
/* 편집기에서 한 번 실행: 메일 보내기 권한을 허용하고 시험 메일을 받아 봅니다. */
function 알림메일시험() {
  var to = String(getConfig_()['알림메일'] || '').trim() || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(to, '[학급 다이어리] 알림 메일 시험', '이 메일이 보이면 담임 로그인 알림이 잘 설정된 것입니다.\n' + secNow_());
  Logger.log('시험 메일을 보냈습니다: ' + to);
}

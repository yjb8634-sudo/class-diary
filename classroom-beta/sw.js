/* 교실 화면 관리: 휴대폰 홈 화면에 앱처럼 설치하기 위한 작은 일꾼. 파일을 저장해 두지 않고 늘 새로 받습니다. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#1D2A25;color:#E4E0D3;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center"><div><h2>인터넷 연결을 확인해 주세요</h2><p>연결되면 다시 열어 주세요.</p></div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
});

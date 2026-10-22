var C = 'diary-site-v6';
var FILES = ['./', 'index.html', 'app.html', 'gas.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(C).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); })); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C && k !== 'diary-font' && k !== 'diary-site-v4-font'; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  /* 교실 화면 공용판(classroom/ · tv/)은 늘 새 파일을 받도록 저장하지 않습니다 */
  if (/\/(classroom|tv)\//.test(u.pathname)) return;
  if (u.pathname.indexOf('/fonts/') >= 0) {
    e.respondWith(caches.open('diary-font').then(function (c) {
      return c.match(e.request).then(function (r) {
        return r || fetch(e.request).then(function (n) { if (n.ok) c.put(e.request, n.clone()); return n; });
      });
    }));
    return;
  }
  e.respondWith(caches.open(C).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (r) {
      var net = fetch(e.request).then(function (n) {
        if (n.ok && n.type === 'basic') c.put(u.origin + u.pathname, n.clone());   /* 주소 뒤 ?… 는 빼고 저장 */
        return n;
      }).catch(function () { return r; });
      return r || net;
    });
  }));
});

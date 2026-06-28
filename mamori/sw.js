/* まもりのつるぎ – オフライン用サービスワーカー
   方針：本体HTML(index.html)は「ネット優先」＝オンラインなら必ず最新を取得し、
   オフライン時だけキャッシュを使う（更新がすぐ反映される）。
   アイコンなどの静的ファイルは「キャッシュ優先」で軽快に。
   ゲーム本体は index.html に内蔵なので、これで更新が確実に届く。 */
var VERSION = 'mamori-v4';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './icon-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () { }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== VERSION) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isHTML(req) {
  return req.mode === 'navigate' || /\.html(\?|$)/.test(req.url) || req.url.replace(/\?.*$/, '').endsWith('/');
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (isHTML(e.request)) {
    // ネット優先：最新を取りに行き、成功したらキャッシュ更新。失敗時のみキャッシュ。
    e.respondWith(
      fetch(e.request).then(function (resp) {
        var copy = resp.clone();
        caches.open(VERSION).then(function (c) { c.put('./index.html', copy); });
        return resp;
      }).catch(function () {
        return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
  } else {
    // 静的ファイル：キャッシュ優先
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (resp) {
          var copy = resp.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
          return resp;
        });
      })
    );
  }
});

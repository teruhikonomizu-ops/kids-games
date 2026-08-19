/* ふたりの島 – オフライン用サービスワーカー
   このゲームは家のWiFi内だけで配信している（外部には公開しない）。
   だから「ネット優先」の対象は index.html だけでなく game.js/data.js/sync.js も含める
   （まだ作り込み中のファイルなので、家のWiFi内にいる時は常に最新を取りに行きたい）。
   スマホが家の外にいて配信元に届かない時だけ、キャッシュ済みの内容で動く。
   アイコンなど滅多に変わらない物だけキャッシュ優先。 */
var VERSION = 'futarinoshima-v1';
var APP_FILES = ['./', './index.html', './data.js', './sync.js', './game.js'];
var STATIC_FILES = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './icon-180.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.all(APP_FILES.concat(STATIC_FILES).map(function (u) { return c.add(u).catch(function () {}); }));
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

function isAppFile(url) {
  return /\.(html|js)(\?|$)/.test(url) || url.replace(/\?.*$/, '').endsWith('/');
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (isAppFile(url)) {
    // ネット優先：家のWiFi内なら常に最新、圏外/配信元が落ちている時だけキャッシュ。
    e.respondWith(
      fetch(e.request).then(function (resp) {
        var copy = resp.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
        return resp;
      }).catch(function () {
        return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); });
      })
    );
  } else {
    // アイコン等：キャッシュ優先
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

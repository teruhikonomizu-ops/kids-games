// ふたりの島 — 保存・同期まわり
// ローカル保存（Firebase未設定時=単独端末で完結）と、Firebase Firestoreでの2端末同期を
// 同じ形のAPI（load / subscribe / mutate）で切り替えられるようにする。
// game.js 側はどちらのバックエンドかを意識しなくてよい。

// ---- 日付ユーティリティ（ローカル時刻基準。UTC変換によるズレ＝カレンダーの既知バグを避ける） ----
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function daysBetween(fromStr, toStr) {
  var f = fromStr.split('-'), t = toStr.split('-');
  var fd = Date.UTC(+f[0], +f[1] - 1, +f[2]);
  var td = Date.UTC(+t[0], +t[1] - 1, +t[2]);
  return Math.round((td - fd) / 86400000);
}
function addDaysStr(dateStr, n) {
  var p = dateStr.split('-');
  var dt = new Date(+p[0], +p[1] - 1, +p[2]);
  dt.setDate(dt.getDate() + n);
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}

// ---- 島IDと端末の紐づけ（デバイス内のlocalStorageに保存。島データ本体とは別） ----
var DEVICE_KEY = 'shima_device_v1';
function getDeviceBinding() {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY)); } catch (e) { return null; }
}
function setDeviceBinding(islandId, role) {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ islandId: islandId, role: role })); } catch (e) {}
}
function randomIslandId() {
  var chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // まぎらわしい文字(0/o,1/l/i)を除外
  var s = '';
  for (var i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---- 島の初期データ ----
function makeEmptyIsland() {
  var today = todayStr();
  return {
    version: 1,
    createdAt: today,
    kids: {
      a: { nickname: '', avatar: '' },
      b: { nickname: '', avatar: '' },
    },
    zones: {
      a: { plants: [], treasures: [], build: {} },
      b: { plants: [], treasures: [], build: {} },
    },
    buildKits: {
      a: { kitId: null, startedDay: null },
      b: { kitId: null, startedDay: null },
    },
    // projectIndex: PLAZA_SERIESの何本目か。1本終わる(全部品confirm)たびに進み、startedDay/placedをリセットする。
    plaza: { projectIndex: 0, startedDay: today, placed: {} }, // placed: { "0": true, ... }  order番号→確定済み
    beach: {
      a: { day: null, itemId: null, claimed: false },
      b: { day: null, itemId: null, claimed: false },
    },
    logbook: [],
    footprints: { a: [], b: [] },
    openLog: { a: [], b: [] },
  };
}

// ---- ローカル保存バックエンド（Firebase未接続時） ----
var LocalStore = {
  _key: function (islandId) { return 'shima_island_' + islandId; },
  _loadSync: function (islandId) {
    try {
      var raw = localStorage.getItem(this._key(islandId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  load: function (islandId) {
    return Promise.resolve(this._loadSync(islandId));
  },
  subscribe: function (islandId, cb, onError) {
    cb(this._loadSync(islandId)); // 他端末からの変更が無いので初回のみでよい
    return function unsubscribe() {};
  },
  mutate: function (islandId, updaterFn) {
    var cur = this._loadSync(islandId) || makeEmptyIsland();
    var next = updaterFn(cur);
    try {
      localStorage.setItem(this._key(islandId), JSON.stringify(next));
    } catch (e) {
      return Promise.reject(e); // 保存できていないのに成功扱いにしない（容量オーバー等）
    }
    return Promise.resolve(next);
  },
};

// ---- Firebase Firestoreバックエンド（2端末同期） ----
// FIREBASE_CONFIG が設定されている時だけ有効化される。
// 値はFirebaseの「クライアント設定」であり秘密鍵ではない（公開して問題ない）。
// アクセス制限はFirestoreのセキュリティルール側（islandIdを知っている端末だけがそのドキュメントに触れる）で行う。
var FIREBASE_CONFIG = null; // ← Firebaseプロジェクト作成後にここへ設定オブジェクトを貼る

var FirebaseStore = {
  _db: null,
  _ready: null,
  _init: function () {
    if (this._ready) return this._ready;
    var self = this;
    this._ready = new Promise(function (resolve) {
      firebase.initializeApp(FIREBASE_CONFIG);
      var db = firebase.firestore();
      try { db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* 対応していない環境は無視 */ }
      self._db = db;
      resolve(db);
    });
    return this._ready;
  },
  _ref: function (islandId) { return this._db.collection('islands').doc(islandId); },
  load: function (islandId) {
    var self = this;
    return this._init().then(function () {
      return self._ref(islandId).get().then(function (snap) { return snap.exists ? snap.data() : null; });
    });
  },
  subscribe: function (islandId, cb, onError) {
    var self = this;
    var unsub = function () {};
    var stopped = false;
    this._init().then(function () {
      if (stopped) return;
      unsub = self._ref(islandId).onSnapshot(function (snap) {
        cb(snap.exists ? snap.data() : null);
      }, function (err) {
        console.error('shima sync error', err);
        if (onError) onError(err); // 呼び出し元に伝える（放置すると画面が「よみこみちゅう」のまま固まる）
      });
    });
    return function () { stopped = true; unsub(); };
  },
  mutate: function (islandId, updaterFn) {
    var self = this;
    return this._init().then(function (db) {
      return db.runTransaction(function (tx) {
        return tx.get(self._ref(islandId)).then(function (snap) {
          var cur = snap.exists ? snap.data() : makeEmptyIsland();
          var next = updaterFn(cur);
          tx.set(self._ref(islandId), next);
          return next;
        });
      });
    });
  },
};

// ---- どちらを使うか自動選択 ----
var Store = FIREBASE_CONFIG ? FirebaseStore : LocalStore;

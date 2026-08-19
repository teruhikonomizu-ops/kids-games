// ふたりの島 — ゲーム本体
// data.js（中身）・sync.js（保存/同期）の上に、画面と操作をのせる。
// フレームワーク無し。#app に innerHTML を差し替え、クリックは1個の委譲リスナーで処理する。

var OTHER_ROLE = { a: 'b', b: 'a' };

var App = {
  islandId: null,
  myRole: null,
  island: null,
  loaded: false,
  loadError: false,
  tab: 'mine', // 'mine' | 'plaza' | 'sibling'
  wizard: null,
  unsub: null,
  selectedBuildItem: null, // 'erase' | BUILD_ITEMS の id | null（じゆうにつくるで今えらんでいる物。端末内だけの一時状態）
  scrollByTab: {}, // タブごとのスクロール位置（再描画で上に戻らないように）
  _renderedTab: null,
};

// 島ができてから何日たったか（畑のマス数・種・キット・アイテムの解放に使う）。
function elapsedDaysFor(isl, today) { return Math.max(0, daysBetween(isl.createdAt, today)); }
function plotsForDay(elapsedDays) {
  var n = PLOT_SCHEDULE[0].plots;
  for (var i = 0; i < PLOT_SCHEDULE.length; i++) if (elapsedDays >= PLOT_SCHEDULE[i].day) n = PLOT_SCHEDULE[i].plots;
  return n;
}

// ============== 起動 ==============
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('app').addEventListener('click', onAppClick);
  document.getElementById('modalRoot').addEventListener('click', onModalClick);
  boot();
});

function boot() {
  var params = new URLSearchParams(location.search);
  var joinId = params.get('join') ? params.get('join').trim() : '';
  var binding = getDeviceBinding();
  if (binding && binding.islandId && binding.role) {
    if (joinId && joinId !== binding.islandId) {
      // このスマホは既に別の島に紐づいている。黙って切り替えず、確認してから進める。
      App.wizard = { mode: 'join', step: 0, islandId: joinId, role: null, avatar: null, nickname: '',
        error: 'このスマホは もう べつの しまに なっているよ。すすめると そのしまに かわるよ' };
      renderWizard();
      return;
    }
    App.islandId = binding.islandId;
    App.myRole = binding.role;
    subscribeIsland();
    return;
  }
  if (joinId) {
    // 招待リンク(?join=コード)から開いた時も、手入力と同じ「コードをたしかめる」処理を必ず通す。
    // ※今は入口のUIからは辿れない（下記コメント参照）。手打ちでこのURLを開いた時だけの保険。
    App.wizard = { mode: 'join', step: 0, islandId: joinId, role: null, avatar: null, nickname: '', error: '' };
    renderWizard();
    resolveJoinCode(joinId);
    return;
  }
  // 今は「それぞれが自分のスマホで1人で遊ぶ」段階（2026-08-20のみさん指示）。
  // 「島に入る」（招待コードでの参加）は表に出さず、モード選びから直接はじめる。
  // 2人で共有したくなったらここを元の分岐（mode:null）に戻すだけでよい。
  App.wizard = { mode: 'create', step: 0, islandId: null, role: null, avatar: null, nickname: '', error: '' };
  renderWizard();
}

// コード(手入力 or 招待リンク)から島をたしかめ、あいている役割を決めてアイコン選びへ進む。
function resolveJoinCode(code) {
  App.wizard.error = '';
  Store.load(code).then(function (isl) {
    if (!isl) { App.wizard.error = 'みつからなかったよ。コードを かくにんしてね'; renderWizard(); return; }
    var openRoles = ['a', 'b'].filter(function (r) { return !isl.kids[r].nickname; });
    if (openRoles.length === 0) { App.wizard.error = 'この しまは もう 2にん そろっているよ'; renderWizard(); return; }
    App.wizard.islandId = code;
    App.wizard.role = openRoles[0];
    App.wizard.otherAvatar = isl.kids[OTHER_ROLE[openRoles[0]]] ? isl.kids[OTHER_ROLE[openRoles[0]]].avatar : null;
    App.wizard.step = 1;
    renderWizard();
  });
}

function subscribeIsland() {
  if (App.unsub) App.unsub();
  App.loadError = false;
  App.unsub = Store.subscribe(App.islandId, function (data) {
    App.loaded = true;
    App.island = data;
    if (data) recordOpenAndRender();
    else render();
  }, function () {
    // つながらなかった時に「よみこみちゅう…」のまま固まらないようにする。
    App.loaded = true;
    App.loadError = true;
    render();
  });
}

// 開いた記録（成功指標用。画面には出さない）を1回だけ足してから描画する。
var _openLogged = false;
function recordOpenAndRender() {
  if (_openLogged) { render(); return; }
  _openLogged = true;
  var today = todayStr();
  var log = App.island.openLog[App.myRole] || [];
  if (log.indexOf(today) === -1) {
    mutateIsland(function (isl) {
      isl.openLog[App.myRole] = (isl.openLog[App.myRole] || []).concat([today]);
      return isl;
    }).then(render);
  } else {
    render();
  }
}

function mutateIsland(updaterFn) {
  return Store.mutate(App.islandId, updaterFn).then(function (next) {
    App.island = next;
    return next;
  }).catch(function (err) {
    console.error('shima mutate error', err);
    toast('ほぞんできなかったよ…もういちど おしてね');
    throw err; // 呼び出し元の .then（成功トースト等）は動かさない
  });
}

// ============== 純粋計算（植物・キット・広場・漂着物） ==============
function findPlantKind(kindId) {
  for (var i = 0; i < PLANTS.length; i++) if (PLANTS[i].id === kindId) return PLANTS[i];
  return null;
}
function findLogbookItem(itemId) {
  for (var i = 0; i < LOGBOOK_ITEMS.length; i++) if (LOGBOOK_ITEMS[i].id === itemId) return LOGBOOK_ITEMS[i];
  return null;
}
function findKitDef(role, kitId) {
  var list = KID_KITS[role] || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === kitId) return list[i];
  return null;
}
function findBuildItem(itemId) {
  for (var i = 0; i < BUILD_ITEMS.length; i++) if (BUILD_ITEMS[i].id === itemId) return BUILD_ITEMS[i];
  return null;
}
function unlockedList(list, elapsedDays) {
  return list.filter(function (x) { return x.unlockDay <= elapsedDays; });
}
// 育ち具合＝(植えた日, 水やりした日の集合, 今日)だけで決まる純粋計算。毎日水やり=標準速度、無くても半分の速さで必ず咲く。
function plantProgress(plant, today) {
  var kind = findPlantKind(plant.kindId);
  if (!kind) return { ratio: 1, bloomed: true, kind: null, wateredToday: false };
  var elapsed = daysBetween(plant.plantedDate, today);
  var waterSet = {};
  for (var i = 0; i < plant.waterDays.length; i++) waterSet[plant.waterDays[i]] = true;
  var points = 0;
  for (var d = 0; d < elapsed; d++) points += waterSet[addDaysStr(plant.plantedDate, d)] ? 1 : 0.5;
  var ratio = Math.min(1, points / kind.days);
  return { ratio: ratio, bloomed: ratio >= 1, kind: kind, wateredToday: !!waterSet[today] };
}
// キットの完成部品数＝開始日と今日だけで決まる純粋計算（1日1部品、行動不要）。
function kitPartsBuilt(kitState, kitDef, today) {
  if (!kitState || !kitState.kitId || !kitDef) return 0;
  var elapsed = daysBetween(kitState.startedDay, today);
  return Math.max(0, Math.min(kitDef.parts, elapsed + 1));
}
// 広場は「シリーズ」。今どの1本を作っているかは isl.plaza.projectIndex
// （古いデータで未設定の時は0＝1本目として扱う）。全部終わったら null（お祝い表示）。
function plazaProjectIndex(isl) { return isl.plaza.projectIndex || 0; }
function plazaCurrentProject(isl) {
  return PLAZA_SERIES[plazaProjectIndex(isl)] || null;
}
function plazaUnlockedCount(plazaState, today, totalParts) {
  var elapsed = daysBetween(plazaState.startedDay, today);
  return Math.max(0, Math.min(totalParts, elapsed + 1));
}
function randomId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function hashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}
function todaysDriftwoodItem(islandId, role, dateStr) {
  var pool = [];
  for (var i = 0; i < LOGBOOK_ITEMS.length; i++) {
    var w = LOGBOOK_ITEMS[i].rare ? 1 : 3;
    for (var k = 0; k < w; k++) pool.push(LOGBOOK_ITEMS[i]);
  }
  return pool[hashStr(islandId + '|' + role + '|' + dateStr) % pool.length];
}
function ensureTodaysBeach(isl, role, today) {
  var b = isl.beach[role];
  if (b.day !== today) {
    var item = todaysDriftwoodItem(App.islandId, role, today);
    isl.beach[role] = { day: today, itemId: item.id, claimed: false };
  }
  return isl;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ============== セットアップ・ウィザード ==============
function renderWizard() {
  var w = App.wizard;
  var html = '';
  if (!w.mode) {
    html = wizardShell('ふたりの島 🏝️', 'はじめまして！', [
      '<button class="bigcard" data-act="w-mode" data-mode="create"><div class="bigcard-emoji">🌱</div><div class="bigcard-label">あたらしい<br>島をつくる</div></button>',
      '<button class="bigcard" data-act="w-mode" data-mode="join"><div class="bigcard-emoji">🔑</div><div class="bigcard-label">島に<br>入る</div></button>',
    ].join(''), null);
  } else if (w.mode === 'create' && w.step === 0) {
    html = wizardShell('このスマホは？', 'どっちの島にする？', roleCards(), null);
  } else if (w.mode === 'join' && w.step === 0) {
    html = wizardShell('島に入る', 'まねきコードを 入れてね', joinCodeForm(w), null);
  } else if (w.step === 1) {
    html = wizardShell('アイコンをえらんでね', '', avatarGrid(w), backBtn());
  } else if (w.step === 2) {
    html = wizardShell('なまえは？', '', nicknameForm(w), backBtn());
  } else if (w.step === 3) {
    html = wizardShell(w.mode === 'create' ? 'この しまを つくる？' : 'この しまに 入る？', '', confirmCard(w), backBtn());
  } else if (w.step === 4) {
    html = inviteScreen(w);
  }
  document.getElementById('app').innerHTML = html;
}
function wizardShell(title, sub, body, backHtml) {
  return '<div class="wizwrap"><div class="wizcard">' +
    (backHtml || '') +
    '<h1 class="wiztitle">' + esc(title) + '</h1>' +
    (sub ? '<p class="wizsub">' + esc(sub) + '</p>' : '') +
    '<div class="wizbody">' + body + '</div>' +
    '</div></div>';
}
function backBtn() { return '<button class="backbtn" data-act="w-back">← もどる</button>'; }
function roleCards() {
  return ['a', 'b'].map(function (r) {
    return '<button class="bigcard" data-act="w-role" data-role="' + r + '">' +
      '<div class="bigcard-emoji">' + (r === 'a' ? '🐣' : '🦊') + '</div>' +
      '<div class="bigcard-label">' + KID_ROLES[r].label + 'モード</div>' +
      '<div class="bigcard-sub">' + KID_ROLES[r].sub + '</div></button>';
  }).join('');
}
function joinCodeForm(w) {
  return '<input id="joinCodeInput" class="bigtext" maxlength="12" placeholder="れい: ab3xy9zq" value="' + esc(w.islandId || '') + '" autocapitalize="none" autocomplete="off" />' +
    (w.error ? '<p class="wizerror">' + esc(w.error) + '</p>' : '') +
    '<button class="nextbtn" data-act="w-join-code">つぎへ →</button>';
}
function avatarGrid(w) {
  var taken = w.otherAvatar;
  return '<div class="avatargrid">' + AVATAR_ICONS.map(function (ic) {
    var disabled = taken && taken === ic;
    return '<button class="avatarbtn' + (w.avatar === ic ? ' selected' : '') + (disabled ? ' disabled' : '') + '" ' +
      (disabled ? '' : 'data-act="w-avatar" data-avatar="' + ic + '"') + '>' + ic + '</button>';
  }).join('') + '</div>' +
  '<button class="nextbtn" data-act="w-avatar-next"' + (w.avatar ? '' : ' disabled') + '>つぎへ →</button>';
}
function nicknameForm(w) {
  return '<input id="nickInput" class="bigtext" maxlength="8" placeholder="なまえ（8もじまで）" value="' + esc(w.nickname || '') + '" />' +
    '<button class="nextbtn" data-act="w-nick-next">つぎへ →</button>';
}
function confirmCard(w) {
  return '<div class="confirmrow"><span class="confirmavatar">' + w.avatar + '</span><span class="confirmname">' + esc(w.nickname) + '</span></div>' +
    '<p class="wizsub">' + (w.mode === 'create' ? KID_ROLES[w.role].label + 'モードで つくるよ' : 'このコードの島に 入るよ：' + esc(w.islandId)) + '</p>' +
    '<button class="nextbtn" data-act="w-confirm">' + (w.mode === 'create' ? 'しまを つくる 🏝️' : 'しまに 入る 🏝️') + '</button>';
}
function inviteScreen(w) {
  var link = location.origin + location.pathname + '?join=' + App.islandId;
  return '<div class="wizwrap"><div class="wizcard">' +
    '<h1 class="wiztitle">できた！🎉</h1>' +
    '<p class="wizsub">もう1つのスマホでも このゲームを ひらいて、<br>「島に入る」→ 下のコードを 入れてね</p>' +
    '<div class="invitecode">' + esc(App.islandId) + '</div>' +
    '<div class="wizbody">' +
    '<button class="nextbtn secondary" data-act="w-copy-link" data-link="' + esc(link) + '">リンクを コピー</button>' +
    '<button class="nextbtn" data-act="w-done">できた！あそぶ →</button>' +
    '</div></div></div>';
}

function onAppClick(e) { handleDelegatedClick(e); }
function onModalClick(e) { handleDelegatedClick(e); }
function handleDelegatedClick(e) {
  var el = e.target.closest('[data-act]');
  if (!el || el.hasAttribute('disabled')) return;
  var d = el.dataset;
  if (d.act === 'closemodal') { closeModal(); return; }
  if (d.act === 'noop') return;
  var handler = ACTIONS[d.act];
  if (handler) handler(d, el);
}

var ACTIONS = {
  'w-mode': function (d) { App.wizard.mode = d.mode; App.wizard.step = 0; renderWizard(); },
  'w-back': function () {
    var w = App.wizard;
    if (w.step > 0) w.step -= 1; else w.mode = null;
    renderWizard();
  },
  'w-role': function (d) { App.wizard.role = d.role; App.wizard.step = 1; renderWizard(); },
  'w-join-code': function () {
    var code = document.getElementById('joinCodeInput').value.trim().toLowerCase();
    if (!code) { App.wizard.error = 'コードを入れてね'; renderWizard(); return; }
    resolveJoinCode(code);
  },
  'w-avatar': function (d) { App.wizard.avatar = d.avatar; renderWizard(); },
  'w-avatar-next': function () { if (App.wizard.avatar) { App.wizard.step = 2; renderWizard(); } },
  'w-nick-next': function () {
    var v = document.getElementById('nickInput').value.trim();
    if (!v) return;
    App.wizard.nickname = v.slice(0, 8);
    App.wizard.step = 3;
    renderWizard();
  },
  'w-confirm': function () {
    var w = App.wizard;
    if (w.mode === 'create') {
      var newId = randomIslandId();
      var myNickname = w.nickname, myAvatar = w.avatar, myRole = w.role;
      Store.mutate(newId, function (isl) {
        isl.kids[myRole] = { nickname: myNickname, avatar: myAvatar };
        return isl;
      }).then(function () {
        // 書き込みが成功してから端末に紐づける（途中で失敗した「幽霊の紐づけ」を防ぐ）。
        App.islandId = newId;
        App.myRole = myRole;
        setDeviceBinding(newId, myRole);
        // 今は1人で遊ぶ段階なので、招待コード画面は出さずそのまま遊びはじめる。
        subscribeIsland();
        toast('しまが できたよ！🏝️');
      }).catch(function () { toast('つくれなかったよ…もういちど おしてね'); });
    } else {
      var islandId = w.islandId, wantRole = w.role;
      var joinNickname = w.nickname, joinAvatar = w.avatar;
      Store.mutate(islandId, function (isl) {
        // 役割は書き込みの瞬間に読み直して決める（他の端末とほぼ同時に入っても取り合いにならないように）。
        var openRoles = ['a', 'b'].filter(function (r) { return !isl.kids[r].nickname; });
        var role = openRoles.indexOf(wantRole) !== -1 ? wantRole : openRoles[0];
        if (role) isl.kids[role] = { nickname: joinNickname, avatar: joinAvatar };
        return isl;
      }).then(function (next) {
        var gotRole = (next.kids.a.nickname === joinNickname && next.kids.a.avatar === joinAvatar) ? 'a'
          : (next.kids.b.nickname === joinNickname && next.kids.b.avatar === joinAvatar) ? 'b' : null;
        if (!gotRole) {
          App.wizard.mode = 'join'; App.wizard.step = 0;
          App.wizard.error = 'この しまは もう 2にん そろっているよ';
          renderWizard();
          return;
        }
        App.islandId = islandId;
        App.myRole = gotRole;
        setDeviceBinding(islandId, gotRole);
        subscribeIsland();
      }).catch(function () { toast('入れなかったよ…もういちど おしてね'); });
    }
  },
  'w-copy-link': function (d) {
    var link = d.link;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { toast('コピーしたよ！'); });
    } else { toast(link); }
  },
  'w-done': function () { subscribeIsland(); },
  'retry-connect': function () { subscribeIsland(); },

  'tab': function (d) { App.tab = d.tab; render(); },
  'dismiss-footprints': function () {
    // 表示していた時点の件数だけ先頭から消す（「わかった」を押す直前に届いた新しい知らせを消さないため）。
    var shownCount = ((App.island && App.island.footprints[App.myRole]) || []).length;
    mutateIsland(function (isl) {
      var cur = isl.footprints[App.myRole] || [];
      isl.footprints[App.myRole] = cur.slice(shownCount);
      return isl;
    }).then(render);
  },
  'open-logbook': function () { openModal(logbookModalHtml()); },
  'open-plot': function (d) { onPlotTap(d.zone, +d.slot); },
  'water-plant': function (d) { waterPlant(d.zone, +d.slot); },
  'harvest-plant': function (d) { harvestPlant(d.zone, +d.slot); },
  'pick-seed': function (d) { plantSeed(App.myRole, +d.slot, d.kind); closeModal(); },
  'claim-driftwood': function () { claimDriftwood(); },
  'gift-treasure': function (d) { giftTreasure(d.tid); },
  'open-kitpicker': function () { openModal(kitPickerModalHtml()); },
  'pick-kit': function (d) { startKit(d.kit); closeModal(); },
  'confirm-plaza': function (d) { confirmPlazaPart(+d.order); },
  'select-build-item': function (d) {
    App.selectedBuildItem = App.selectedBuildItem === d.item ? null : d.item;
    render();
  },
  'build-cell': function (d) { buildCellTap(d.zone, +d.cell); },
};

// ============== メイン画面 ==============
function render() {
  if (App.loadError) { document.getElementById('app').innerHTML = loadErrorHtml(); return; }
  if (!App.loaded) { document.getElementById('app').innerHTML = loadingHtml(); return; }
  if (!App.island) { document.getElementById('app').innerHTML = loadingHtml(); return; }
  var isl = App.island;
  var today = todayStr();
  // ここでは isl（=App.island）を直接書き換えない。読むだけにして、実際の反映は
  // 下のmutateIslandの中（＝実際に保存できた時）だけで行う（保存前に画面上だけ「今日」になるのを防ぐ）。
  var needsBeachRoll = isl.beach.a.day !== today || isl.beach.b.day !== today;
  var curProject = plazaCurrentProject(isl);
  var placedCount = Object.keys(isl.plaza.placed || {}).length;
  var canAdvance = !!(curProject && placedCount >= curProject.parts);
  if (needsBeachRoll || canAdvance) {
    mutateIsland(function (i) {
      ensureTodaysBeach(i, 'a', today);
      ensureTodaysBeach(i, 'b', today);
      var proj = plazaCurrentProject(i);
      var placed = Object.keys(i.plaza.placed || {}).length;
      if (proj && placed >= proj.parts) {
        i.plaza = { projectIndex: plazaProjectIndex(i) + 1, startedDay: today, placed: {} };
      }
      return i;
    }).then(render).catch(function () { /* mutateIsland側でトースト済み。ここでは再描画しない */ });
    return;
  }

  var me = isl.kids[App.myRole];
  var elapsedDays = elapsedDaysFor(isl, today);

  // 再描画のたびに一覧が上に戻ると、連続タップする操作（じゆうにつくる等）が使いにくい。
  // 同じタブの中での再描画ならスクロール位置を保つ（タブ切替時だけ上端に戻す）。
  var prevContent = document.querySelector('.tabcontent');
  if (prevContent && App._renderedTab === App.tab) App.scrollByTab[App.tab] = prevContent.scrollTop;

  // 今は1人で遊ぶ段階なので、タブ切替は無し。自分の島だけを表示する
  // （きょうだい・ひろばタブは、2人で共有できるようにする時に tabbarHtml/tabContentHtml を使って復活させる）。
  document.getElementById('app').innerHTML =
    '<div class="shell">' +
    headerHtml(elapsedDays) +
    footprintBannerHtml(isl) +
    '<div class="tabcontent solo">' + zoneHtml(isl, today, elapsedDays, App.myRole, true, me) + '</div>' +
    '</div>';

  var newContent = document.querySelector('.tabcontent');
  if (newContent) newContent.scrollTop = App.scrollByTab[App.tab] || 0;
  App._renderedTab = App.tab;
}
function loadingHtml() { return '<div class="loadingwrap">🏝️<br>しまを よみこみちゅう…</div>'; }
function loadErrorHtml() {
  return '<div class="loadingwrap">😢<br>つながらなかったよ' +
    '<button class="nextbtn" data-act="retry-connect">もういちど 🔄</button></div>';
}

function headerHtml(elapsedDays) {
  return '<div class="header"><span class="headertitle">🏝️ ふたりの島</span>' +
    '<span class="headersub">できて ' + (elapsedDays + 1) + 'にちめ</span></div>';
}
function tabbarHtml(me, sib) {
  var tabs = [
    { id: 'mine', icon: me.avatar || '🏝️', label: me.nickname || 'わたし' },
    { id: 'plaza', icon: '🤝', label: 'ひろば' },
    { id: 'sibling', icon: sib.avatar || '👤', label: sib.nickname || 'きょうだい' },
  ];
  return '<div class="tabbar">' + tabs.map(function (t) {
    return '<button class="tabbtn' + (App.tab === t.id ? ' active' : '') + '" data-act="tab" data-tab="' + t.id + '">' +
      '<span class="tabicon">' + t.icon + '</span><span class="tablabel">' + esc(t.label) + '</span></button>';
  }).join('') + '</div>';
}
function footprintBannerHtml(isl) {
  var fp = isl.footprints[App.myRole] || [];
  if (fp.length === 0) return '';
  var lines = fp.map(function (f) {
    var byName = isl.kids[f.by] ? (isl.kids[f.by].avatar + ' ' + esc(isl.kids[f.by].nickname)) : '';
    if (f.type === 'water') {
      var k = findPlantKind(f.detail);
      return byName + ' が ' + (k ? k.emoji + k.name : 'しょくぶつ') + ' に みずをくれたよ';
    }
    var it = findLogbookItem(f.detail);
    return byName + ' から ' + (it ? it.emoji + ' ' + it.name : 'プレゼント') + ' を もらったよ！';
  });
  return '<div class="footbanner">' +
    '<div class="footlines">' + lines.map(function (l) { return '<div>' + l + '</div>'; }).join('') + '</div>' +
    '<button class="footok" data-act="dismiss-footprints">わかった！</button></div>';
}

function tabContentHtml(isl, today, elapsedDays, me, sib) {
  if (App.tab === 'mine') return zoneHtml(isl, today, elapsedDays, App.myRole, true, me);
  if (App.tab === 'sibling') return zoneHtml(isl, today, elapsedDays, OTHER_ROLE[App.myRole], false, sib);
  return plazaHtml(isl, today);
}

// ---- 区画（自分/きょうだい共通。ownerかどうかで操作を変える） ----
function zoneHtml(isl, today, elapsedDays, zoneRole, isOwner, kid) {
  var zone = isl.zones[zoneRole];
  var beach = isl.beach[zoneRole];
  var driftItem = findLogbookItem(beach.itemId) || { emoji: '❔', name: 'なぞの もの' };
  var kitState = isl.buildKits[zoneRole];
  var kitDef = kitState.kitId ? findKitDef(zoneRole, kitState.kitId) : null;
  var built = kitDef ? kitPartsBuilt(kitState, kitDef, today) : 0;
  var plotCount = plotsForDay(elapsedDays);
  var hasSibling = !!isl.kids[OTHER_ROLE[zoneRole]].nickname; // 今は1人で遊ぶ段階なら false（プレゼント等を出さない）

  var html = '<div class="zone">';

  // 浜辺
  html += '<div class="beachbox"><div class="beachlabel">🏖️ ' + esc(kid.nickname || 'きょうだい') + 'の はまべ</div>';
  if (isOwner) {
    if (!beach.claimed) {
      html += '<button class="driftbtn" data-act="claim-driftwood"><span class="driftemoji">' + driftItem.emoji + '</span><span class="driftname">' + driftItem.name + '</span><span class="driftnew">ひろう！</span></button>';
    } else {
      html += '<div class="driftdone">' + driftItem.emoji + ' きょうの ひろいもの ✓</div>';
    }
    var treas = zone.treasures || [];
    if (treas.length > 0) {
      html += '<div class="treasurerow">' + treas.map(function (t) {
        var it = findLogbookItem(t.itemId) || { emoji: '❔' };
        var giftBtn = hasSibling ? '<button class="giftbtn" data-act="gift-treasure" data-tid="' + esc(t.tid) + '">🎁 あげる</button>' : '';
        return '<span class="treasureitem">' + it.emoji + giftBtn + '</span>';
      }).join('') + '</div>';
    }
    html += '<button class="logbookbtn small" data-act="open-logbook">📖 ずかん（' + isl.logbook.length + '/' + LOGBOOK_ITEMS.length + '）</button>';
  } else {
    html += '<div class="driftdone">' + (beach.claimed ? driftItem.emoji + ' もう ひろったよ' : '🌊 まだ ひろってないみたい') + '</div>';
  }
  html += '</div>';

  // 畑
  html += '<div class="plotgrid">';
  for (var slot = 0; slot < plotCount; slot++) {
    var plant = findPlantAt(zone.plants, slot);
    html += plotHtml(zoneRole, slot, plant, today, isOwner);
  }
  html += '</div>';

  // 建築キット
  html += '<div class="kitbox">';
  if (!kitDef) {
    if (isOwner) {
      html += '<button class="kitpickbtn" data-act="open-kitpicker">🔨 けんちくを はじめる</button>';
    } else {
      html += '<div class="kitempty">まだ けんちく してないみたい</div>';
    }
  } else {
    var pct = built / kitDef.parts;
    html += '<div class="kitcard2"><span class="kitemoji" style="opacity:' + (0.35 + 0.65 * pct) + ';transform:scale(' + (0.7 + 0.3 * pct) + ')">' + kitDef.emoji + '</span>' +
      '<div class="kitinfo"><div class="kitname">' + kitDef.name + '</div><div class="kitdots">' + dotsHtml(built, kitDef.parts) + '</div></div></div>';
    if (built >= kitDef.parts && isOwner) {
      html += '<button class="kitpickbtn small" data-act="open-kitpicker">🔨 つぎの けんちく</button>';
    }
  }
  html += '</div>';

  // じゆうにつくる（マイクラ的な自由配置。材料は無限、いつでも置いたり消したりできる）
  html += buildCanvasHtml(zone, elapsedDays, zoneRole, isOwner);

  html += '</div>';
  return html;
}
function buildCanvasHtml(zone, elapsedDays, zoneRole, isOwner) {
  var build = zone.build || {};
  var html = '<div class="buildbox"><div class="buildlabel">🧱 じゆうに つくる</div>';
  if (isOwner) {
    var items = unlockedList(BUILD_ITEMS, elapsedDays);
    html += '<div class="palette">';
    html += '<button class="paletteitem eraser' + (App.selectedBuildItem === 'erase' ? ' selected' : '') + '" data-act="select-build-item" data-item="erase">🧹</button>';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html += '<button class="paletteitem' + (App.selectedBuildItem === it.id ? ' selected' : '') + '" data-act="select-build-item" data-item="' + it.id + '">' + it.emoji + '</button>';
    }
    html += '</div>';
  }
  html += '<div class="buildgrid">';
  for (var c = 0; c < BUILD_GRID_CELLS; c++) {
    var placedId = build[String(c)];
    var placedItem = placedId ? findBuildItem(placedId) : null;
    var act = isOwner ? ' data-act="build-cell" data-zone="' + zoneRole + '" data-cell="' + c + '"' : '';
    html += '<button class="buildcell' + (placedItem ? ' filled' : '') + '"' + act + '>' + (placedItem ? placedItem.emoji : '') + '</button>';
  }
  html += '</div></div>';
  return html;
}
function findPlantAt(plants, slot) {
  for (var i = 0; i < plants.length; i++) if (plants[i].slot === slot) return plants[i];
  return null;
}
function dotsHtml(built, total) {
  var s = '';
  for (var i = 0; i < total; i++) s += '<span class="dot' + (i < built ? ' filled' : '') + '"></span>';
  return s;
}
function plotHtml(zoneRole, slot, plant, today, isOwner) {
  if (!plant) {
    return '<button class="plot empty" data-act="open-plot" data-zone="' + zoneRole + '" data-slot="' + slot + '">' +
      (isOwner ? '<span class="plotplus">＋</span>' : '<span class="plotplus faint">🌾</span>') + '</button>';
  }
  var prog = plantProgress(plant, today);
  var emoji = prog.kind ? prog.kind.emoji : '❔'; // 種類データが後から消えても壊れないように
  if (prog.bloomed) {
    var act = isOwner ? 'data-act="harvest-plant" data-zone="' + zoneRole + '" data-slot="' + slot + '"' : '';
    return '<button class="plot bloom" ' + act + '><span class="plotemoji bloomanim">' + emoji + '</span>' +
      (isOwner ? '<span class="plotsub">とる！</span>' : '<span class="plotsub">✨</span>') + '</button>';
  }
  var scale = (0.45 + 0.55 * prog.ratio).toFixed(2);
  var op = (0.55 + 0.45 * prog.ratio).toFixed(2);
  return '<button class="plot growing" data-act="water-plant" data-zone="' + zoneRole + '" data-slot="' + slot + '">' +
    '<span class="plotemoji" style="transform:scale(' + scale + ');opacity:' + op + '">' + emoji + '</span>' +
    '<span class="plotsub">' + (prog.wateredToday ? '💧済' : '💧あげる') + '</span></button>';
}

// ---- 広場（シリーズ。1本終わると次が始まる） ----
function plazaHtml(isl, today) {
  var project = plazaCurrentProject(isl);
  var html = '<div class="plaza">';

  if (!project) {
    html += '<div class="plazahead"><span class="kitemoji big">🏆</span><div class="kitname">ぜんぶ できたよ！</div></div>';
  } else {
    var placedMap = isl.plaza.placed || {};
    var seq = plazaRoleSequence(project.parts);
    var unlocked = plazaUnlockedCount(isl.plaza, today, project.parts);
    var placedCount = Object.keys(placedMap).length;
    var pct = placedCount / project.parts;
    html += '<div class="plazahead"><span class="kitemoji big" style="opacity:' + (0.3 + 0.7 * pct) + ';transform:scale(' + (0.6 + 0.4 * pct) + ')">' + project.emoji + '</span>' +
      '<div class="kitname">' + project.name + '</div>' +
      '<div class="plazaseriescount">' + (plazaProjectIndex(isl) + 1) + ' / ' + PLAZA_SERIES.length + 'こめ</div></div>';
    html += '<div class="plazaparts">';
    var nudge = '';
    for (var i = 0; i < project.parts; i++) {
      var role = seq[i];
      var isUnlocked = i < unlocked;
      var isPlaced = !!placedMap[i];
      var roleKid = isl.kids[role];
      var cls = 'plazapart' + (isPlaced ? ' placed' : isUnlocked ? ' unlocked' : ' locked');
      var inner = isPlaced ? '✅' : isUnlocked ? (roleKid.avatar || '❓') : '🔒';
      var canConfirm = isUnlocked && !isPlaced && role === App.myRole;
      html += '<button class="' + cls + '"' + (canConfirm ? ' data-act="confirm-plaza" data-order="' + i + '"' : '') + '>' + inner + '</button>';
      if (isUnlocked && !isPlaced && role !== App.myRole && !nudge) {
        nudge = roleKid.nickname
          ? (roleKid.avatar + ' ' + esc(roleKid.nickname) + ' に おねがいしてみよう')
          : 'もう1人が 島に入ったら、いっしょに つくれるよ';
      }
    }
    html += '</div>';
    if (nudge) html += '<div class="plazanudge">' + nudge + '</div>';
  }
  html += '<button class="logbookbtn" data-act="open-logbook">📖 2人の島の図鑑（' + isl.logbook.length + '/' + LOGBOOK_ITEMS.length + '）</button>';
  html += '</div>';
  return html;
}

// ---- モーダル：図鑑 ----
function logbookModalHtml() {
  var isl = App.island;
  var html = '<h2 class="modaltitle">📖 2人の島の図鑑</h2><div class="logbookgrid">';
  for (var i = 0; i < LOGBOOK_ITEMS.length; i++) {
    var it = LOGBOOK_ITEMS[i];
    var found = isl.logbook.indexOf(it.id) !== -1;
    html += '<div class="logcell' + (found ? ' found' : '') + (it.rare && found ? ' rare' : '') + '">' +
      (found ? it.emoji : '❔') + '</div>';
  }
  html += '</div><button class="nextbtn" data-act="closemodal">とじる</button>';
  return html;
}
// ---- モーダル：種えらび ----
function seedPickerModalHtml(zone, slot) {
  var elapsedDays = elapsedDaysFor(App.island, todayStr());
  var list = unlockedList(PLANTS, elapsedDays);
  var html = '<h2 class="modaltitle">なにを うえる？</h2><div class="seedgrid">';
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    html += '<button class="seedbtn" data-act="pick-seed" data-kind="' + p.id + '" data-slot="' + slot + '">' +
      '<span class="seedemoji">' + p.emoji + '</span><span class="seedname">' + p.name + '</span>' +
      '<span class="seeddays">' + p.days + 'にち</span></button>';
  }
  html += '</div><button class="nextbtn secondary" data-act="closemodal">やめる</button>';
  return html;
}
// ---- モーダル：キットえらび ----
function kitPickerModalHtml() {
  var elapsedDays = elapsedDaysFor(App.island, todayStr());
  var list = unlockedList(KID_KITS[App.myRole] || [], elapsedDays);
  var html = '<h2 class="modaltitle">なにを つくる？</h2><div class="seedgrid">';
  for (var i = 0; i < list.length; i++) {
    var k = list[i];
    html += '<button class="seedbtn" data-act="pick-kit" data-kit="' + k.id + '">' +
      '<span class="seedemoji">' + k.emoji + '</span><span class="seedname">' + k.name + '</span>' +
      '<span class="seeddays">' + k.parts + 'にち</span></button>';
  }
  html += '</div><button class="nextbtn secondary" data-act="closemodal">やめる</button>';
  return html;
}

function openModal(html) {
  document.getElementById('modalRoot').innerHTML =
    '<div class="modalbg" data-act="closemodal"><div class="modalcard" data-act="noop">' + html + '</div></div>';
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
var _toastTimer = null;
function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
}

// ============== 操作 ==============
function onPlotTap(zone, slot) {
  if (zone !== App.myRole) return; // 自分の区画だけ「植える」ができる
  openModal(seedPickerModalHtml(zone, slot));
}
function plantSeed(zone, slot, kindId) {
  var today = todayStr();
  mutateIsland(function (isl) {
    var plants = isl.zones[zone].plants.filter(function (p) { return p.slot !== slot; });
    plants.push({ slot: slot, kindId: kindId, plantedDate: today, waterDays: [] });
    isl.zones[zone].plants = plants;
    return isl;
  }).then(function () { render(); toast('うえたよ！ 🌱'); });
}
function waterPlant(zone, slot) {
  var today = todayStr();
  mutateIsland(function (isl) {
    var plant = findPlantAt(isl.zones[zone].plants, slot);
    if (!plant) return isl;
    if (plant.waterDays.indexOf(today) === -1) {
      plant.waterDays.push(today);
      if (zone !== App.myRole) {
        isl.footprints[zone] = (isl.footprints[zone] || []).concat([{ type: 'water', by: App.myRole, detail: plant.kindId, at: today }]);
      }
    }
    return isl;
  }).then(function () { render(); toast('💧 みずをあげたよ'); });
}
function harvestPlant(zone, slot) {
  if (zone !== App.myRole) return;
  var today = todayStr();
  mutateIsland(function (isl) {
    var plants = isl.zones[zone].plants;
    var plant = findPlantAt(plants, slot);
    if (!plant) return isl;
    var prog = plantProgress(plant, today);
    if (!prog.bloomed) return isl;
    isl.zones[zone].plants = plants.filter(function (p) { return p.slot !== slot; });
    return isl;
  }).then(function () { render(); toast('やったね！ ✨'); });
}
function claimDriftwood() {
  var today = todayStr();
  mutateIsland(function (isl) {
    var beach = isl.beach[App.myRole];
    if (beach.day !== today || beach.claimed) return isl;
    beach.claimed = true;
    isl.zones[App.myRole].treasures = (isl.zones[App.myRole].treasures || []).concat([{ tid: randomId(), itemId: beach.itemId, from: 'found', at: today }]);
    if (isl.logbook.indexOf(beach.itemId) === -1) isl.logbook = isl.logbook.concat([beach.itemId]);
    return isl;
  }).then(function () { render(); toast('ひろったよ！ 📖'); });
}
function giftTreasure(tid) {
  var today = todayStr();
  var other = OTHER_ROLE[App.myRole];
  mutateIsland(function (isl) {
    var treas = isl.zones[App.myRole].treasures || [];
    var item = null;
    var rest = treas.filter(function (t) { if (t.tid === tid) { item = t; return false; } return true; });
    if (!item) return isl; // 別の操作で既に消えていたら何もしない（idベースなので安全）
    isl.zones[App.myRole].treasures = rest;
    isl.zones[other].treasures = (isl.zones[other].treasures || []).concat([{ tid: randomId(), itemId: item.itemId, from: 'gift', at: today }]);
    isl.footprints[other] = (isl.footprints[other] || []).concat([{ type: 'gift', by: App.myRole, detail: item.itemId, at: today }]);
    return isl;
  }).then(function () { render(); toast('プレゼントしたよ！ 🎁'); });
}
function startKit(kitId) {
  var today = todayStr();
  mutateIsland(function (isl) {
    isl.buildKits[App.myRole] = { kitId: kitId, startedDay: today };
    return isl;
  }).then(function () { render(); toast('けんちく はじめた！ 🔨'); });
}
function confirmPlazaPart(order) {
  mutateIsland(function (isl) {
    var proj = plazaCurrentProject(isl);
    if (!proj || order >= proj.parts) return isl; // 表示していた間にシリーズが先へ進んでいたら何もしない
    if (!isl.plaza.placed) isl.plaza.placed = {};
    isl.plaza.placed[String(order)] = true;
    return isl;
  }).then(function () { render(); toast('できた！ 🎉'); });
}
function buildCellTap(zone, cell) {
  if (zone !== App.myRole) return; // 自分の区画だけ「じゆうにつくる」ができる
  var sel = App.selectedBuildItem;
  if (!sel) { toast('したの 絵から えらんでね'); return; }
  var elapsedDays = elapsedDaysFor(App.island, todayStr());
  if (sel !== 'erase' && !findBuildItem(sel)) return;
  if (sel !== 'erase' && !unlockedList(BUILD_ITEMS, elapsedDays).some(function (b) { return b.id === sel; })) return;
  mutateIsland(function (isl) {
    var build = isl.zones[zone].build || {};
    if (sel === 'erase') { delete build[String(cell)]; } else { build[String(cell)] = sel; }
    isl.zones[zone].build = build;
    return isl;
  }).then(render);
}

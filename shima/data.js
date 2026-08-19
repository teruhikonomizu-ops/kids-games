// ふたりの島 — content data
// 中身（植物・図鑑・キットのラインナップ）の調整はここだけ触ればOK。
// ロジックは game.js、保存まわりは sync.js が担当。
//
// unlockDay = 島が「できてから」何日たったら使えるようになるか（両方の子の合計行動ではなく、
// 純粋にカレンダー日数だけで決まる＝誰かが遊ばなくても止まらない。憲法の安全弁と同じ考え方）。
// 2〜3ヶ月ぶん、少しずつ新しい物が増えていくように day を割り振ってある。

// 植える種。days = 毎日水やりした時に咲くまでの日数（2〜4日）。
var PLANTS = [
  // 最初から（6種）
  { id: 'ichigo',        name: 'いちご',         emoji: '🍓', days: 2, unlockDay: 0 },
  { id: 'himawari',      name: 'ひまわり',       emoji: '🌻', days: 2, unlockDay: 0 },
  { id: 'hibiscus',      name: 'ハイビスカス',   emoji: '🌺', days: 3, unlockDay: 0 },
  { id: 'suika',         name: 'すいか',         emoji: '🍉', days: 3, unlockDay: 0 },
  { id: 'banana',        name: 'バナナ',         emoji: '🍌', days: 3, unlockDay: 0 },
  { id: 'toumorokoshi',  name: 'とうもろこし',   emoji: '🌽', days: 3, unlockDay: 0 },
  // 10にちめ〜
  { id: 'budou',         name: 'ぶどう',         emoji: '🍇', days: 3, unlockDay: 10 },
  { id: 'yashi',         name: 'やしのみ',       emoji: '🥥', days: 4, unlockDay: 10 },
  { id: 'pineapple',     name: 'パイナップル',   emoji: '🍍', days: 4, unlockDay: 10 },
  // 20にちめ〜
  { id: 'melon',         name: 'メロン',         emoji: '🍈', days: 4, unlockDay: 20 },
  { id: 'mango',         name: 'マンゴー',       emoji: '🥭', days: 4, unlockDay: 20 },
  { id: 'momo',          name: 'もも',           emoji: '🍑', days: 4, unlockDay: 20 },
  // 35にちめ〜
  { id: 'kiwi',          name: 'キウイ',         emoji: '🥝', days: 4, unlockDay: 35 },
  { id: 'lemon',         name: 'レモン',         emoji: '🍋', days: 3, unlockDay: 35 },
  { id: 'mikan',         name: 'みかん',         emoji: '🍊', days: 3, unlockDay: 35 },
  // 50にちめ〜
  { id: 'tulip',         name: 'チューリップ',   emoji: '🌷', days: 2, unlockDay: 50 },
  { id: 'rose',          name: 'ばら',           emoji: '🌹', days: 3, unlockDay: 50 },
  { id: 'lotus',         name: 'はす',           emoji: '🪷', days: 3, unlockDay: 50 },
  // 70にちめ〜
  { id: 'cherry',        name: 'さくらんぼ',     emoji: '🍒', days: 3, unlockDay: 70 },
  { id: 'greenapple',    name: 'あおいりんご',   emoji: '🍏', days: 4, unlockDay: 70 },
  { id: 'blueberry',     name: 'ブルーベリー',   emoji: '🫐', days: 3, unlockDay: 70 },
];

// 「2人の島の図鑑」。rare=true は出現率を下げる（数週〜数ヶ月に1回級）。
// 図鑑は日数で解放するのではなく、種類を増やすこと自体で「全部そろうまで」の時間を伸ばしている。
var LOGBOOK_ITEMS = [
  { id: 'kai',        name: 'かいがら',           emoji: '🐚', rare: false },
  { id: 'kani',       name: 'かに',               emoji: '🦀', rare: false },
  { id: 'sakana',     name: 'ねったいうお',       emoji: '🐠', rare: false },
  { id: 'fugu',       name: 'ふぐ',               emoji: '🐡', rare: false },
  { id: 'kame',       name: 'うみがめ',           emoji: '🐢', rare: false },
  { id: 'ebi',        name: 'えび',               emoji: '🦐', rare: false },
  { id: 'tako',       name: 'たこ',               emoji: '🐙', rare: false },
  { id: 'ika',        name: 'いか',               emoji: '🦑', rare: false },
  { id: 'sango',      name: 'さんご',             emoji: '🪸', rare: false },
  { id: 'hitode',     name: 'ひとで',             emoji: '⭐', rare: false },
  { id: 'awa',        name: 'あわ',               emoji: '🫧', rare: false },
  { id: 'nagareyashi',name: 'ながれついたやしのみ', emoji: '🥥', rare: false },
  { id: 'hane',       name: 'とりのはね',         emoji: '🪶', rare: false },
  { id: 'nami',       name: 'なみのおと',         emoji: '🌊', rare: false },
  { id: 'iruka',      name: 'いるか',             emoji: '🐬', rare: false },
  { id: 'kujira',     name: 'くじら',             emoji: '🐳', rare: false },
  { id: 'azarashi',   name: 'あざらし',           emoji: '🦭', rare: false },
  { id: 'dendenmushi',name: 'でんでんむし',       emoji: '🐌', rare: false },
  { id: 'isebi',      name: 'いせえび',           emoji: '🦞', rare: false },
  { id: 'shiroisakana', name: 'しろいさかな',     emoji: '🐟', rare: false },
  { id: 'kawauso',    name: 'かわうそ',           emoji: '🦦', rare: false },
  { id: 'shimadori',  name: 'しまのとり',         emoji: '🐦', rare: false },
  { id: 'flamingo',   name: 'フラミンゴ',         emoji: '🦩', rare: false },
  { id: 'kamo',       name: 'かも',               emoji: '🦆', rare: false },
  { id: 'yashinoki',  name: 'やしのき',           emoji: '🌴', rare: false },
  { id: 'ikari',      name: 'ふるいいかり',       emoji: '⚓', rare: false },
  { id: 'rashinban',  name: 'らしんばん',         emoji: '🧭', rare: false },
  { id: 'fuurin',     name: 'ふうりん',           emoji: '🎐', rare: false },
  { id: 'chou',       name: 'ちょうちょ',         emoji: '🦋', rare: false },
  { id: 'niji',       name: 'にじ',               emoji: '🌈', rare: false },
  { id: 'takaraishi', name: 'たからいし',         emoji: '💎', rare: true },
  { id: 'tsubo',      name: 'こわれたつぼ',       emoji: '🏺', rare: true },
  { id: 'kagi',       name: 'ふしぎなかぎ',       emoji: '🗝️', rare: true },
  { id: 'kanmuri',    name: 'かんむり',           emoji: '👑', rare: true },
  { id: 'hoko',       name: 'うみのおうさまのほこ', emoji: '🔱', rare: true },
  { id: 'hoshi',      name: 'ながれぼしのかけら', emoji: '🌟', rare: true },
  { id: 'kinka',      name: 'きんか',             emoji: '🪙', rare: true },
  { id: 'tsuki',      name: 'よるのつきのひかり', emoji: '🌙', rare: true },
  { id: 'taiyou',     name: 'たいようのかけら',   emoji: '☀️', rare: true },
  { id: 'clover',     name: 'よつばのクローバー', emoji: '🍀', rare: true },
];

// 各自の建築キット。年齢別に難易度を出し分け（'a'=かんたんモード / 'b'=がっつりモード）。
// 材料集めはなし＝時間（1日1部品）だけで進む。unlockDayで少しずつ選べる種類が増える。
var KID_KITS = {
  a: [
    { id: 'osiro',      name: 'すなのおしろ', emoji: '🏰', parts: 3, unlockDay: 0 },
    { id: 'hanabatake', name: 'はなばたけ',   emoji: '🌷', parts: 3, unlockDay: 0 },
    { id: 'suberidai',  name: 'すべりだい',   emoji: '🛝', parts: 3, unlockDay: 14 },
    { id: 'tent',       name: 'テント',       emoji: '⛺', parts: 4, unlockDay: 30 },
    { id: 'kisha',      name: 'きしゃぽっぽ', emoji: '🚂', parts: 4, unlockDay: 50 },
    { id: 'kanransha',  name: 'かんらんしゃ', emoji: '🎡', parts: 5, unlockDay: 70 },
  ],
  b: [
    { id: 'treehouse', name: 'ツリーハウス', emoji: '🌳', parts: 6, unlockDay: 0 },
    { id: 'hashi',     name: 'はし',         emoji: '🌉', parts: 5, unlockDay: 0 },
    { id: 'funeya',    name: 'ふねのいえ',   emoji: '⛵', parts: 6, unlockDay: 14 },
    { id: 'azumaya',   name: 'あずまや',     emoji: '🏛️', parts: 6, unlockDay: 30 },
    { id: 'merrygoround', name: 'メリーゴーランド', emoji: '🎠', parts: 7, unlockDay: 50 },
    { id: 'castle',    name: 'おおきなおしろ', emoji: '🏯', parts: 8, unlockDay: 70 },
  ],
};

// じゆうにつくる（マイクラ的な自由配置）で置ける物。材料は無限＝何度でも同じ物を置ける
// （憲法2「取り合う資源を作らない」を守る。集める必要も無くす＝操作をやさしくする）。
// 自分の区画の中だけに置ける。壊す/動かすは「けす」で自分の物だけ、いつでも自由。
var BUILD_ITEMS = [
  { id: 'ishi',    name: 'いし',       emoji: '🪨', unlockDay: 0 },
  { id: 'kusa',    name: 'くさ',       emoji: '🌿', unlockDay: 0 },
  { id: 'maruta',  name: 'まるた',     emoji: '🪵', unlockDay: 0 },
  { id: 'hata',    name: 'はた',       emoji: '🚩', unlockDay: 0 },
  { id: 'kago',    name: 'かご',       emoji: '🧺', unlockDay: 0 },
  { id: 'isu',     name: 'いす',       emoji: '🪑', unlockDay: 0 },
  { id: 'akari',   name: 'あかり',     emoji: '🕯️', unlockDay: 10 },
  { id: 'hachiue', name: 'はちうえ',   emoji: '🪴', unlockDay: 10 },
  { id: 'parasol', name: 'パラソル',   emoji: '⛱️', unlockDay: 10 },
  { id: 'renga',   name: 'れんが',     emoji: '🧱', unlockDay: 20 },
  { id: 'mado',    name: 'まど',       emoji: '🪟', unlockDay: 20 },
  { id: 'kanban',  name: 'かんばん',   emoji: '🪧', unlockDay: 20 },
  { id: 'kanu',    name: 'カヌー',     emoji: '🛶', unlockDay: 35 },
  { id: 'tako2',   name: 'たこ（そら）', emoji: '🪁', unlockDay: 35 },
  { id: 'sasa',    name: 'ささかざり', emoji: '🎋', unlockDay: 35 },
  { id: 'chouchin',name: 'ちょうちん', emoji: '🏮', unlockDay: 50 },
  { id: 'fuusen',  name: 'ふうせん',   emoji: '🎈', unlockDay: 50 },
  { id: 'kumasan', name: 'くまさん',   emoji: '🧸', unlockDay: 50 },
  { id: 'tsurizao',name: 'つりざお',   emoji: '🎣', unlockDay: 70 },
  { id: 'taiko',   name: 'たいこ',     emoji: '🥁', unlockDay: 70 },
];
var BUILD_GRID_COLS = 4;
var BUILD_GRID_CELLS = 20;

// 共有広場の非対称プロジェクト（土台=b役・飾り=a役、交互に1日1部品）。
// 1本が終わったら（全部品confirm済み）次が解放される＝カレンダーではなく完成が合図。
// 全部終わるまで数ヶ月かかる分量。
var PLAZA_SERIES = [
  { id: 'toudai',   name: 'とうだい',       emoji: '🗼', parts: 6 },
  { id: 'funsui',   name: 'ふんすい',       emoji: '⛲', parts: 7 },
  { id: 'moai',     name: 'モアイぞう',     emoji: '🗿', parts: 7 },
  { id: 'yagura',   name: 'おまつりやぐら', emoji: '🎆', parts: 8 },
  { id: 'minnanoie',name: 'みんなのいえ',   emoji: '🛖', parts: 9 },
];
// PLAZA_SERIES[i].parts個ぶんの role配列を生成（b,a交互。土台=b, 飾り=a）。
function plazaRoleSequence(n) {
  var seq = [];
  for (var i = 0; i < n; i++) seq.push(i % 2 === 0 ? 'b' : 'a');
  return seq;
}

// 畑のマス数。日数で増える（狭いまま何ヶ月も遊ばせない）。
var PLOT_SCHEDULE = [
  { day: 0,  plots: 6 },
  { day: 25, plots: 8 },
  { day: 55, plots: 10 },
];

// 島モード（役割）。'a'=かんたんモード（小さい子向け）、'b'=がっつりモード（大きい子向け）。
// 実年齢はハードコードしない。設定画面で「どっちの島にするか」を選ぶ。
var KID_ROLES = {
  a: { label: 'かんたん', sub: 'おおきいボタン・すこしのそうさ' },
  b: { label: 'がっつり', sub: 'ずかん・けんちく・じゆうづくり' },
};

// アバターに選べるアイコン（植物・図鑑の絵文字と被らない生き物系）。
var AVATAR_ICONS = ['🐣', '🦊', '🐰', '🐢', '🐳', '🦁', '🐸', '🐼'];

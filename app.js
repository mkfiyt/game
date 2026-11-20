/**
 * 『里山の、これから。』 GitHub Pages 静的ホスティング完全対応版
 * サーバー不要・ブラウザ単体動作・合言葉（シード）同期＆URL状態共有対応
 */

const STORAGE_KEY = 'satoyama_coexist_gh_v1';

const SEASONS = [
  {
    round: 1,
    name: '初夏・芽吹き',
    sub: '山から里へ、新しい命が動き出す季節',
    description: '苗が育ち始める時期。まずは畑の手入れを基本に、山際の備えを相談しよう。',
    animalActivity: '低〜中（小動物やシカが様子をうかがっています）',
    baseManpower: 5
  },
  {
    round: 2,
    name: '盛夏・青田と実り',
    sub: '作物が甘く育ち、山の獣も活発になる季節',
    description: '実りの香りが山へ届く頃。手入れだけでなく柵や見回りの分担が鍵になります。',
    animalActivity: '高（イノシシ・サル・シカが餌を求めて里へ近づきます）',
    baseManpower: 6
  },
  {
    round: 3,
    name: '実りの秋・冬支度',
    sub: '冬眠前の動物たちと、最後の収穫を守る季節',
    description: '目標「収穫12以上 ＋ 資金2以上」達成への総仕上げ。緩衝帯や見回りで守り切ろう。',
    animalActivity: '極高（冬眠前のクマやイノシシの群れが山際を狙います）',
    baseManpower: 6
  }
];

const INITIAL_PLOTS = [
  { id: 1, name: '山際の段々畑・西', zone: 'mountain', riskLabel: '獣道に近い', tended: false, fence: false, patrol: false, damaged: false },
  { id: 2, name: '森境のそば畑・東', zone: 'mountain', riskLabel: '獣道に近い', tended: false, fence: false, patrol: false, damaged: false },
  { id: 3, name: '中腹のリンゴ園', zone: 'middle', riskLabel: '見通し良好', tended: false, fence: false, patrol: false, damaged: false },
  { id: 4, name: '水路沿いの野菜畑', zone: 'middle', riskLabel: '水辺の道', tended: false, fence: false, patrol: false, damaged: false },
  { id: 5, name: '里の日の出水田', zone: 'village', riskLabel: '集落の近く', tended: false, fence: false, patrol: false, damaged: false },
  { id: 6, name: '蔵の前の共同畑', zone: 'village', riskLabel: '集落の近く', tended: false, fence: false, patrol: false, damaged: false }
];

const PLOT_GEOMETRIES = {
  1: { x: 88,  y: 266, w: 148, h: 64, rx: 10 },
  2: { x: 274, y: 262, w: 152, h: 64, rx: 10 },
  3: { x: 96,  y: 364, w: 156, h: 72, rx: 12 },
  4: { x: 312, y: 356, w: 154, h: 70, rx: 10 },
  5: { x: 545, y: 282, w: 162, h: 68, rx: 10 },
  6: { x: 538, y: 374, w: 136, h: 66, rx: 10 }
};

const ROLE_PRESETS = [
  { role: '農家の担い手', color: '#2C4936' },
  { role: '区長・世話役', color: '#28465C' },
  { role: '鳥獣対策・見回り隊', color: '#BD4B31' },
  { role: '里山保全・環境委員', color: '#6B5B3E' }
];

// シード値から決定論的乱数（Mulberry32）を生成
function createSeededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function formatTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function createInitialState(seed = 'nagano', speakerName = '村の代表', speakerRole = '農家の担い手') {
  return {
    seed,
    speakerName,
    activeRoleIndex: ROLE_PRESETS.findIndex(r => r.role === speakerRole) >= 0
      ? ROLE_PRESETS.findIndex(r => r.role === speakerRole)
      : 0,
    phase: 'playing', // 'playing' | 'season_result' | 'finished'
    round: 1,
    maxRounds: 3,
    manpowerMax: 5,
    manpowerLeft: 5,
    funds: 4,
    harvest: 0,
    bufferZoneLevel: 0,
    plots: JSON.parse(JSON.stringify(INITIAL_PLOTS)),
    lastSeasonReport: null,
    logs: [
      {
        id: Date.now(),
        round: 1,
        type: 'system',
        title: `村の合言葉「${seed}」で会議がはじまりました`,
        text: '目標は3つの季節を終えた時点で「収穫 12個以上」と「資金 2両以上」を残すこと。限られた人手と資金を相談して配分しましょう。'
      }
    ],
    chat: [
      {
        id: Date.now() + 1,
        sender: '村の案内人',
        role: '案内',
        color: '#2C4936',
        text: '右上の立場チップを切り替えると、農家・区長・見回り隊・環境委員の視点で相談メモを残せます。',
        time: formatTime()
      }
    ]
  };
}

let state = createInitialState();
let selectedPlotId = 1;
let lastShownFinal = false;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

function loadInitialState() {
  const params = new URLSearchParams(location.search);
  const urlSeed = params.get('seed');

  if (location.hash.startsWith('#snapshot=')) {
    try {
      const encoded = location.hash.slice('#snapshot='.length);
      const jsonStr = decodeURIComponent(escape(atob(encoded)));
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.plots && parsed.round) {
        state = parsed;
        document.getElementById('setupModal').classList.add('hidden');
        showToast('共有された村のデータを読み込みました');
        return;
      }
    } catch (e) {}
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.plots && (!urlSeed || parsed.seed === urlSeed)) {
        state = parsed;
        document.getElementById('inputSeed').value = state.seed;
        document.getElementById('inputPlayerName').value = state.speakerName;
        document.getElementById('setupModal').classList.add('hidden');
        return;
      }
    }
  } catch (e) {}

  if (urlSeed) {
    document.getElementById('inputSeed').value = urlSeed;
  }
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function addLog(type, title, text) {
  state.logs.unshift({
    id: Date.now() + Math.random(),
    round: state.round,
    type,
    title,
    text
  });
}

function getAnimalSvg(animalName) {
  if (animalName.includes('クマ')) {
    return `<svg width="42" height="42" viewBox="0 0 48 48" fill="none">
      <circle cx="14" cy="14" r="5" fill="#23221F"/>
      <circle cx="34" cy="14" r="5" fill="#23221F"/>
      <ellipse cx="24" cy="26" rx="14" ry="12" fill="#23221F"/>
      <ellipse cx="24" cy="29" rx="6" ry="4.5" fill="#D4CBB8"/>
      <circle cx="24" cy="27.5" r="2" fill="#23221F"/>
      <circle cx="19" cy="22" r="1.5" fill="#FBF9F4"/>
      <circle cx="29" cy="22" r="1.5" fill="#FBF9F4"/>
      <path d="M17 37 Q24 41 31 37" stroke="#FBF9F4" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  }
  if (animalName.includes('シカ')) {
    return `<svg width="42" height="42" viewBox="0 0 48 48" fill="none">
      <path d="M18 17 L13 7 M15 11 L10 10 M30 17 L35 7 M33 11 L38 10" stroke="#6E4E34" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="24" cy="27" rx="10" ry="12" fill="#8C623E"/>
      <ellipse cx="13" cy="21" rx="4.5" ry="2.2" transform="rotate(-20 13 21)" fill="#8C623E"/>
      <ellipse cx="35" cy="21" rx="4.5" ry="2.2" transform="rotate(20 35 21)" fill="#8C623E"/>
      <circle cx="20" cy="25" r="1.6" fill="#1F1E1B"/>
      <circle cx="28" cy="25" r="1.6" fill="#1F1E1B"/>
      <ellipse cx="24" cy="33" rx="3.5" ry="2.5" fill="#23221F"/>
    </svg>`;
  }
  if (animalName.includes('イノシシ')) {
    return `<svg width="42" height="42" viewBox="0 0 48 48" fill="none">
      <ellipse cx="24" cy="27" rx="14" ry="11" fill="#4A3E35"/>
      <polygon points="12,18 16,12 19,19" fill="#4A3E35"/>
      <polygon points="36,18 32,12 29,19" fill="#4A3E35"/>
      <ellipse cx="24" cy="30" rx="6.5" ry="4.5" fill="#9E8470"/>
      <circle cx="21.5" cy="30" r="1.3" fill="#23221F"/>
      <circle cx="26.5" cy="30" r="1.3" fill="#23221F"/>
      <path d="M15 31 Q12 27 14 24 M33 31 Q36 27 34 24" stroke="#FBF9F4" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="18" cy="23" r="1.5" fill="#FBF9F4"/>
      <circle cx="30" cy="23" r="1.5" fill="#FBF9F4"/>
    </svg>`;
  }
  if (animalName.includes('サル')) {
    return `<svg width="42" height="42" viewBox="0 0 48 48" fill="none">
      <circle cx="11" cy="24" r="4.5" fill="#7D6B58"/>
      <circle cx="37" cy="24" r="4.5" fill="#7D6B58"/>
      <circle cx="24" cy="25" r="12" fill="#7D6B58"/>
      <ellipse cx="24" cy="26" rx="8.5" ry="7.5" fill="#E3B598"/>
      <circle cx="21" cy="23" r="1.5" fill="#1F1E1B"/>
      <circle cx="27" cy="23" r="1.5" fill="#1F1E1B"/>
      <path d="M21 29 Q24 31 27 29" stroke="#7A3E32" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  }
  return `<svg width="42" height="42" viewBox="0 0 48 48" fill="none">
    <ellipse cx="24" cy="27" rx="13" ry="10" fill="#57534A"/>
    <path d="M14 24 Q24 27 34 24" stroke="#FBF9F4" stroke-width="3" stroke-linecap="round"/>
    <circle cx="19" cy="24" r="1.6" fill="#1F1E1B"/>
    <circle cx="29" cy="24" r="1.6" fill="#1F1E1B"/>
    <circle cx="24" cy="30" r="2" fill="#1F1E1B"/>
  </svg>`;
}

function executePlotAction(action) {
  if (state.phase !== 'playing') return;
  const plot = state.plots.find(p => p.id === selectedPlotId);
  if (!plot) return;
  const activeRole = ROLE_PRESETS[state.activeRoleIndex] || ROLE_PRESETS[0];

  if (action === 'tend') {
    if (plot.tended) return;
    if (state.manpowerLeft < 1) return showToast('人手が足りません');
    state.manpowerLeft -= 1;
    plot.tended = true;
    addLog('action', `「${plot.name}」を手入れ（${activeRole.role}の提案）`, '人手1を使い、この季節の収穫準備が整いました。');
  } else if (action === 'fence') {
    if (plot.fence) return;
    if (state.manpowerLeft < 1) return showToast('人手が足りません');
    if (state.funds < 1) return showToast('資金が足りません');
    state.manpowerLeft -= 1;
    state.funds -= 1;
    plot.fence = true;
    addLog('action', `「${plot.name}」に防護柵を設置`, '人手1・資金1を使用。次の季節以降も畑を守ります。');
  } else if (action === 'patrol') {
    if (plot.patrol) return;
    if (state.manpowerLeft < 1) return showToast('人手が足りません');
    state.manpowerLeft -= 1;
    plot.patrol = true;
    addLog('action', `「${plot.name}」の夜間見回りを配置`, '人手1を使用。動物の接近を察知して追い払います。');
  }

  saveState();
  renderAll();
}

function executeVillageAction(action) {
  if (state.phase !== 'playing') return;

  if (action === 'buffer') {
    if (state.bufferZoneLevel >= 3) return showToast('緩衝帯は十分に整備されています');
    if (state.manpowerLeft < 1) return showToast('人手が足りません');
    if (state.funds < 1) return showToast('資金が足りません');
    state.manpowerLeft -= 1;
    state.funds -= 1;
    state.bufferZoneLevel += 1;
    addLog(
      'coexist',
      `山と里の「緩衝帯（藪払い）」を整備（Lv.${state.bufferZoneLevel}）`,
      '人手1・資金1を使用。見通しが良くなり、動物が里へ降りにくくなりました。'
    );
  } else if (action === 'sell_harvest') {
    if (state.harvest < 1) return showToast('換金できる収穫がありません');
    state.harvest -= 1;
    state.funds += 1;
    addLog('trade', '収穫1個を産直出荷して資金1両に交換', '得た資金で柵や緩衝帯の整備ができます。');
  }

  saveState();
  renderAll();
}

function resolveSeason() {
  if (state.phase !== 'playing') return;
  const r = state.round;
  const season = SEASONS[r - 1];
  // 合言葉と季節番号で決定論的な乱数を生成（同じ合言葉なら同じ動物イベントが発生）
  const rng = createSeededRandom(`${state.seed}::round-${r}`);

  const events = [];
  let harvestedThisSeason = 0;
  let preventedCount = 0;
  let damagedCount = 0;

  const roundFactor = r === 1 ? 0.35 : r === 2 ? 0.55 : 0.72;
  const bufferReduction = state.bufferZoneLevel * 0.14;

  const animalsByZone = {
    mountain: [
      { name: 'ツキノワグマ', note: '木の実を求めて山際の畑に近づきました' },
      { name: 'ニホンジカ', note: '群れで柔らかい新芽や作物を狙っています' }
    ],
    middle: [
      { name: 'イノシシ', note: '地面を掘り返して根菜や作物を探しています' },
      { name: 'ニホンザル', note: '賢く様子をうかがいながら畑へ降りてきました' }
    ],
    village: [
      { name: 'ハクビシン・タヌキ', note: '夜陰にまぎれて里の畑へ忍び込みました' },
      { name: 'イノシシ（はぐれ個体）', note: '水路伝いに集落の近くまで降りてきました' }
    ]
  };

  state.plots.forEach(plot => {
    const zoneBase = plot.zone === 'mountain' ? 0.42 : plot.zone === 'middle' ? 0.24 : 0.10;
    const attackChance = Math.max(0.05, Math.min(0.92, zoneBase + roundFactor - bufferReduction));
    const animalAppeared = rng() < attackChance;

    const animalPool = animalsByZone[plot.zone];
    const animal = animalPool[Math.floor(rng() * animalPool.length)];

    if (animalAppeared) {
      if (plot.patrol && plot.fence) {
        preventedCount += 1;
        events.push({
          plotId: plot.id,
          plotName: plot.name,
          status: 'defended',
          animal: animal.name,
          detail: `防護柵と夜間見回りの連携により、${animal.name}を傷つけず山へ追い返しました。`
        });
      } else if (plot.patrol) {
        if (rng() < 0.82) {
          preventedCount += 1;
          events.push({
            plotId: plot.id,
            plotName: plot.name,
            status: 'defended',
            animal: animal.name,
            detail: `見回りの光と音に気づき、${animal.name}は森の奥へ引き返しました。`
          });
        } else {
          plot.damaged = true;
          damagedCount += 1;
          events.push({
            plotId: plot.id,
            plotName: plot.name,
            status: 'damaged',
            animal: animal.name,
            detail: `見回りの隙を突かれ、${animal.name}に作物を食べられてしまいました。`
          });
        }
      } else if (plot.fence) {
        if (rng() < 0.76) {
          preventedCount += 1;
          events.push({
            plotId: plot.id,
            plotName: plot.name,
            status: 'defended',
            animal: animal.name,
            detail: `防護柵がしっかり機能し、${animal.name}の侵入を防ぎました。`
          });
        } else {
          plot.damaged = true;
          plot.fence = false;
          damagedCount += 1;
          events.push({
            plotId: plot.id,
            plotName: plot.name,
            status: 'damaged',
            animal: animal.name,
            detail: `${animal.name}に防護柵を押し破られ、作物が荒らされてしまいました（柵が破損）。`
          });
        }
      } else {
        plot.damaged = true;
        damagedCount += 1;
        events.push({
          plotId: plot.id,
          plotName: plot.name,
          status: 'damaged',
          animal: animal.name,
          detail: `${animal.note}。対策がなく、作物を食べられてしまいました。`
        });
      }
    }

    if (plot.tended && !plot.damaged) {
      harvestedThisSeason += 2;
    }
  });

  state.harvest += harvestedThisSeason;

  const summaryText =
    damagedCount === 0
      ? `すべての畑を守り抜き、${harvestedThisSeason}個の作物を収穫しました！`
      : `${harvestedThisSeason}個の作物を収穫しましたが、${damagedCount}区画で獣による食害が発生しました。`;

  state.lastSeasonReport = {
    round: r,
    seasonName: season.name,
    harvestedThisSeason,
    preventedCount,
    damagedCount,
    summaryText,
    events
  };

  addLog(
    damagedCount > 0 ? 'warning' : 'harvest',
    `${season.name}の結果：収穫 +${harvestedThisSeason}（累計 ${state.harvest}）`,
    summaryText
  );

  state.phase = 'season_result';
  saveState();
  renderAll();
}

function goNextSeason() {
  if (state.phase !== 'season_result') return;
  if (state.round >= state.maxRounds) {
    state.phase = 'finished';
  } else {
    state.round += 1;
    const nextSeason = SEASONS[state.round - 1];
    state.manpowerMax = nextSeason.baseManpower;
    state.manpowerLeft = nextSeason.baseManpower;
    state.plots.forEach(p => {
      p.tended = false;
      p.patrol = false;
      p.damaged = false;
    });
    state.phase = 'playing';
    addLog('system', `${nextSeason.name}に入りました`, nextSeason.description);
  }
  saveState();
  renderAll();
}

function renderAll() {
  const season = SEASONS[state.round - 1] || SEASONS[SEASONS.length - 1];

  document.getElementById('currentSeedDisplay').textContent = state.seed;
  document.getElementById('roundCounter').textContent = `第 ${state.round} / ${state.maxRounds} 季節`;
  document.getElementById('seasonName').textContent = season.name;
  document.getElementById('seasonSub').textContent = season.sub;
  document.getElementById('manpowerLeft').textContent = state.manpowerLeft;
  document.getElementById('manpowerMax').textContent = state.manpowerMax;
  document.getElementById('fundsValue').textContent = state.funds;
  document.getElementById('harvestValue').textContent = state.harvest;
  document.getElementById('animalForecast').textContent = `獣の気配：${season.animalActivity.split('（')[0]}`;

  const hBadge = document.getElementById('goalHarvestBadge');
  hBadge.textContent = `収穫 ${state.harvest} / 12`;
  hBadge.classList.toggle('achieved', state.harvest >= 12);

  const fBadge = document.getElementById('goalFundsBadge');
  fBadge.textContent = `資金 ${state.funds} / 2`;
  fBadge.classList.toggle('achieved', state.funds >= 2);

  const bufLabels = ['未整備（藪が深い）', 'Lv.1（見通し改善）', 'Lv.2（緩衝帯拡大）', 'Lv.3（理想的な境界）'];
  document.getElementById('bufferBadge').textContent = `緩衝帯：${bufLabels[state.bufferZoneLevel] || ''}`;
  const bushLayer = document.getElementById('bushLayer');
  if (bushLayer) {
    bushLayer.style.opacity = String(Math.max(0.12, 1 - state.bufferZoneLevel * 0.3));
  }

  renderMapAndPlots();
  renderActionPanel();
  renderRoleChips();
  renderChatAndLogs();
  renderModals();
}

function renderMapAndPlots() {
  const plotsLayer = document.getElementById('plotsLayer');
  const pillsContainer = document.getElementById('plotPills');

  let svgHtml = '';
  let pillsHtml = '';

  state.plots.forEach(plot => {
    const g = PLOT_GEOMETRIES[plot.id];
    const isSelected = plot.id === selectedPlotId;

    let fillCol = '#C8BEAA';
    if (plot.damaged) fillCol = '#E4C3BA';
    else if (plot.tended) fillCol = '#B7C9A8';

    let cropArt = '';
    if (plot.tended && !plot.damaged) {
      cropArt = `
        <g stroke="#2C4936" stroke-width="1.6" fill="none" stroke-linecap="round">
          <path d="M${g.x + 22},${g.y + 42} v-12 m0,5 c-5,0 -6,-4 -6,-4 s4,0 6,4 m0,-2 c5,0 6,-4 6,-4 s-4,0 -6,4"/>
          <path d="M${g.x + 52},${g.y + 42} v-12 m0,5 c-5,0 -6,-4 -6,-4 s4,0 6,4 m0,-2 c5,0 6,-4 6,-4 s-4,0 -6,4"/>
          <path d="M${g.x + 82},${g.y + 42} v-12 m0,5 c-5,0 -6,-4 -6,-4 s4,0 6,4 m0,-2 c5,0 6,-4 6,-4 s-4,0 -6,4"/>
          <path d="M${g.x + 112},${g.y + 42} v-12 m0,5 c-5,0 -6,-4 -6,-4 s4,0 6,4 m0,-2 c5,0 6,-4 6,-4 s-4,0 -6,4"/>
        </g>`;
    } else if (plot.damaged) {
      cropArt = `
        <g stroke="#BD4B31" stroke-width="1.8" fill="none" stroke-linecap="round">
          <path d="M${g.x + 35},${g.y + 26} l12,12 m0,-12 l-12,12"/>
          <circle cx="${g.x + 76}" cy="${g.y + 32}" r="3" fill="#BD4B31"/>
          <circle cx="${g.x + 86}" cy="${g.y + 28}" r="2.2" fill="#BD4B31"/>
          <circle cx="${g.x + 85}" cy="${g.y + 36}" r="2.2" fill="#BD4B31"/>
        </g>`;
    } else {
      cropArt = `
        <g stroke="#9E9480" stroke-width="1.2" stroke-dasharray="5 4">
          <line x1="${g.x + 18}" y1="${g.y + 28}" x2="${g.x + g.w - 18}" y2="${g.y + 28}" />
          <line x1="${g.x + 18}" y1="${g.y + 40}" x2="${g.x + g.w - 18}" y2="${g.y + 40}" />
        </g>`;
    }

    let fenceArt = '';
    if (plot.fence) {
      fenceArt = `
        <g stroke="#8C6229" stroke-width="2.2" fill="none">
          <rect x="${g.x - 4}" y="${g.y - 4}" width="${g.w + 8}" height="${g.h + 8}" rx="${g.rx + 2}" stroke-dasharray="10 4" />
          <line x1="${g.x + 12}" y1="${g.y - 7}" x2="${g.x + 12}" y2="${g.y + 3}" />
          <line x1="${g.x + g.w / 2}" y1="${g.y - 7}" x2="${g.x + g.w / 2}" y2="${g.y + 3}" />
          <line x1="${g.x + g.w - 12}" y1="${g.y - 7}" x2="${g.x + g.w - 12}" y2="${g.y + 3}" />
        </g>`;
    }

    let patrolArt = '';
    if (plot.patrol) {
      const lx = g.x + g.w - 18;
      const ly = g.y + 16;
      patrolArt = `
        <g>
          <circle cx="${lx}" cy="${ly}" r="13" fill="#BD4B31" opacity="0.22" />
          <rect x="${lx - 4}" y="${ly - 5}" width="8" height="10" rx="2" fill="#FBF9F4" stroke="#BD4B31" stroke-width="1.5" />
          <circle cx="${lx}" cy="${ly}" r="2" fill="#BD4B31" />
        </g>`;
    }

    svgHtml += `
      <g class="plot-group ${isSelected ? 'selected' : ''}" data-plot-id="${plot.id}">
        <rect class="plot-ground" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${g.rx}"
              fill="${fillCol}" stroke="${isSelected ? '#BD4B31' : '#6E6659'}" stroke-width="${isSelected ? 3 : 1.5}" />
        ${cropArt}
        ${fenceArt}
        ${patrolArt}
        <text x="${g.x + 10}" y="${g.y + 16}" font-size="11.5" font-weight="bold" fill="#1F1E1B" font-family="serif">
          ${plot.id}. ${escapeXml(plot.name.split('・')[0])}
        </text>
      </g>`;

    pillsHtml += `
      <button type="button" class="plot-pill ${isSelected ? 'active' : ''}" data-plot-id="${plot.id}">
        <span class="plot-pill-title">${plot.id}. ${escapeHtml(plot.name)}</span>
        <div class="plot-pill-tags">
          ${plot.tended ? '<span class="mini-tag tended">手入れ済</span>' : '<span class="mini-tag">未手入れ</span>'}
          ${plot.fence ? '<span class="mini-tag fence">柵あり</span>' : ''}
          ${plot.patrol ? '<span class="mini-tag patrol">見回り</span>' : ''}
          ${plot.damaged ? '<span class="mini-tag damaged">食害</span>' : ''}
        </div>
      </button>`;
  });

  plotsLayer.innerHTML = svgHtml;
  pillsContainer.innerHTML = pillsHtml;

  document.querySelectorAll('[data-plot-id]').forEach(el => {
    el.addEventListener('click', () => {
      selectedPlotId = Number(el.getAttribute('data-plot-id'));
      renderMapAndPlots();
      renderActionPanel();
    });
  });
}

function renderActionPanel() {
  const plot = state.plots.find(p => p.id === selectedPlotId) || state.plots[0];
  const zoneMap = {
    mountain: '山際・獣道に近い（収穫狙われやすい）',
    middle: '中腹エリア（中程度の警戒が必要）',
    village: '里の集落近く（比較的穏やか）'
  };

  document.getElementById('selectedPlotName').textContent = `畑${plot.id}：${plot.name}`;
  document.getElementById('selectedPlotZone').textContent = zoneMap[plot.zone] || '';

  const statuses = [];
  statuses.push(plot.tended ? '手入れ済み（今期 収穫+2 予定）' : '未手入れ（このままでは収穫0）');
  if (plot.fence) statuses.push('防護柵あり');
  if (plot.patrol) statuses.push('夜間見回り中');
  document.getElementById('selectedPlotStatus').textContent = statuses.join(' ／ ');

  const isPlaying = state.phase === 'playing';
  const hasMan = state.manpowerLeft >= 1;
  const hasFund = state.funds >= 1;

  document.getElementById('actTend').disabled = !isPlaying || plot.tended || !hasMan;
  document.getElementById('actFence').disabled = !isPlaying || plot.fence || !hasMan || !hasFund;
  document.getElementById('actPatrol').disabled = !isPlaying || plot.patrol || !hasMan;
  document.getElementById('actBuffer').disabled = !isPlaying || state.bufferZoneLevel >= 3 || !hasMan || !hasFund;
  document.getElementById('actSell').disabled = !isPlaying || state.harvest < 1;

  document.getElementById('leftoverManpowerNote').textContent =
    state.manpowerLeft > 0 ? `残り人手：あと ${state.manpowerLeft} 人分使えます` : '今期の人手はすべて使い切りました';
}

function renderRoleChips() {
  const container = document.getElementById('memberChips');
  container.innerHTML = ROLE_PRESETS.map((r, idx) => `
    <button type="button" class="member-chip ${idx === state.activeRoleIndex ? 'active-speaker' : ''}" data-role-idx="${idx}">
      <span class="member-dot" style="background:${r.color}"></span>
      <span>${escapeHtml(r.role)}</span>
    </button>
  `).join('');

  container.querySelectorAll('[data-role-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeRoleIndex = Number(btn.getAttribute('data-role-idx'));
      saveState();
      renderRoleChips();
    });
  });
}

function renderChatAndLogs() {
  const chatBox = document.getElementById('chatBox');
  const wasAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 40;

  chatBox.innerHTML = state.chat.map(c => `
    <div class="chat-msg">
      <div class="chat-meta">
        <span style="color:${c.color}">${escapeHtml(c.sender)}</span>
        <span class="chat-time">${escapeHtml(c.role || '')} · ${c.time}</span>
      </div>
      <div>${escapeHtml(c.text)}</div>
    </div>
  `).join('');

  if (wasAtBottom) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  const logFeed = document.getElementById('logFeed');
  logFeed.innerHTML = state.logs.map(l => `
    <div class="log-entry ${l.type}">
      <strong>[第${l.round}季節] ${escapeHtml(l.title)}</strong>
      <span>${escapeHtml(l.text)}</span>
    </div>
  `).join('');
}

function renderModals() {
  const seasonModal = document.getElementById('seasonModal');
  if (state.phase === 'season_result' && state.lastSeasonReport) {
    const rep = state.lastSeasonReport;
    document.getElementById('reportKicker').textContent = `SEASON ${rep.round} REPORT`;
    document.getElementById('reportTitle').textContent = `${rep.seasonName} の経過と結果`;
    document.getElementById('reportSummary').textContent = rep.summaryText;

    const eventsHtml = rep.events.length === 0
      ? `<div class="event-card defended">この季節は野生動物が畑へ降りてくることなく、穏やかに過ぎていきました。</div>`
      : rep.events.map(ev => `
          <div class="event-card ${ev.status}" style="display:flex;gap:12px;align-items:center;">
            <div style="flex-shrink:0;">${getAnimalSvg(ev.animal)}</div>
            <div>
              <strong>畑${ev.plotId}（${escapeHtml(ev.plotName)}）— ${escapeHtml(ev.animal)}</strong>
              <p style="font-size:12.5px;margin-top:2px;">${escapeHtml(ev.detail)}</p>
            </div>
          </div>
        `).join('');

    document.getElementById('reportEvents').innerHTML = eventsHtml;
    document.getElementById('btnNextSeason').textContent =
      state.round >= state.maxRounds ? '3季節の最終結果を見る' : '次の季節へ進む';
    seasonModal.classList.remove('hidden');
  } else {
    seasonModal.classList.add('hidden');
  }

  const finalModal = document.getElementById('finalModal');
  if (state.phase === 'finished') {
    const cleared = state.harvest >= 12 && state.funds >= 2;
    document.getElementById('finalKicker').textContent = cleared ? 'VILLAGE GOAL ACHIEVED' : 'SEASON ENDED';
    document.getElementById('finalTitle').textContent = cleared
      ? '実りと暮らしを守り抜きました'
      : '厳しさの中で、次の課題が見えました';

    document.getElementById('finalMetrics').innerHTML = `
      <div style="display:flex;justify-content:space-around;text-align:center;">
        <div>
          <div style="font-size:12px;color:var(--ink-secondary);">最終収穫量（目標 12以上）</div>
          <div style="font-family:var(--font-serif);font-size:26px;font-weight:700;color:${state.harvest >= 12 ? 'var(--color-forest)' : 'var(--color-persimmon)'};">
            ${state.harvest} 個
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--ink-secondary);">残った資金（目標 2両以上）</div>
          <div style="font-family:var(--font-serif);font-size:26px;font-weight:700;color:${state.funds >= 2 ? 'var(--color-forest)' : 'var(--color-persimmon)'};">
            ${state.funds} 両
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--ink-secondary);">緩衝帯の整備</div>
          <div style="font-family:var(--font-serif);font-size:26px;font-weight:700;">
            Lv.${state.bufferZoneLevel}
          </div>
        </div>
      </div>
    `;

    document.getElementById('finalReflection').innerHTML = `
      <p style="font-weight:700;margin-bottom:6px;">村会議のふりかえり（みんなで話してみよう）</p>
      <ul style="padding-left:18px;color:var(--ink-secondary);display:flex;flex-direction:column;gap:6px;">
        <li>人手とお金が足りないとき、「すべての畑を守る」のと「守る場所を絞る」のどちらを選びましたか？</li>
        <li>山際の畑に柵を張ることと、山と里の境界（緩衝帯）を整えることには、どんな違いがありましたか？</li>
        <li>実際の長野の里山では、農家の高齢化や担い手不足の中で、どのような工夫や地域協力ができるでしょうか？</li>
      </ul>
    `;
    if (!lastShownFinal) {
      finalModal.classList.remove('hidden');
      lastShownFinal = true;
    }
  } else {
    lastShownFinal = false;
    finalModal.classList.add('hidden');
  }
}

// イベントリスナー登録
document.getElementById('setupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const seed = document.getElementById('inputSeed').value.trim() || 'nagano';
  const name = document.getElementById('inputPlayerName').value.trim() || '村の代表';
  const role = document.getElementById('inputPlayerRole').value;
  state = createInitialState(seed, name, role);
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  saveState();
  document.getElementById('setupModal').classList.add('hidden');
  renderAll();
});

document.getElementById('btnOpenSetup').addEventListener('click', () => {
  document.getElementById('inputSeed').value = state.seed;
  document.getElementById('inputPlayerName').value = state.speakerName;
  document.getElementById('setupModal').classList.remove('hidden');
});

document.getElementById('actTend').addEventListener('click', () => executePlotAction('tend'));
document.getElementById('actFence').addEventListener('click', () => executePlotAction('fence'));
document.getElementById('actPatrol').addEventListener('click', () => executePlotAction('patrol'));
document.getElementById('actBuffer').addEventListener('click', () => executeVillageAction('buffer'));
document.getElementById('actSell').addEventListener('click', () => executeVillageAction('sell_harvest'));

document.getElementById('btnAdvanceSeason').addEventListener('click', () => {
  if (state.manpowerLeft > 0) {
    if (!confirm(`まだ人手が ${state.manpowerLeft} 人分余っています。このまま季節を進めますか？`)) {
      return;
    }
  }
  resolveSeason();
});

document.getElementById('btnNextSeason').addEventListener('click', goNextSeason);

document.getElementById('btnReset').addEventListener('click', () => {
  if (confirm('現在の進行をリセットして、最初の季節からやり直しますか？')) {
    state = createInitialState(state.seed, state.speakerName, ROLE_PRESETS[state.activeRoleIndex]?.role);
    history.replaceState(null, '', `?seed=${encodeURIComponent(state.seed)}`);
    saveState();
    renderAll();
  }
});

document.getElementById('btnRestartFinal').addEventListener('click', () => {
  state = createInitialState(state.seed, state.speakerName, ROLE_PRESETS[state.activeRoleIndex]?.role);
  history.replaceState(null, '', `?seed=${encodeURIComponent(state.seed)}`);
  saveState();
  renderAll();
});

document.getElementById('btnCloseFinal').addEventListener('click', () => {
  document.getElementById('finalModal').classList.add('hidden');
});

document.getElementById('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  const activeRole = ROLE_PRESETS[state.activeRoleIndex] || ROLE_PRESETS[0];
  state.chat.push({
    id: Date.now() + Math.random(),
    sender: state.speakerName,
    role: activeRole.role,
    color: activeRole.color,
    text,
    time: formatTime()
  });
  input.value = '';
  saveState();
  renderChatAndLogs();
});

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const activeRole = ROLE_PRESETS[state.activeRoleIndex] || ROLE_PRESETS[0];
    state.chat.push({
      id: Date.now() + Math.random(),
      sender: state.speakerName,
      role: activeRole.role,
      color: activeRole.color,
      text: btn.getAttribute('data-phrase'),
      time: formatTime()
    });
    saveState();
    renderChatAndLogs();
  });
});

document.getElementById('btnShare').addEventListener('click', () => {
  const baseUrl = `${location.origin}${location.pathname}?seed=${encodeURIComponent(state.seed)}`;
  document.getElementById('shareSeedLabel').textContent = state.seed;
  document.getElementById('shareUrlInput').value = baseUrl;
  document.getElementById('qrCodeContainer').innerHTML = generateQRCodeSVG(baseUrl, 180);
  document.getElementById('shareModal').classList.remove('hidden');
});

document.getElementById('btnCloseShare').addEventListener('click', () => {
  document.getElementById('shareModal').classList.add('hidden');
});

document.getElementById('btnCopyUrl').addEventListener('click', () => {
  const inp = document.getElementById('shareUrlInput');
  inp.select();
  navigator.clipboard?.writeText(inp.value);
  showToast('共有URLをコピーしました');
});

document.getElementById('btnCopySnapshotUrl').addEventListener('click', () => {
  try {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    const snapUrl = `${location.origin}${location.pathname}?seed=${encodeURIComponent(state.seed)}#snapshot=${encoded}`;
    navigator.clipboard?.writeText(snapUrl);
    showToast('今の途中経過を含むURLをコピーしました');
  } catch (e) {
    showToast('URLの生成に失敗しました');
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeXml(str) {
  return escapeHtml(str);
}

// 完全オフライン動作 QRコードSVGジェネレーター (Version 5-L, Byte Mode: 最大106バイト対応)
function generateQRCodeSVG(text, sizePx = 180) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 106) {
    return `<div style="padding:14px;font-size:12px;color:#57534A;text-align:center;">URLが長いため、下の「コピー」ボタンからURLを共有してください</div>`;
  }

  const SIZE = 37;
  const DATA_CW = 108;
  const ECC_CW = 26;

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  pushBits(0, Math.min(4, DATA_CW * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataBytes.push(v);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < DATA_CW) {
    dataBytes.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  const gfExp = new Uint8Array(512);
  const gfLog = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
  const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : gfExp[gfLog[a] + gfLog[b]]);

  let gen = [1];
  for (let i = 0; i < ECC_CW; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const factor = gfExp[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], factor);
    }
    gen = next;
  }

  const msg = dataBytes.concat(new Array(ECC_CW).fill(0));
  for (let i = 0; i < DATA_CW; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  const fullCodewords = dataBytes.concat(msg.slice(DATA_CW));

  const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  const isFunc = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));

  const setFunc = (r, c, val) => {
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      grid[r][c] = val ? 1 : 0;
      isFunc[r][c] = true;
    }
  };

  const drawFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        setFunc(r0 + r, c0 + c, inOuter && (onBorder || inInner));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, SIZE - 7);
  drawFinder(SIZE - 7, 0);

  // Version 5 alignment pattern at (30, 30)
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const val = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      setFunc(30 + r, 30 + c, val);
    }
  }

  for (let i = 8; i < SIZE - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  setFunc(SIZE - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, SIZE - 1 - i, false);
    if (i < 7) setFunc(SIZE - 1 - i, 8, false);
  }

  const allBits = [];
  for (const cw of fullCodewords) {
    for (let b = 7; b >= 0; b--) allBits.push((cw >>> b) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = SIZE - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < SIZE; step++) {
      const r = upward ? SIZE - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!isFunc[r][c]) {
          let bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          if ((r + c) % 2 === 0) bit ^= 1;
          grid[r][c] = bit;
        }
      }
    }
    upward = !upward;
  }

  const fmtBits = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = (fmtBits >>> (14 - i)) & 1;
    if (i < 6) grid[8][i] = bit;
    else if (i === 6) grid[8][7] = bit;
    else if (i === 7) grid[8][8] = bit;
    else if (i === 8) grid[7][8] = bit;
    else grid[14 - i][8] = bit;

    if (i < 8) grid[8][SIZE - 1 - i] = bit;
    else grid[SIZE - 15 + i][8] = bit;
  }

  const quiet = 2;
  const total = SIZE + quiet * 2;
  let rects = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 1) {
        rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" />`;
      }
    }
  }
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="${total}" height="${total}" fill="#FFFFFF"/>
    <g fill="#1F1E1B">${rects}</g>
  </svg>`;
}

loadInitialState();
renderAll();

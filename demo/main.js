import '../src/index.js';

const el = document.getElementById('editor');
const stats = document.getElementById('stats');

const TYPES = ['input', 'process', 'output', 'note'];
const nodeTypes = {
  input: { style: { headerFill: '#dbeafe', stroke: '#93c5fd' } },
  process: { style: { headerFill: '#ede9fe', stroke: '#c4b5fd' } },
  output: { style: { headerFill: '#dcfce7', stroke: '#86efac' } },
  note: { style: { headerFill: '#fef3c7', fill: '#fffbeb', stroke: '#fcd34d' } },
};

const NOTE_COLORS = ['amber', 'blue', 'red', 'green', 'purple'];
const NOTE_TEXTS = ['要確認', '仕様が未定', 'ここで離脱が多い', '文言を直す', 'A/B テスト中の分岐。長いメモはバッジでは省略され、マウスを乗せると全文が出る'];

/** グリッド状に n 個のノードと、隣接ノード間のコネクタを生成 */
function generate(n) {
  const cols = Math.ceil(Math.sqrt(n));
  const gapX = 280;
  const gapY = 260;
  const nodes = [];
  const edges = [];
  // 8 個ずつのまとまり（連結成分）に分けておく。強調表示モードの効果が分かるように
  const cluster0 = (k) => Math.floor(k / 8);
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const type = TYPES[i % TYPES.length];
    const itemCount = 1 + (i % 3);
    const items = [];
    for (let k = 0; k < itemCount; k++) {
      items.push({
        id: `p${k}`,
        label: ['value', 'threshold', 'mode'][k],
        value: k === 0 ? String((i * 7) % 100) : k === 1 ? '0.5' : 'auto',
        // value の入力は 1 本まで（満杯になると橙色）、threshold は 2 本まで、mode は無制限
        input: k === 0 ? { max: 1 } : k === 1 ? 2 : true,
        output: true,
      });
    }
    // 9 個ごとに 1 つ、中に子ノードを持つノードを作る（childs）
    const childs =
      i % 9 === 4
        ? [
            {
              id: `n${i}c0`,
              type: 'input',
              title: `child A of #${i}`,
              input: true,
              output: true,
              items: [{ id: 'p0', label: 'value', value: 'a', input: { max: 1 }, output: true }],
            },
            {
              id: `n${i}c1`,
              type: 'output',
              title: `child B of #${i}`,
              input: true,
              output: true,
              // 子の中の子（入れ子は何段でも可）
              childs: [{ id: `n${i}c2`, type: 'note', title: `grandchild of #${i}`, input: true, output: true }],
            },
          ]
        : undefined;
    nodes.push({
      id: `n${i}`,
      type,
      title: `${type} #${i}`,
      x: col * gapX,
      y: row * gapY + (col % 2) * 20,
      input: true,
      // ヘッダの出力から開始できるコネクタは 3 本まで。note ノードは端子の丸を表示しない（接続は残る）
      output: type === 'note' ? { max: 3, visible: false } : { max: 3 },
      items,
      ...(childs ? { childs } : null),
      // 5 個ごとに 1 つメモを付ける。ノードの外にバッジで出て、他のノードと重ならない位置に置かれる
      ...(i % 5 === 1
        ? { note: { text: NOTE_TEXTS[(i / 5 | 0) % NOTE_TEXTS.length], color: NOTE_COLORS[i % NOTE_COLORS.length] } }
        : null),
    });
    // 7 個ごとに 1 つ、コネクタを使わない ID 指定の遷移（goto）を持たせる。
    // 選択・強調したときだけ点線の矢印で描かれる
    if (i % 7 === 3 && i + 2 < n) {
      items[0].goto = { to: `n${i + 2}`, label: 'goto' };
    }
    // 子ノードは外のノードとも自由に接続できる
    if (childs && i > 0 && cluster0(i) === cluster0(i - 1)) {
      edges.push({ id: `e${i}c`, source: `n${i}c0`, sourcePort: 'out', target: `n${i - 1}`, targetPort: 'in' });
    }
    const cluster = cluster0;
    // 左隣と接続（項目ポート同士）。まとまりを越えては繋がない
    if (col > 0 && cluster(i) === cluster(i - 1)) {
      edges.push({
        id: `e${i}a`,
        source: `n${i - 1}`,
        sourcePort: 'item:p0:out',
        target: `n${i}`,
        targetPort: 'item:p0:in',
      });
    }
    // 上と接続（ヘッダポート同士）
    if (row > 0 && i % 3 === 0 && cluster(i) === cluster(i - cols)) {
      edges.push({
        id: `e${i}b`,
        source: `n${i - cols}`,
        sourcePort: 'out',
        target: `n${i}`,
        targetPort: 'in',
        // コネクタにもメモを付けられる（中点の近くにバッジが出る）
        ...(i % 9 === 0 ? { note: { text: 'この経路は暫定', color: 'amber' } } : null),
      });
    }
  }
  return { nodes, edges };
}

function regen() {
  const n = Math.max(1, Number(document.getElementById('count').value) || 1);
  const t0 = performance.now();
  el.load(generate(n));
  const t1 = performance.now();
  el.editor.viewport.reset();
  el.editor.viewport.panBy(40, 40);
  el.editor.requestRender();
  console.log(`generated ${n} nodes in ${(t1 - t0).toFixed(1)}ms`);
}

el.addEventListener('ready', () => {
  el.nodeTypes = nodeTypes;
  regen();
});

el.addEventListener('render', (e) => {
  const ed = el.editor;
  const { nodes, edges, ms } = e.detail;
  stats.textContent = `描画: ${nodes} nodes / ${edges} edges / ${ms.toFixed(1)}ms  (全体 ${ed.graph.nodes.size} nodes, ${ed.graph.edges.size} edges)`;
});

const newNodeSpec = () => ({
  type: 'process',
  title: '新しいノード',
  input: true,
  output: true,
  items: [{ label: 'value', value: '0', input: true, output: true }],
});

// 空白ダブルクリック → その位置（ヘッダ中央）に追加
el.addEventListener('canvas-dblclick', (e) => {
  el.addNodeAt(newNodeSpec(), { at: { x: e.detail.x, y: e.detail.y }, anchor: 'header' });
});

// N キー → マウス位置に追加（canvas 外なら画面中央）
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  el.addNodeAtPointer(newNodeSpec(), { avoidOverlap: true });
});

// 右クリックメニューに独自項目を足す例（既定の項目はそのまま残す）
el.contextMenuItems = (ctx) => [
  ...ctx.defaultItems,
  { type: 'separator' },
  {
    id: 'log-target',
    label: ctx.node ? `「${ctx.node.title}」の中身をログ出力` : ctx.edge ? 'このコネクタをログ出力' : 'グラフの件数をログ出力',
    run: (c) => {
      if (c.node) console.log('node', c.node.id, c.node);
      else if (c.edge) console.log('edge', c.edge.id, c.edge);
      else console.log('graph', c.graph.nodes.size, 'nodes /', c.graph.edges.size, 'edges');
    },
  },
];
el.addEventListener('context-menu-select', (e) => console.log('context-menu-select', e.detail.id));

// クリックイベント（コンソールで確認）
el.addEventListener('node-click', (e) => {
  const { node, item, header, shiftKey } = e.detail;
  console.log('node-click', node.id, item ? `item=${item.id}` : header ? 'header' : 'body', shiftKey ? '(shift)' : '');
});
el.addEventListener('item-click', (e) => console.log('item-click', e.detail.node.id, e.detail.item.id, e.detail.item.label));
el.addEventListener('edge-click', (e) => console.log('edge-click', e.detail.edge.id));
el.addEventListener('canvas-click', (e) => console.log('canvas-click', Math.round(e.detail.x), Math.round(e.detail.y)));

document.getElementById('regen').addEventListener('click', regen);
document.getElementById('add').addEventListener('click', () => {
  el.addNodeAtCenter(
    { type: 'note', title: 'メモ', input: true, output: true, items: [{ label: 'text', value: 'ダブルクリックで編集', input: false, output: false }] },
    { avoidOverlap: true },
  );
});
// 選択ノードの中に子ノードを追加
document.getElementById('add-child').addEventListener('click', () => {
  const id = el.editor?.selection.nodes.values().next().value;
  if (!id) return void console.log('ノードを選択してください');
  const parent = id;
  const child = el.addChild(parent, {
    type: 'process',
    title: `子 ${el.childrenOf(parent).length + 1}`,
    input: true,
    output: true,
    items: [{ label: 'value', value: '0', input: true, output: true }],
  });
  if (child) el.editor.select({ nodes: [child.id] });
});

// 選択した子ノードを親から出す（親のすぐ下に置く）
document.getElementById('detach-child').addEventListener('click', () => {
  const ed = el.editor;
  const id = ed?.selection.nodes.values().next().value;
  if (!id) return void console.log('ノードを選択してください');
  const root = el.rootNodeOf(id);
  if (!root || root.id === id) return void console.log('子ノードを選択してください');
  const rect = ed.graph.nodeRect(root);
  el.detachChild(id, { x: rect.x, y: rect.y + rect.h + 30 });
});

document.getElementById('onfull').addEventListener('change', (e) => {
  el.onFull = e.target.checked ? 'replace' : 'reject';
});
el.addEventListener('connect-rejected', (e) => {
  console.log('接続数の上限に達しています', e.detail);
});
document.getElementById('snap').addEventListener('change', (e) => {
  el.moveSnap = Number(e.target.value);
});

// コネクタの描画方法（選択中のコネクタがあればそれだけ、なければ全体）
document.getElementById('edge-type').addEventListener('change', (e) => {
  el.setSelectedEdgeType(e.target.value);
});
el.addEventListener('edge-type-change', (e) => {
  if (!e.detail.edges) document.getElementById('edge-type').value = e.detail.type;
});

// 選択ノードと繋がっている要素を強調（他は薄くなる）。値は "モード:向き"
document.getElementById('focus').addEventListener('change', (e) => {
  const [mode, direction = 'lineage'] = e.target.value.split(':');
  el.setFocusMode(mode, { direction });
});
el.addEventListener('focus-change', (e) => {
  const { mode, direction, nodes, edges } = e.detail;
  document.getElementById('focus').value = mode === 'off' ? 'off' : `${mode}:${direction}`;
  console.log('強調対象', mode, direction, nodes.length, 'ノード /', edges.length, 'コネクタ');
});
document.getElementById('dragmode').addEventListener('change', (e) => {
  el.dragMode = e.target.checked ? 'select' : 'pan';
});
document.getElementById('theme').addEventListener('change', (e) => {
  el.theme = e.target.checked
    ? {
        background: '#0f172a',
        grid: { color: '#1e293b', majorColor: '#334155' },
        node: { fill: '#1e293b', stroke: '#475569', headerFill: '#334155', titleColor: '#f1f5f9', textColor: '#cbd5e1', itemSeparator: '#334155', shadow: 'rgba(0,0,0,0.4)' },
        edge: { stroke: '#64748b' },
        port: { fill: '#1e293b', stroke: '#94a3b8', connectedFill: '#94a3b8' },
        minimap: { background: 'rgba(15,23,42,0.9)', border: '#475569', node: '#64748b' },
      }
    : {
        background: '#f6f7f9',
        grid: { color: '#e0e3e8', majorColor: '#cfd4db' },
        node: { fill: '#ffffff', stroke: '#c9ced6', headerFill: '#eef1f5', titleColor: '#1f2933', textColor: '#3b4652', itemSeparator: '#eef1f5', shadow: 'rgba(0,0,0,0.08)' },
        edge: { stroke: '#7c8794' },
        port: { fill: '#ffffff', stroke: '#64748b', connectedFill: '#64748b' },
        minimap: { background: 'rgba(255,255,255,0.9)', border: '#c9ced6', node: '#94a3b8' },
      };
});

// --- 左のノードパレット（ドラッグ&ドロップで追加）---------------------------
// 1 ノードのものは spec（addNodeAt に渡す）、複数ノードのものは json（insertJSON に渡す）
const PALETTE = [
  { group: 'ノード種別', name: '入力', hint: '入力ノード。ヘッダの入力端子なし',
    spec: () => ({ type: 'input', title: '入力', input: false, output: { max: 3 },
      items: [{ label: 'value', value: '0', output: true }] }) },
  { group: 'ノード種別', name: '処理', hint: '処理ノード',
    spec: () => ({ type: 'process', title: '処理', input: true, output: { max: 3 },
      items: [{ label: 'value', value: '0', input: { max: 1 }, output: true },
               { label: 'threshold', value: '0.5', input: 2, output: true }] }) },
  { group: 'ノード種別', name: '出力', hint: '出力ノード。ヘッダの出力端子なし',
    spec: () => ({ type: 'output', title: '出力', input: true, output: false,
      items: [{ label: 'value', value: '0', input: true }] }) },
  { group: 'ノード種別', name: 'メモ', hint: '端子を表示しないメモ用ノード',
    spec: () => ({ type: 'note', title: 'メモ', input: true, output: { max: 3, visible: false },
      items: [{ label: 'text', value: 'ダブルクリックで編集', input: false, output: false }] }) },

  { group: 'テンプレート', name: '選択肢 3 つ', hint: '項目ごとに出力端子を持つ分岐用ノード',
    spec: () => ({ type: 'process', title: '選択肢', input: true, output: { max: 3 },
      items: [{ label: '料金について', value: '1', input: false, output: { max: 1 } },
               { label: '使い方について', value: '2', input: false, output: { max: 1 } },
               { label: '有人に切り替え', value: '3', input: false, output: { max: 1 } }] }) },
  { group: 'テンプレート', name: '子ノード付き', hint: '中に子ノードを 2 つ持つノード（孫も可）',
    spec: () => ({ type: 'process', title: '親', input: true, output: true,
      childs: [
        { type: 'input', title: '子 A', input: true, output: true,
          items: [{ label: 'value', value: 'a', input: { max: 1 }, output: true }] },
        { type: 'output', title: '子 B', input: true, output: true },
      ] }) },
  { group: 'テンプレート', name: 'メモ付き', hint: 'ノードの外にバッジで出るメモ付き',
    spec: () => ({ type: 'process', title: 'メモ付き', input: true, output: true,
      note: { text: 'ここを直す', color: 'amber' },
      items: [{ label: 'value', value: '0', input: true, output: true }] }) },
  { group: 'テンプレート（複数ノード）', name: '3 連ノード', hint: '入力 → 処理 → 出力 をまとめて追加',
    json: {
      nodes: [
        { id: 't1', type: 'input', title: '入力', x: 0, y: 0, output: true, items: [{ id: 'a', label: 'value', value: '1', output: true }] },
        { id: 't2', type: 'process', title: '処理', x: 300, y: 60, input: true, output: true, items: [{ id: 'b', label: 'value', value: '2', input: true, output: true }] },
        { id: 't3', type: 'output', title: '出力', x: 600, y: 0, input: true, items: [{ id: 'c', label: 'value', value: '3', input: true }] },
      ],
      edges: [
        { source: 't1', sourcePort: 'item:a:out', target: 't2', targetPort: 'item:b:in' },
        { source: 't2', sourcePort: 'item:b:out', target: 't3', targetPort: 'item:c:in' },
      ],
    } },
  { group: 'テンプレート（複数ノード）', name: 'goto の組',
    hint: 'コネクタを使わない ID 指定の遷移（goto）。選択・強調したときだけ点線で出る',
    json: {
      nodes: [
        { id: 'g0', type: 'process', title: 'アンケート', x: 0, y: 0, input: true, output: true,
          items: [{ id: 'again', label: 'はじめに戻る', goto: { to: 'g1', label: '戻る' } }] },
        { id: 'g1', type: 'input', title: 'あいさつ', x: 0, y: 180, input: true, output: true },
      ],
      edges: [],
    } },
  { group: 'テンプレート（複数ノード）', name: '分岐', hint: '1 ノードから 2 方向へ分かれる形',
    json: {
      nodes: [
        { id: 'b0', type: 'process', title: '分岐', x: 0, y: 0, input: true, output: true,
          items: [{ id: 'y', label: 'はい', output: { max: 1 } }, { id: 'n', label: 'いいえ', output: { max: 1 } }] },
        { id: 'b1', type: 'output', title: 'はいの先', x: 300, y: -60, input: true },
        { id: 'b2', type: 'output', title: 'いいえの先', x: 300, y: 80, input: true },
      ],
      edges: [
        { source: 'b0', sourcePort: 'item:y:out', target: 'b1', targetPort: 'in' },
        { source: 'b0', sourcePort: 'item:n:out', target: 'b2', targetPort: 'in' },
      ],
    } },
];

const paletteEl = document.getElementById('palette');

/** パレット項目の見た目（ノードの縮小版）を組み立てる */
function palettePreview(entry) {
  const wrap = document.createElement('div');
  wrap.className = 'pal-preview';
  const nodes = entry.json ? entry.json.nodes : [entry.spec()];
  for (const n of nodes.slice(0, 3)) {
    const card = document.createElement('div');
    card.className = 'pal-node';
    card.dataset.type = n.type ?? 'process';
    const head = document.createElement('div');
    head.className = 'pal-head';
    head.textContent = n.title ?? '';
    if (n.note) {
      const b = document.createElement('span');
      b.className = 'pal-badge';
      b.textContent = 'メモ';
      head.appendChild(b);
    }
    card.appendChild(head);
    for (const it of (n.items ?? []).slice(0, 3)) {
      const row = document.createElement('div');
      row.className = 'pal-row';
      row.textContent = it.goto ? `${it.label} ⇢` : it.label;
      card.appendChild(row);
    }
    for (const c of (n.childs ?? []).slice(0, 2)) {
      const row = document.createElement('div');
      row.className = 'pal-row child';
      row.textContent = `└ ${c.title}`;
      card.appendChild(row);
    }
    wrap.appendChild(card);
  }
  if (nodes.length > 3) {
    const more = document.createElement('div');
    more.className = 'pal-row';
    more.textContent = `ほか ${nodes.length - 3} ノード`;
    wrap.appendChild(more);
  }
  const name = document.createElement('div');
  name.className = 'pal-name';
  name.textContent = entry.name;
  wrap.appendChild(name);
  return wrap;
}

function buildPalette() {
  let group = null;
  PALETTE.forEach((entry, i) => {
    if (entry.group !== group) {
      group = entry.group;
      const h = document.createElement('h3');
      h.textContent = group;
      paletteEl.appendChild(h);
    }
    const item = document.createElement('div');
    item.className = 'pal-item';
    item.draggable = true;
    item.tabIndex = 0;
    item.dataset.index = String(i);
    item.title = entry.hint ?? entry.name;
    item.appendChild(palettePreview(entry));
    paletteEl.appendChild(item);
  });
  // ノード種別の色をキャンバスの見た目に合わせる
  for (const card of paletteEl.querySelectorAll('.pal-node')) {
    const style = nodeTypes[card.dataset.type]?.style ?? {};
    if (style.headerFill) card.style.setProperty('--pal-head', style.headerFill);
    if (style.stroke) card.style.setProperty('--pal-stroke', style.stroke);
    if (style.fill) card.style.setProperty('--pal-fill', style.fill);
  }
}

/** パレットの項目をキャンバスへ追加する。at を渡さなければ画面中央 */
function addFromPalette(entry, client) {
  if (entry.json) {
    // 複数ノードは insertJSON（anchor:'origin' = JSON の座標を追加位置からの相対として扱う）
    const json = structuredClone(entry.json);
    const res = el.insertJSON(json, { client, anchor: 'origin' });
    console.log('パレットから挿入', entry.name, res);
    return;
  }
  const node = client
    ? el.addNodeAt(entry.spec(), { client, anchor: 'header', avoidOverlap: true })
    : el.addNodeAtCenter(entry.spec(), { avoidOverlap: true });
  console.log('パレットから追加', entry.name, node?.id);
}

const entryOf = (target) => {
  const item = target?.closest?.('.pal-item');
  return item ? PALETTE[Number(item.dataset.index)] : null;
};

let dragEntry = null;

paletteEl.addEventListener('dragstart', (e) => {
  const entry = entryOf(e.target);
  if (!entry) return;
  dragEntry = entry;
  e.target.closest('.pal-item').classList.add('dragging');
  e.dataTransfer.effectAllowed = 'copy';
  // 他のアプリへ落としたときのために JSON も載せておく
  e.dataTransfer.setData('application/json', JSON.stringify(entry.json ?? { nodes: [entry.spec()] }));
  e.dataTransfer.setData('text/plain', entry.name);
});
paletteEl.addEventListener('dragend', (e) => {
  e.target.closest?.('.pal-item')?.classList.remove('dragging');
  dragEntry = null;
  el.classList.remove('drop-target');
});
// クリック / Enter でも画面中央に追加できる
paletteEl.addEventListener('click', (e) => {
  const entry = entryOf(e.target);
  if (entry) addFromPalette(entry);
});
paletteEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const entry = entryOf(e.target);
  if (!entry) return;
  e.preventDefault();
  addFromPalette(entry);
});

// エディタ側の受け口。JSON ファイルのドロップ（ライブラリ内蔵）とは types が違うので競合しない
el.addEventListener('dragover', (e) => {
  if (!dragEntry) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  el.classList.add('drop-target');
});
el.addEventListener('dragleave', (e) => {
  if (e.relatedTarget && el.contains(e.relatedTarget)) return;
  el.classList.remove('drop-target');
});
el.addEventListener('drop', (e) => {
  if (!dragEntry) return;
  e.preventDefault();
  e.stopPropagation();
  el.classList.remove('drop-target');
  addFromPalette(dragEntry, e);
  dragEntry = null;
});

buildPalette();

// デバッグ用
window.editor = el;

/**
 * 型定義の検証用。実行はせず `tsc --noEmit` で型が通ることだけを確かめる。
 * 意図的に間違った使い方は @ts-expect-error で「エラーになること」を検証する。
 */
import {
  NodeEditor,
  Graph,
  History,
  Viewport,
  SpatialIndex,
  layeredLayout,
  normalizeEdgeType,
  normalizePortSpec,
  normalizeGoto,
  edgeGeometryFor,
  geometryPoint,
  geometryPolyline,
  portKey,
  parsePortKey,
  serialize,
  validate,
  defaultTheme,
  mergeTheme,
  uid,
  EDGE_TYPES,
  FORMAT,
  type Node,
  type NodeItem,
  type Edge,
  type EdgeType,
  type Theme,
  type ThemePatch,
  type HitTestResult,
  type CanvasFlowData,
  type PortInfo,
  type GotoLink,
} from '../../types/core.js';
import { CanvasFlowEditor, defaultContextMenuItems } from '../../types/lit.js';

/* ---------- コア ---------- */

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const editor = new NodeEditor(canvas, {
  theme: { lodZoom: 0.3, node: { headerFill: '#eef' }, edge: { type: 'step', stepOffset: 16 } },
  wheelMode: 'zoom',
  dragMode: 'select',
  moveSnap: 16,
  rules: { maxInputs: 1, onFull: 'replace' },
  minNodeWidth: 120,
});

editor.resize(800, 600);
editor.resizeMinimap(200, 140);

const a: Node = editor.graph.addNode({
  title: 'Source',
  x: 0,
  y: 0,
  output: { max: 3 },
  items: [{ id: 'v', label: 'value', value: 10, output: true, input: { max: 1, visible: false } }],
});
const b = editor.graph.addNode({ id: 'b', title: 'Sink', x: 400, y: 120, input: true, items: [{ id: 'in', input: 2 }] });

const edge: Edge | null = editor.graph.addEdge({
  source: a.id,
  sourcePort: portKey('v', 'out'),
  target: b.id,
  targetPort: 'item:in:in',
  type: 'step',
});

// 形状の型が type で絞り込める
if (edge) {
  const g = editor.graph.edgeGeometry(edge);
  if (g && g.type === 'bezier') {
    const cx: number = g.c1x;
    void cx;
  }
  if (g) {
    const pts: number = g.points.length;
    const mid = geometryPoint(g, 0.5);
    const poly = geometryPolyline(g, 12);
    void [pts, mid.x, poly.length];
  }
}

// ヒットテストの判別可能ユニオン
const hit: HitTestResult = editor.hitTest(10, 20);
switch (hit.type) {
  case 'item':
    console.log(hit.node.id, hit.item.id);
    break;
  case 'port':
    console.log(hit.port.dir, hit.port.visible);
    break;
  case 'edge':
  case 'edge-delete':
    console.log(hit.edge.source);
    break;
  case 'node':
    console.log(hit.header);
    break;
  case 'resize':
    console.log(hit.node.x);
    break;
  case 'none':
    break;
}

// イベントは名前から detail の型が決まる
editor.on('selection:change', ({ nodes, edges }) => console.log(nodes.length, edges.length));
editor.on('item:click', (d) => console.log(d.node.title, d.item.label, d.shiftKey, d.screen.x));
editor.on('edge-type:change', (d) => {
  const t: EdgeType = d.type;
  const ids: string[] | null = d.edges;
  void [t, ids];
});
const off = editor.on('render', (s) => console.log(s.ms, s.nodes, s.edges));
off();

editor.setEdgeType('step');
editor.setEdgeType('straight', [edge?.id ?? '']);
editor.setSelectedEdgeType('bezier');
const et: EdgeType = editor.edgeType;
editor.setMoveSnap(32);
const snapped: number = editor.snapValue(37);
const movedIds: string[] = editor.snapNodes();
editor.nudgeSelection(1, 0, { pixels: 10 });
editor.select({ nodes: [a.id] }, { additive: true });
editor.selectInRect({ x: 0, y: 0, w: 100, h: 100 });
const removed: string[] = editor.deleteSelectedEdges({ scope: 'attached' });
const found: Node[] = editor.search(/source/i);
editor.searchAndFocus((n) => n.title === 'Sink');
editor.centerOnNode(b.id, { zoom: 1.5, animate: false });
editor.fitView(40, { animate: true });

const data: CanvasFlowData = editor.exportData({ selectionOnly: true });
const json: string = editor.exportJSON({ pretty: false });
const imported = editor.importData(data, { mode: 'merge', anchor: 'origin', at: { x: 10, y: 10 } });
console.log(imported.ok, imported.warnings, imported.nodes.length);
editor.insertJSON(json, { anchor: 'origin', snap: true });
editor.load({ nodes: [], edges: [] });

const added: Node | null = editor.addNodeAtCenter({ title: 'new', x: 0, y: 0, input: true }, { anchor: 'header' });
void added;

// 描画関数の差し替え
editor.nodeRenderer = (ctx, node, rect, api) => {
  ctx.fillStyle = api.selected ? api.style.selectedStroke : api.style.fill;
  api.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
  ctx.fillText(api.fitText(node.title ?? '', rect.w), rect.x, rect.y);
  return !api.lod;
};
editor.edgeRenderer = (ctx, _edge, geom, api) => {
  ctx.strokeStyle = api.style.stroke;
  ctx.moveTo(geom.x1, geom.y1);
  return false;
};
editor.nodeRenderer = null;

console.log(editor.canUndo, editor.canRedo, editor.undo(), editor.redo());
console.log(editor.viewCenter().x, editor.getPointer()?.inside);
editor.destroy();

/* ---------- Graph 単体 ---------- */

const graph = new Graph({ layout: { headerHeight: 24, edgeType: 'straight' }, rules: { onFull: 'reject' } });
const n1 = graph.addNode({ id: 'n1', x: 0, y: 0, output: true });
graph.addNode({ id: 'n2', x: 200, y: 0, input: true });
graph.batch(() => {
  graph.moveNodes(['n1'], 10, 10);
  graph.updateNode('n1', { title: 'renamed' });
});
const ports: PortInfo[] = graph.nodePorts(n1, { visibleOnly: true });
const cap = graph.portCapacity('n1', 'out');
if (cap) console.log(cap.count, cap.max, cap.full);
const reason = graph.connectError('n1', 'out', 'n1', 'in');
if (reason === 'same-node') console.log('同じノード');
const item: NodeItem = { id: 'x', label: 'x' };
graph.addItem('n1', item, 0);
const dup = graph.duplicateNodes(['n1'], { x: 20, y: 20 });
console.log(dup.idMap.size, dup.nodes.length);
console.log(graph.bounds()?.w, graph.nodesInRect({ x: 0, y: 0, w: 10, h: 10 }).length);
graph.on('node:add', (node) => console.log(node.id));
graph.on('nodes:move', ({ ids, dx }) => console.log(ids, dx));

const history = new History(graph, { limit: 50 });
history.begin('まとめ');
history.end();
console.log(history.canUndo);
history.on('change', ({ canUndo }) => console.log(canUndo));

const vp = new Viewport({ minZoom: 0.1, maxZoom: 8 });
vp.setSize(800, 600);
console.log(vp.toWorld(10, 10).x, vp.visibleRect(40).w, vp.snapshot().zoom);

const index = new SpatialIndex(256);
index.insert('a', { x: 0, y: 0, w: 10, h: 10 });
console.log(index.query({ x: 0, y: 0, w: 5, h: 5 }));

/* ---------- ユーティリティ ---------- */

const positions: Map<string, { x: number; y: number }> = layeredLayout(graph, ['n1', 'n2'], { layerGap: 100 });
console.log(positions.get('n1')?.x);
const t2: EdgeType = normalizeEdgeType('orthogonal');
const spec = normalizePortSpec(3);
console.log(spec?.max, spec?.visible, t2);
console.log(parsePortKey('item:v:out')?.itemId, EDGE_TYPES[0], FORMAT, uid('n'));
console.log(edgeGeometryFor('step', { x: 0, y: 0 }, { x: 10, y: 10 }, { stepOffset: 8 }, -1).points.length);
const ser: CanvasFlowData = serialize(graph, { nodeIds: ['n1'] });
console.log(validate(ser).ok);
const theme: Theme = mergeTheme(defaultTheme, { node: { fill: '#000' } } satisfies ThemePatch);
console.log(theme.node.fill, theme.edge.deleteIcon.radius);

/* ---------- 強調表示 ---------- */

editor.setFocusMode('connected');
editor.setFocusMode('neighbors', { depth: 2, direction: 'downstream' });
editor.focusMode = true;
const mode = editor.focusMode;
const fset = editor.focusSet();
if (fset) console.log(fset.nodes.size, fset.edges.has('e1'));
const picked = editor.selectConnected({ direction: 'upstream' });
console.log(mode, picked?.nodes.length);
editor.on('focus:change', (d) => console.log(d.mode, d.direction, d.nodes.length, d.edges.length));
const focused = editor.selectFocused();
const focusedAdd = editor.selectFocused({ additive: true, direction: 'both' });
console.log(focused?.nodes.length, focusedAdd?.edges.length);
editor.on('focus:select', (d) => console.log(d.mode, d.nodes.length, d.edges.length));
const reach = graph.connectedTo(['n1'], { depth: 1, includeStart: false });
console.log(reach.nodes.size, reach.edges.size);

/* ---------- Lit 版 ---------- */

const el = document.createElement('canvas-flow-editor');
el.moveSnap = 16;
el.edgeType = 'step';
el.readOnly = false;
el.theme = { background: '#fff' };
el.addEventListener('ready', (e) => {
  const ed: NodeEditor = e.detail.editor;
  console.log(ed.graph.nodes.size);
});
el.addEventListener('node-click', (e) => console.log(e.detail.node.id, e.detail.header, e.detail.item?.label));
el.addEventListener('edges-delete', (e) => console.log(e.detail.ids, e.detail.scope));
el.setSelectedEdgeType('straight');
el.focusMode = 'connected';
el.setFocusMode('neighbors', { depth: 2 });
el.addEventListener('focus-change', (e) => console.log(e.detail.mode, e.detail.direction, e.detail.nodes.length));
el.addEventListener('focus-select', (e) => console.log(e.detail.mode, e.detail.nodes.length, e.detail.edges.length));
console.log(el.selectFocused()?.nodes.length, el.selectFocused({ additive: true })?.edges.length);
console.log(el.canUndo, el.toJSON().nodes.length);
el.addChild('parent', { title: '子', items: [{ id: 'q', label: 'q', input: true }] });
console.log(el.childrenOf('parent').length, el.rootNodeOf('parent')?.id);
el.setParent('parent', null);
console.log(el.detachChild('parent', { x: 10, y: 10 })?.id);
const inst: CanvasFlowEditor = el;
void inst;

/* ---------- 子ノード ---------- */

const withChildren = graph.addNode({
  id: 'parent',
  x: 0,
  y: 0,
  title: '親',
  input: true,
  output: true,
  items: [{ id: 'p0', label: '項目', output: true }],
  childs: [
    {
      id: 'kid',
      title: '子',
      input: true,
      output: true,
      items: [{ id: 'p1', label: '子の項目', input: true }],
      childs: [{ title: '孫' }],
    },
  ],
});
console.log(withChildren.childs === undefined, graph.childrenOf(withChildren).length);
console.log(graph.isChild('kid'), graph.depthOf('kid'), graph.parentOf('kid')?.id, graph.rootOf('kid')?.id);
console.log(graph.descendantIds('parent', { includeSelf: true }).length, graph.rootNodes().length);
console.log(graph.nodeWidthOfChild('parent'), graph.portEdgeX(graph.getNode('kid')!).out);
graph.addChild('parent', { title: 'あとから追加' }, 0);
graph.setParent('kid', null);
graph.setParent('kid', 'parent', 1);
graph.relayoutChildren('parent', { reindex: false });
const detached = graph.removeChild('kid', { x: 400, y: 200 });
console.log(detached?.x, graph.layout.childIndent, graph.layout.childGap);
editor.addChild('parent', { title: 'エディタ経由' });
console.log(editor.childrenOf('parent').length, editor.rootNodeOf('parent')?.id);
editor.setParent('parent', null);
console.log(editor.removeChild('parent')?.id);

/* ---------- 追加描画（オーバーレイ） ---------- */

editor.overlayRenderer = (ctx, info) => {
  for (const node of info.nodes) {
    const rect = info.graph.nodeRect(node);
    ctx.fillStyle = 'rgba(59,130,246,0.3)';
    ctx.fillRect(rect.x, rect.y + rect.h, rect.w / 2, 4 / info.zoom);
    if (!info.lod) console.log(info.fitText(node.title ?? '', rect.w), info.visible.w, info.theme.lodZoom);
  }
};
editor.overlayRenderer = null;

/* ---------- 右クリックメニュー ---------- */

editor.on('context:menu', (d) => {
  console.log(d.type, d.node?.id, d.item?.label, d.edge?.id, d.x, d.y, d.screen.x, d.client.y, d.selection.nodes.length);
  d.originalEvent.preventDefault();
});
el.contextMenu = false;
el.contextMenuItems = [{ id: 'only', label: '固定', run: () => {} }];
el.contextMenuItems = (ctx) => [
  ...ctx.defaultItems.filter((i) => i.id !== 'export'),
  { type: 'separator' },
  {
    id: 'log',
    label: 'ID をログ出力',
    shortcut: 'Ctrl+L',
    danger: false,
    disabled: ctx.type === 'none',
    run: (c) => console.log(c.node?.id ?? c.edge?.id, c.el.tagName, c.editor.focusMode, c.graph.nodes.size),
  },
];
el.contextMenuItems = defaultContextMenuItems;
el.addEventListener('context-menu', (e) => {
  console.log(e.detail.type, e.detail.node?.title);
  if (e.detail.type === 'none') e.preventDefault();
});
el.addEventListener('context-menu-select', (e) => console.log(e.detail.id, e.detail.item.label, e.detail.target?.type));
el.closeContextMenu();
el.openContextMenuAt(10, 20);
el.openContextMenuAt(10, 20, { type: 'node' });

/* ---------- goto（ID 指定の遷移） ---------- */

const menu = graph.addNode({
  id: 'menu',
  x: 0,
  y: 0,
  title: 'メニュー',
  goto: 'survey',
  items: [
    { id: 'm1', label: '料金', goto: 'price' },
    { id: 'm2', label: '使い方', goto: { to: 'howto', label: '使い方へ' } },
    { id: 'm3', label: 'その他', goto: ['faq', { to: 'agent' }] },
  ],
});
console.log(menu.goto, normalizeGoto(menu.goto ?? null).length);
const gl: GotoLink[] = graph.gotoLinks(menu);
console.log(gl.map((l) => [l.key, l.from, l.itemId, l.to, l.label, l.exists]));
console.log(graph.gotoLinks().length, graph.gotoSources('price').length, graph.gotoTargets(menu).length);
graph.setGoto('menu', 'price', { itemId: 'm1' });
graph.setGoto(menu, null);
const anchor = graph.gotoAnchor(gl[0]);
console.log(anchor?.a.x, anchor?.b.y);
const reach2 = graph.connectedTo(['menu'], { direction: 'downstream', links: false });
console.log(reach2.links.size);
editor.setGoto('menu', { to: 'price', label: '→ 料金' });
console.log(editor.gotoLinks('menu').length, editor.gotoSources('menu').length);
editor.setTheme({ goto: { stroke: '#f00', dash: [2, 2], arrow: 12 } });
el.setGoto('menu', ['price', 'howto']);
console.log(el.gotoLinks().length, el.gotoSources('price').length);
el.addEventListener('focus-change', (e) => console.log(e.detail.links.length));

/* ---------- 間違った使い方はエラーになること ---------- */

// @ts-expect-error 未知の描画方法
editor.graph.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in', type: 'wavy' });
// @ts-expect-error scope の値が不正
editor.deleteSelectedEdges({ scope: 'everything' });
// @ts-expect-error x, y は必須
graph.addNode({ title: 'no position' });
// @ts-expect-error 存在しないイベント名
editor.on('does:not:exist', () => {});
// @ts-expect-error detail のプロパティ名が違う
editor.on('selection:change', (d) => console.log(d.selectedNodes));
// @ts-expect-error item は string ではない
el.addEventListener('item-click', (e) => console.log(e.detail.item.toUpperCase()));
// @ts-expect-error theme のキーが不正
editor.setTheme({ nodes: { fill: '#fff' } });
// @ts-expect-error 不正な強調モード
editor.setFocusMode('everything');
// @ts-expect-error 不正な向き
graph.connectedTo(['n1'], { direction: 'sideways' });

// @ts-expect-error childs の中身はノードの形でなければならない
graph.addNode({ x: 0, y: 0, childs: ['child'] });
// @ts-expect-error parentId は string か null
graph.setParent('kid', 123);

// @ts-expect-error additive は boolean
editor.selectFocused({ additive: 'yes' });

// @ts-expect-error run は関数
el.contextMenuItems = [{ id: 'x', label: 'x', run: 'nope' }];
// @ts-expect-error 区切り線の type は 'separator' だけ
el.contextMenuItems = [{ type: 'divider' }];

// @ts-expect-error goto は文字列 / 配列 / {to,label}
graph.addNode({ x: 0, y: 0, goto: 42 });
// @ts-expect-error to は必須
graph.addNode({ x: 0, y: 0, goto: { label: 'なし' } });

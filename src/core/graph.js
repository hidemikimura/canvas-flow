import { Emitter } from './emitter.js';
import { SpatialIndex } from './spatial-index.js';

/**
 * @typedef {boolean|number|{max?:number, visible?:boolean}} PortSpec
 *   ポートの有無・接続数の上限・表示。
 *   - false / 省略 : ポート無し（接続もできない）
 *   - true         : 上限なし（graph.rules の既定上限に従う）
 *   - 数値 n       : 最大 n 本
 *   - { max: n, visible: false } : 最大 n 本（省略時は上限なし）。visible: false で端子の丸を描かない
 *   非表示のポートには接続操作（ドラッグの開始・終了）ができないが、既存のコネクタやプログラムからの接続は有効。
 *   ノード / 項目の `showPorts: false` で、その要素の全ポートをまとめて非表示にできる。
 *
 * @typedef {Object} NodeItem
 * @property {string} id       ノード内で一意な ID
 * @property {string} label    表示ラベル
 * @property {string} [value]  値（編集可能）
 * @property {PortSpec} [input]  左側の入力ポート（このポートに終了できるコネクタ数）
 * @property {PortSpec} [output] 右側の出力ポート（このポートから開始できるコネクタ数）
 *
 * @typedef {Object} Node
 * @property {string} id
 * @property {string} [type]      ノード種別（見た目の切替などに利用）
 * @property {string} title
 * @property {number} x
 * @property {number} y
 * @property {number} [width]
 * @property {NodeItem[]} items
 * @property {PortSpec} [input]   ヘッダ左の入力ポート
 * @property {PortSpec} [output]  ヘッダ右の出力ポート
 * @property {Object} [style]     テーマ node.* の上書き
 * @property {Object} [data]      任意データ
 *
 * @typedef {Object} Edge
 * @property {string} id
 * @property {string} source      出力側ノード ID
 * @property {string} sourcePort  出力側ポートキー
 * @property {string} target      入力側ノード ID
 * @property {string} targetPort  入力側ポートキー
 * @property {Object} [style]     テーマ edge.* の上書き
 * @property {Object} [data]
 */

let _seq = 0;
/** 衝突しにくい短い ID を生成する */
export function uid(prefix = 'id') {
  _seq = (_seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${_seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** ポートキーを組み立てる。項目のポートは 'item:<itemId>:in|out'、ヘッダは 'in' | 'out' */
export function portKey(itemId, dir) {
  return itemId == null ? dir : `item:${itemId}:${dir}`;
}

/**
 * PortSpec を正規化する。ポートが無ければ null、あれば { max } を返す。
 * @param {PortSpec|undefined} spec
 * @param {number} [defaultMax=Infinity]
 */
export function normalizePortSpec(spec, defaultMax = Infinity) {
  if (spec == null || spec === false) return null;
  if (spec === true) return { max: defaultMax, visible: true };
  if (typeof spec === 'number') return spec > 0 ? { max: spec, visible: true } : null;
  if (typeof spec === 'object') {
    const max = spec.max;
    return { max: typeof max === 'number' && max > 0 ? max : defaultMax, visible: spec.visible !== false };
  }
  return null;
}

/** PortSpec に visible を設定した新しい値を返す（true / 数値はオブジェクトに変換） */
export function withPortVisible(spec, visible) {
  if (spec == null || spec === false) return spec;
  const base = spec === true ? {} : typeof spec === 'number' ? { max: spec } : { ...spec };
  if (visible) delete base.visible;
  else base.visible = false;
  return Object.keys(base).length === 0 ? true : base;
}

export function parsePortKey(key) {
  if (key === 'in' || key === 'out') return { itemId: null, dir: key };
  const m = /^item:(.+):(in|out)$/.exec(key);
  return m ? { itemId: m[1], dir: m[2] } : null;
}

export const EDGE_TYPES = ['bezier', 'straight', 'step'];

/** 'bezier' | 'straight' | 'step' 以外は 'bezier' に丸める（'curve'/'line'/'orthogonal' などの別名も受け付ける） */
export function normalizeEdgeType(type) {
  switch (type) {
    case 'straight':
    case 'line':
    case 'linear':
      return 'straight';
    case 'step':
    case 'orthogonal':
    case 'smoothstep':
    case 'right-angle':
      return 'step';
    default:
      return 'bezier';
  }
}

/**
 * 2 点 a（出力ポート）→ b（入力ポート）を結ぶコネクタの形状を作る。
 * renderer の仮コネクタ（ドラッグ中）でも同じ形になるよう共有する。
 * @param {'bezier'|'straight'|'step'} type
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {{curvature?:number, stepOffset?:number}} [layout]
 * @param {1|-1} [dir] a 側の向き（1 = a が出力ポートで右向き、-1 = a が入力ポートで左向き）
 */
export function edgeGeometryFor(type, a, b, layout = {}, dir = 1) {
  const base = { type, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  if (type === 'straight') {
    return { ...base, points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] };
  }
  if (type === 'step') {
    const off = Math.max(0, layout.stepOffset ?? 24);
    const pts = [{ x: a.x, y: a.y }];
    // dir=-1 のときは a・b を役割入れ替えして計算し、最後に反転する
    const s = dir === 1 ? a : b;
    const e = dir === 1 ? b : a;
    const seg = [];
    if (e.x - s.x >= off * 2) {
      // 前方にある: 中央で 1 回だけ縦に折れる ┐└
      const mx = (s.x + e.x) / 2;
      seg.push({ x: mx, y: s.y }, { x: mx, y: e.y });
    } else {
      // 後方（または近すぎる）: 右に突き出し → 上下の中間で戻り → 左から入る
      const my = (s.y + e.y) / 2;
      seg.push({ x: s.x + off, y: s.y }, { x: s.x + off, y: my }, { x: e.x - off, y: my }, { x: e.x - off, y: e.y });
    }
    if (dir === -1) seg.reverse();
    // 同一直線上に並ぶ重複点を除く
    for (const p of seg) {
      const last = pts[pts.length - 1];
      if (Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
      pts.push(p);
    }
    pts.push({ x: b.x, y: b.y });
    return { ...base, points: pts };
  }
  const d = Math.max(40, Math.abs(b.x - a.x) * (layout.curvature ?? 0.5));
  const c1 = { x: a.x + d * dir, y: a.y };
  const c2 = { x: b.x - d * dir, y: b.y };
  return { ...base, c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, points: [{ x: a.x, y: a.y }, c1, c2, { x: b.x, y: b.y }] };
}

/** 形状上の点（t=0〜1）。bezier は媒介変数、折れ線は道のり比 */
export function geometryPoint(g, t = 0.5) {
  if (g.type === 'bezier') {
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return {
      x: a * g.x1 + b * g.c1x + c * g.c2x + d * g.x2,
      y: a * g.y1 + b * g.c1y + c * g.c2y + d * g.y2,
    };
  }
  const pts = g.points;
  let total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  if (total === 0) return { x: g.x1, y: g.y1 };
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const k = lens[i] === 0 ? 0 : target / lens[i];
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
    }
    target -= lens[i];
  }
  return { x: g.x2, y: g.y2 };
}

/** 形状を折れ線（頂点列）で近似する。ヒットテスト用 */
export function geometryPolyline(g, segments = 24) {
  if (g.type !== 'bezier') return g.points;
  const out = [];
  for (let i = 0; i <= segments; i++) out.push(geometryPoint(g, i / segments));
  return out;
}

/**
 * ノードとコネクタ（エッジ）を保持するモデル。
 * 座標計算に必要なレイアウト値（ヘッダ高さなど）は `layout` で渡す。
 */
export class Graph extends Emitter {
  constructor({ layout, rules, cellSize = 512 } = {}) {
    super();
    /** @type {Map<string, Node>} */
    this.nodes = new Map();
    /** @type {Map<string, Edge>} */
    this.edges = new Map();
    /** ノード ID → 接続エッジ ID */
    this._adjacency = new Map();
    this.nodeIndex = new SpatialIndex(cellSize);
    this.edgeIndex = new SpatialIndex(cellSize);
    this.layout = {
      headerHeight: 30,
      itemHeight: 26,
      padding: 8,
      defaultWidth: 200,
      curvature: 0.5,
      /** コネクタの描画方法の既定: 'bezier' | 'straight' | 'step'（コネクタ単位は edge.type で上書き） */
      edgeType: 'bezier',
      /** step のときの水平方向の最小突き出し量 */
      stepOffset: 24,
      ...layout,
    };
    /**
     * 接続ルール。
     *  - maxInputs / maxOutputs : ポート側で上限を指定しないときの既定上限
     *  - onFull : 上限に達したポートへ接続しようとしたとき 'reject'（拒否）か 'replace'（古いコネクタを外して付け替え）
     */
    this.rules = { maxInputs: Infinity, maxOutputs: Infinity, onFull: 'reject', ...(rules ?? {}) };
    this._batchDepth = 0;
    this._dirty = false;
    /** true の間は 'op' を発火しない（履歴の適用中・読み込み中） */
    this.silentOps = false;
  }

  /* ---------- レイアウト ---------- */

  setLayout(layout) {
    Object.assign(this.layout, layout);
    this.reindexAll();
  }

  nodeWidth(node) {
    return node.width ?? this.layout.defaultWidth;
  }

  nodeHeight(node) {
    const { headerHeight, itemHeight, padding } = this.layout;
    const n = node.items ? node.items.length : 0;
    return headerHeight + (n > 0 ? n * itemHeight + padding : 0);
  }

  /** @returns {{x:number,y:number,w:number,h:number}} */
  nodeRect(node) {
    return { x: node.x, y: node.y, w: this.nodeWidth(node), h: this.nodeHeight(node) };
  }

  /** 全ポートの位置一覧を返す */
  nodePorts(node, { visibleOnly = false } = {}) {
    const { headerHeight, itemHeight, padding } = this.layout;
    const w = this.nodeWidth(node);
    const ports = [];
    const push = (owner, spec, key, dir, itemId, x, y) => {
      if (!spec) return;
      const visible = owner.showPorts !== false && node.showPorts !== false && !(typeof spec === 'object' && spec.visible === false);
      if (visibleOnly && !visible) return;
      ports.push({ key, dir, itemId, x, y, visible });
    };
    push(node, node.input, 'in', 'in', null, node.x, node.y + headerHeight / 2);
    push(node, node.output, 'out', 'out', null, node.x + w, node.y + headerHeight / 2);
    if (node.items) {
      let y = node.y + headerHeight + padding / 2;
      for (const item of node.items) {
        const cy = y + itemHeight / 2;
        push(item, item.input, portKey(item.id, 'in'), 'in', item.id, node.x, cy);
        push(item, item.output, portKey(item.id, 'out'), 'out', item.id, node.x + w, cy);
        y += itemHeight;
      }
    }
    return ports;
  }

  /** ポートが表示されているか（存在しなければ false） */
  portVisible(nodeOrId, key) {
    const node = typeof nodeOrId === 'string' ? this.nodes.get(nodeOrId) : nodeOrId;
    const p = parsePortKey(key);
    if (!node || !p) return false;
    const owner = p.itemId == null ? node : (node.items ?? []).find((it) => it.id === p.itemId);
    if (!owner) return false;
    const spec = normalizePortSpec(p.dir === 'in' ? owner.input : owner.output);
    if (!spec) return false;
    return spec.visible && owner.showPorts !== false && node.showPorts !== false;
  }

  /**
   * ポートの表示 / 非表示を切り替える（Undo 可）。
   * @param {string} nodeId
   * @param {string} key ポートキー（'in' | 'out' | 'item:<id>:in|out'）
   * @param {boolean} visible
   */
  setPortVisible(nodeId, key, visible) {
    const node = this.nodes.get(nodeId);
    const p = parsePortKey(key);
    if (!node || !p) return false;
    const field = p.dir === 'in' ? 'input' : 'output';
    if (p.itemId == null) {
      if (!node[field]) return false;
      this.updateNode(nodeId, { [field]: withPortVisible(node[field], visible) });
      return true;
    }
    const item = (node.items ?? []).find((it) => it.id === p.itemId);
    if (!item || !item[field]) return false;
    this.updateItem(nodeId, p.itemId, { [field]: withPortVisible(item[field], visible) });
    return true;
  }

  /** ノード（itemId 指定なら項目）の全ポートの表示 / 非表示（Undo 可） */
  setPortsVisible(nodeId, visible, itemId) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const patch = visible ? { showPorts: undefined } : { showPorts: false };
    if (itemId == null) {
      this.updateNode(nodeId, patch);
      if (visible) delete node.showPorts;
      return true;
    }
    const item = (node.items ?? []).find((it) => it.id === itemId);
    if (!item) return false;
    this.updateItem(nodeId, itemId, patch);
    if (visible) delete item.showPorts;
    return true;
  }

  /** 指定ポートの位置。存在しなければ null */
  portPosition(nodeOrId, key) {
    const node = typeof nodeOrId === 'string' ? this.nodes.get(nodeOrId) : nodeOrId;
    if (!node) return null;
    const parsed = parsePortKey(key);
    if (!parsed) return null;
    const { headerHeight, itemHeight, padding } = this.layout;
    const x = parsed.dir === 'in' ? node.x : node.x + this.nodeWidth(node);
    if (parsed.itemId == null) {
      if (parsed.dir === 'in' && !node.input) return null;
      if (parsed.dir === 'out' && !node.output) return null;
      return { x, y: node.y + headerHeight / 2 };
    }
    const idx = node.items ? node.items.findIndex((it) => it.id === parsed.itemId) : -1;
    if (idx < 0) return null;
    const item = node.items[idx];
    if (parsed.dir === 'in' && !item.input) return null;
    if (parsed.dir === 'out' && !item.output) return null;
    return { x, y: node.y + headerHeight + padding / 2 + idx * itemHeight + itemHeight / 2 };
  }

  /** 項目行の矩形（インライン編集などに使う） */
  itemRect(node, itemId) {
    const idx = node.items ? node.items.findIndex((it) => it.id === itemId) : -1;
    if (idx < 0) return null;
    const { headerHeight, itemHeight, padding } = this.layout;
    return {
      x: node.x,
      y: node.y + headerHeight + padding / 2 + idx * itemHeight,
      w: this.nodeWidth(node),
      h: itemHeight,
    };
  }

  /** コネクタの描画方法（edge.type が無ければ layout.edgeType） */
  edgeType(edge) {
    return normalizeEdgeType(edge?.type ?? this.layout.edgeType);
  }

  /**
   * エッジの形状。
   *  - 共通: type, x1, y1, x2, y2, points（折れ線の頂点列。bezier は制御点を含む 4 点）
   *  - bezier: c1x, c1y, c2x, c2y（三次ベジェの制御点）
   *  - straight: points = [始点, 終点]
   *  - step: points = 直角に曲がる折れ線の頂点列
   */
  edgeGeometry(edge) {
    const a = this.portPosition(edge.source, edge.sourcePort);
    const b = this.portPosition(edge.target, edge.targetPort);
    if (!a || !b) return null;
    return edgeGeometryFor(this.edgeType(edge), a, b, this.layout);
  }

  /** エッジ上の点（t=0〜1）。既定は中点。削除アイコンなどの配置に使う */
  edgePoint(edge, t = 0.5) {
    const g = this.edgeGeometry(edge);
    if (!g) return null;
    return geometryPoint(g, t);
  }

  edgeRect(edge) {
    const g = this.edgeGeometry(edge);
    if (!g) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of g.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX - 4, y: minY - 4, w: maxX - minX + 8, h: maxY - minY + 8 };
  }

  /* ---------- 変更通知 ---------- */

  /** 複数の変更をまとめて 1 回の 'change' にする */
  batch(fn) {
    this._batchDepth++;
    try {
      return fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0 && this._dirty) {
        this._dirty = false;
        this.emit('change');
      }
    }
  }

  _changed() {
    if (this._batchDepth > 0) this._dirty = true;
    else this.emit('change');
  }

  /**
   * 取り消し可能な操作の記録を発火する（History が購読する）。
   * 種類: node:add, node:remove, node:update, nodes:move, edge:add, edge:remove, edge:update
   */
  _op(makeOp) {
    if (!this.silentOps) this.emit('op', makeOp());
  }

  /* ---------- ノード ---------- */

  /** @param {Partial<Node>} input */
  addNode(input) {
    const node = {
      ...input,
      id: input.id ?? uid('n'),
      title: input.title ?? 'Node',
      x: input.x ?? 0,
      y: input.y ?? 0,
      items: (input.items ?? []).map((it) => ({ ...it, id: it.id ?? uid('i') })),
    };
    if (this.nodes.has(node.id)) throw new Error(`duplicate node id: ${node.id}`);
    this.nodes.set(node.id, node);
    this._adjacency.set(node.id, new Set());
    this.nodeIndex.insert(node.id, this.nodeRect(node));
    this.emit('node:add', node);
    this._op(() => ({ type: 'node:add', node: structuredClone(node) }));
    this._changed();
    return node;
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  /** ノードのプロパティを更新（位置・タイトル・項目など） */
  updateNode(id, patch) {
    const node = this.nodes.get(id);
    if (!node) return null;
    const before = structuredClone(node);
    Object.assign(node, patch);
    if (patch.items) node.items = node.items.map((it) => ({ ...it, id: it.id ?? uid('i') }));
    this._reindexNode(node);
    this.emit('node:change', node);
    this._op(() => ({ type: 'node:update', id, before, after: structuredClone(node) }));
    this._changed();
    return node;
  }

  /** ノード全体をスナップショットで置き換える（履歴の復元用） */
  restoreNode(snapshot) {
    const node = this.nodes.get(snapshot.id);
    if (!node) return this.addNode(structuredClone(snapshot));
    const before = structuredClone(node);
    for (const k of Object.keys(node)) if (!(k in snapshot)) delete node[k];
    Object.assign(node, structuredClone(snapshot));
    this._reindexNode(node);
    this.emit('node:change', node);
    this._op(() => ({ type: 'node:update', id: node.id, before, after: structuredClone(node) }));
    this._changed();
    return node;
  }

  /** 項目のプロパティ更新 */
  updateItem(nodeId, itemId, patch) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    const item = node.items.find((it) => it.id === itemId);
    if (!item) return null;
    const before = structuredClone(node);
    Object.assign(item, patch);
    this._reindexNode(node);
    this.emit('node:change', node);
    this._op(() => ({ type: 'node:update', id: nodeId, before, after: structuredClone(node) }));
    this._changed();
    return item;
  }

  addItem(nodeId, item, index) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    const before = structuredClone(node);
    const it = { id: uid('i'), label: 'item', ...item };
    if (index == null || index >= node.items.length) node.items.push(it);
    else node.items.splice(index, 0, it);
    this._reindexNode(node);
    this.emit('node:change', node);
    this._op(() => ({ type: 'node:update', id: nodeId, before, after: structuredClone(node) }));
    this._changed();
    return it;
  }

  removeItem(nodeId, itemId) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const idx = node.items.findIndex((it) => it.id === itemId);
    if (idx < 0) return false;
    this.batch(() => {
      const before = structuredClone(node);
      // その項目に繋がるコネクタを削除
      for (const eid of [...this._adjacency.get(nodeId)]) {
        const e = this.edges.get(eid);
        const sp = parsePortKey(e.sourcePort);
        const tp = parsePortKey(e.targetPort);
        if ((e.source === nodeId && sp?.itemId === itemId) || (e.target === nodeId && tp?.itemId === itemId)) {
          this.removeEdge(eid);
        }
      }
      node.items.splice(idx, 1);
      this._reindexNode(node);
      this.emit('node:change', node);
      this._op(() => ({ type: 'node:update', id: nodeId, before, after: structuredClone(node) }));
      this._changed();
    });
    return true;
  }

  /** 複数ノードを移動（ドラッグ用）。接続エッジのインデックスも更新する */
  moveNodes(ids, dx, dy) {
    if (dx === 0 && dy === 0) return;
    const touchedEdges = new Set();
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (!node) continue;
      node.x += dx;
      node.y += dy;
      this.nodeIndex.update(id, this.nodeRect(node));
      for (const eid of this._adjacency.get(id)) touchedEdges.add(eid);
    }
    for (const eid of touchedEdges) this._reindexEdge(this.edges.get(eid));
    this.emit('nodes:move', { ids, dx, dy });
    this._op(() => ({ type: 'nodes:move', ids: [...ids], dx, dy }));
    this._changed();
  }

  removeNode(id) {
    const node = this.nodes.get(id);
    if (!node) return false;
    this.batch(() => {
      for (const eid of [...this._adjacency.get(id)]) this.removeEdge(eid);
      this.nodes.delete(id);
      this._adjacency.delete(id);
      this.nodeIndex.remove(id);
      this.emit('node:remove', node);
      this._op(() => ({ type: 'node:remove', node: structuredClone(node) }));
      this._changed();
    });
    return true;
  }

  removeNodes(ids) {
    this.batch(() => {
      for (const id of ids) this.removeNode(id);
    });
  }

  _reindexNode(node) {
    this.nodeIndex.update(node.id, this.nodeRect(node));
    for (const eid of this._adjacency.get(node.id)) this._reindexEdge(this.edges.get(eid));
  }

  /* ---------- ポートの接続数 ---------- */

  /** ポートの定義（{ max }）。存在しなければ null */
  portSpec(nodeOrId, key) {
    const node = typeof nodeOrId === 'string' ? this.nodes.get(nodeOrId) : nodeOrId;
    const p = parsePortKey(key);
    if (!node || !p) return null;
    const defaultMax = p.dir === 'in' ? this.rules.maxInputs : this.rules.maxOutputs;
    const owner = p.itemId == null ? node : (node.items ?? []).find((it) => it.id === p.itemId);
    if (!owner) return null;
    return normalizePortSpec(p.dir === 'in' ? owner.input : owner.output, defaultMax);
  }

  /** ポートに接続しているエッジ一覧 */
  portEdges(nodeId, key) {
    const p = parsePortKey(key);
    if (!p) return [];
    return this.edgesOf(nodeId).filter((e) =>
      p.dir === 'out' ? e.source === nodeId && e.sourcePort === key : e.target === nodeId && e.targetPort === key,
    );
  }

  /** ポートの接続数と上限。{ count, max, full } */
  portCapacity(nodeId, key) {
    const spec = this.portSpec(nodeId, key);
    if (!spec) return null;
    const count = this.portEdges(nodeId, key).length;
    return { count, max: spec.max, full: count >= spec.max };
  }

  /* ---------- エッジ ---------- */

  /**
   * 接続できない理由を返す（接続可能なら null）。
   * 理由: 'same-node' | 'invalid-port' | 'missing-port' | 'duplicate' | 'source-full' | 'target-full'
   * @param {{replace?:boolean}} [options] replace=true なら満杯でも（付け替え前提で）許可する
   */
  connectError(source, sourcePort, target, targetPort, { replace = false } = {}) {
    if (source === target) return 'same-node';
    const sp = parsePortKey(sourcePort);
    const tp = parsePortKey(targetPort);
    if (!sp || !tp || sp.dir !== 'out' || tp.dir !== 'in') return 'invalid-port';
    if (!this.portPosition(source, sourcePort) || !this.portPosition(target, targetPort)) return 'missing-port';
    for (const eid of this._adjacency.get(source) ?? []) {
      const e = this.edges.get(eid);
      if (e.source === source && e.sourcePort === sourcePort && e.target === target && e.targetPort === targetPort) {
        return 'duplicate';
      }
    }
    if (!replace) {
      if (this.portCapacity(source, sourcePort)?.full) return 'source-full';
      if (this.portCapacity(target, targetPort)?.full) return 'target-full';
    }
    return null;
  }

  /** 接続可能か（out → in、同一ノード禁止、重複禁止、ポート存在確認、接続数上限） */
  canConnect(source, sourcePort, target, targetPort, options) {
    return this.connectError(source, sourcePort, target, targetPort, options) === null;
  }

  /**
   * ユーザー操作からの接続。rules.onFull === 'replace'（または options.replace）なら、
   * 満杯のポートの最も古いコネクタを外してから追加する。1 回の Undo で戻る。
   * @returns {Edge|null}
   */
  connect(source, sourcePort, target, targetPort, { replace = this.rules.onFull === 'replace', ...rest } = {}) {
    if (!this.canConnect(source, sourcePort, target, targetPort, { replace })) return null;
    return this.batch(() => {
      if (replace) {
        for (const [nodeId, key] of [[source, sourcePort], [target, targetPort]]) {
          const cap = this.portCapacity(nodeId, key);
          if (!cap || !cap.full) continue;
          const edges = this.portEdges(nodeId, key);
          for (let i = 0; i <= edges.length - cap.max; i++) this.removeEdge(edges[i].id);
        }
      }
      return this.addEdge({ source, sourcePort, target, targetPort, ...rest });
    });
  }

  /** @param {Partial<Edge>} input */
  addEdge(input) {
    const edge = { id: input.id ?? uid('e'), ...input };
    // in→out の向きで渡されたら正規化する
    if (parsePortKey(edge.sourcePort)?.dir === 'in' && parsePortKey(edge.targetPort)?.dir === 'out') {
      [edge.source, edge.target] = [edge.target, edge.source];
      [edge.sourcePort, edge.targetPort] = [edge.targetPort, edge.sourcePort];
    }
    if (!this.canConnect(edge.source, edge.sourcePort, edge.target, edge.targetPort)) return null;
    if (this.edges.has(edge.id)) throw new Error(`duplicate edge id: ${edge.id}`);
    this.edges.set(edge.id, edge);
    this._adjacency.get(edge.source).add(edge.id);
    this._adjacency.get(edge.target).add(edge.id);
    this._reindexEdge(edge);
    this.emit('edge:add', edge);
    this._op(() => ({ type: 'edge:add', edge: structuredClone(edge) }));
    this._changed();
    return edge;
  }

  /** 検証を省いてエッジを戻す（履歴の復元用。両端ノードは存在している必要がある） */
  restoreEdge(snapshot) {
    if (this.edges.has(snapshot.id)) return this.edges.get(snapshot.id);
    if (!this.nodes.has(snapshot.source) || !this.nodes.has(snapshot.target)) return null;
    const edge = structuredClone(snapshot);
    this.edges.set(edge.id, edge);
    this._adjacency.get(edge.source).add(edge.id);
    this._adjacency.get(edge.target).add(edge.id);
    this._reindexEdge(edge);
    this.emit('edge:add', edge);
    this._op(() => ({ type: 'edge:add', edge: structuredClone(edge) }));
    this._changed();
    return edge;
  }

  getEdge(id) {
    return this.edges.get(id);
  }

  updateEdge(id, patch) {
    const edge = this.edges.get(id);
    if (!edge) return null;
    const before = structuredClone(edge);
    Object.assign(edge, patch);
    this._reindexEdge(edge);
    this.emit('edge:change', edge);
    this._op(() => ({ type: 'edge:update', id, before, after: structuredClone(edge) }));
    this._changed();
    return edge;
  }

  restoreEdgeState(snapshot) {
    const edge = this.edges.get(snapshot.id);
    if (!edge) return this.restoreEdge(snapshot);
    const before = structuredClone(edge);
    for (const k of Object.keys(edge)) if (!(k in snapshot)) delete edge[k];
    Object.assign(edge, structuredClone(snapshot));
    this._reindexEdge(edge);
    this.emit('edge:change', edge);
    this._op(() => ({ type: 'edge:update', id: edge.id, before, after: structuredClone(edge) }));
    this._changed();
    return edge;
  }

  removeEdge(id) {
    const edge = this.edges.get(id);
    if (!edge) return false;
    this.edges.delete(id);
    this._adjacency.get(edge.source)?.delete(id);
    this._adjacency.get(edge.target)?.delete(id);
    this.edgeIndex.remove(id);
    this.emit('edge:remove', edge);
    this._op(() => ({ type: 'edge:remove', edge: structuredClone(edge) }));
    this._changed();
    return true;
  }

  removeEdges(ids) {
    this.batch(() => {
      for (const id of ids) this.removeEdge(id);
    });
  }

  /** ノードに接続しているエッジ一覧 */
  /**
   * 指定ノードから辿れるノードとコネクタを集める（強調表示用）。
   * @param {Iterable<string>} startIds 起点のノード ID
   * @param {object} [options]
   * @param {number} [options.depth=Infinity] 何段まで辿るか（1 なら隣接のみ）
   * @param {'lineage'|'downstream'|'upstream'|'both'} [options.direction='both']
   *   - 'downstream' … 出力側へ進める先だけ
   *   - 'upstream'   … 入力側へ遡る先だけ
   *   - 'lineage'    … 先に上流をたどり、そこから流れる先すべて（同じ流れにあるもの）
   *   - 'both'       … 向きを問わず繋がっているもの全部
   * @param {boolean} [options.includeStart=true] 起点自身を含めるか
   * @returns {{nodes: Set<string>, edges: Set<string>}}
   */
  connectedTo(startIds, { depth = Infinity, direction = 'both', includeStart = true } = {}) {
    if (direction === 'lineage') {
      // 上流をたどってから、その全員の下流を集める。
      // 「自分の上流ではないのに、途中のノードへ合流しているだけ」のノードは入らない
      const up = this.connectedTo(startIds, { depth, direction: 'upstream' });
      const out = this.connectedTo(up.nodes, { depth, direction: 'downstream' });
      for (const id of up.nodes) out.nodes.add(id);
      for (const id of up.edges) out.edges.add(id);
      if (!includeStart) for (const id of startIds) out.nodes.delete(id);
      return out;
    }
    const nodes = new Set();
    const edges = new Set();
    let frontier = [];
    for (const id of startIds) {
      if (!this.nodes.has(id)) continue;
      nodes.add(id);
      frontier.push(id);
    }
    for (let d = 0; d < depth && frontier.length; d++) {
      const next = [];
      for (const id of frontier) {
        for (const eid of this._adjacency.get(id) ?? []) {
          const edge = this.edges.get(eid);
          if (!edge) continue;
          // 向きを考慮する場合、進める側だけを辿る
          if (direction === 'downstream' && edge.source !== id) continue;
          if (direction === 'upstream' && edge.target !== id) continue;
          edges.add(eid);
          const other = edge.source === id ? edge.target : edge.source;
          if (!nodes.has(other)) {
            nodes.add(other);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    if (!includeStart) for (const id of startIds) nodes.delete(id);
    return { nodes, edges };
  }

  edgesOf(nodeId) {
    return [...(this._adjacency.get(nodeId) ?? [])].map((id) => this.edges.get(id));
  }

  _reindexEdge(edge) {
    const r = this.edgeRect(edge);
    if (r) this.edgeIndex.update(edge.id, r);
    else this.edgeIndex.remove(edge.id);
  }

  reindexAll() {
    this.nodeIndex.clear();
    this.edgeIndex.clear();
    for (const n of this.nodes.values()) this.nodeIndex.insert(n.id, this.nodeRect(n));
    for (const e of this.edges.values()) this._reindexEdge(e);
  }

  /* ---------- 問い合わせ ---------- */

  nodesInRect(rect) {
    return this.nodeIndex.query(rect).map((id) => this.nodes.get(id));
  }

  edgesInRect(rect) {
    return this.edgeIndex.query(rect).map((id) => this.edges.get(id));
  }

  /** 矩形に完全に含まれるノード（範囲選択用） */
  nodesFullyInRect(rect) {
    return this.nodesInRect(rect).filter((n) => {
      const r = this.nodeRect(n);
      return r.x >= rect.x && r.y >= rect.y && r.x + r.w <= rect.x + rect.w && r.y + r.h <= rect.y + rect.h;
    });
  }

  /** 全ノードを囲む矩形 */
  bounds() {
    if (this.nodes.size === 0) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of this.nodes.values()) {
      const r = this.nodeRect(n);
      if (r.x < x0) x0 = r.x;
      if (r.y < y0) y0 = r.y;
      if (r.x + r.w > x1) x1 = r.x + r.w;
      if (r.y + r.h > y1) y1 = r.y + r.h;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* ---------- 複製 ---------- */

  /**
   * 指定ノード群と、その内部で閉じているエッジを複製する。
   * @returns {{nodes: Node[], edges: Edge[], idMap: Map<string,string>}}
   */
  duplicateNodes(ids, offset = { x: 40, y: 40 }) {
    const idSet = new Set(ids);
    const idMap = new Map();
    const nodes = [];
    const edges = [];
    this.batch(() => {
      for (const id of ids) {
        const src = this.nodes.get(id);
        if (!src) continue;
        const copy = structuredClone(src);
        copy.id = uid('n');
        copy.x += offset.x;
        copy.y += offset.y;
        idMap.set(id, copy.id);
        nodes.push(this.addNode(copy));
      }
      const seen = new Set();
      for (const id of ids) {
        for (const e of this.edgesOf(id)) {
          if (seen.has(e.id) || !idSet.has(e.source) || !idSet.has(e.target)) continue;
          seen.add(e.id);
          const copy = structuredClone(e);
          copy.id = uid('e');
          copy.source = idMap.get(e.source);
          copy.target = idMap.get(e.target);
          const added = this.addEdge(copy);
          if (added) edges.push(added);
        }
      }
    });
    return { nodes, edges, idMap };
  }

  /* ---------- 直列化 ---------- */

  toJSON() {
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
  }

  /** 既存内容を置き換えて読み込む */
  load({ nodes = [], edges = [] }) {
    const prev = this.silentOps;
    this.silentOps = true;
    try {
      this.batch(() => {
        this.clear();
        for (const n of nodes) this.addNode(n);
        for (const e of edges) this.addEdge(e);
      });
    } finally {
      this.silentOps = prev;
    }
    this.emit('load');
  }

  clear() {
    this.nodes.clear();
    this.edges.clear();
    this._adjacency.clear();
    this.nodeIndex.clear();
    this.edgeIndex.clear();
    this.emit('clear');
    this._changed();
  }
}

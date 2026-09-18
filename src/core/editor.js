import { Emitter } from './emitter.js';
import { Graph, uid, geometryPolyline, normalizeEdgeType } from './graph.js';
import { Viewport } from './viewport.js';
import { Renderer } from './renderer.js';
import { Minimap } from './minimap.js';
import { Interaction } from './interaction.js';
import { History } from './history.js';
import { defaultTheme, mergeTheme } from './theme.js';
import { serialize, parse, remapForMerge, downloadText, pickTextFile, FORMAT, FORMAT_VERSION } from './serializer.js';
import { layeredLayout } from './layout.js';

export { Graph, Viewport, Renderer, Minimap, defaultTheme, mergeTheme, uid };
export { portKey, parsePortKey } from './graph.js';
export { serialize, parse, validate, remapForMerge, FORMAT, FORMAT_VERSION } from './serializer.js';
export { layeredLayout } from './layout.js';
export { normalizeEdgeType, edgeGeometryFor, geometryPoint, geometryPolyline, normalizeGoto, EDGE_TYPES } from './graph.js';

/**
 * フレームワーク非依存のノードエディタ本体。
 * `<canvas>` を渡すと描画と操作を引き受ける。Lit ラッパー等はこのクラスを包む。
 *
 * 発火イベント:
 *  - 'render'                 描画後 (stats)
 *  - 'selection:change'       { nodes: string[], edges: string[] }
 *  - 'viewport:change'        { tx, ty, zoom }
 *  - 'node:add' | 'node:remove' | 'node:change' | 'nodes:move'
 *  - 'edge:add' | 'edge:remove' | 'edge:change'
 *  - 'node:edit'              { node, screenRect }           ヘッダをダブルクリック
 *  - 'item:edit'              { node, item, screenRect }     項目をダブルクリック
 *  - 'canvas:dblclick'        { x, y }  (ワールド座標)
 *  - 'graph:change'
 *  - 'history:change'         { canUndo, canRedo }
 *  - 'import'                 { mode, nodes, edges, warnings }
 *  - 'export'                 { data, selectionOnly }
 *  - 'layout'                 { nodes: string[] }  自動整列を適用した
 *  - 'edges:delete'           { ids: string[], scope }  選択範囲内のコネクタだけを削除した
 *  - 'insert'                 { at, anchor, nodes, edges }  insertJSON で JSON を指定位置に追加した
 *  - 'edge-type:change'       { type, edges: string[]|null }  コネクタの描画方法を変えた（edges が null なら全体の既定）
 *  - 'focus:change'           { mode, direction, nodes: string[], edges: string[] }  強調表示の対象が変わった
 *  - 'focus:select'           { mode, nodes: string[], edges: string[] }  強調表示されている要素を選択した
 *  - 'node:click'             { node, item, header, port, x, y, screen, shiftKey, ... }  ノードをクリック（ドラッグせずに離した）
 *  - 'item:click'             { node, item, x, y, ... }  ノード内の項目をクリック（node:click も続けて発火）
 *  - 'edge:click'             { edge, x, y, ... }
 *  - 'canvas:click'           { x, y, ... }  空白をクリック
 *  - 'context:menu'           { type, node, item, edge, port, x, y, screen, client, selection, originalEvent }  右クリック（既定のブラウザメニューは抑制される）
 */
export class NodeEditor extends Emitter {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {object} [options.theme]        テーマの部分上書き
   * @param {Graph}  [options.graph]        既存の Graph を使う
   * @param {Record<string, {style?:object}>} [options.nodeTypes] ノード種別ごとの既定スタイル
   * @param {HTMLCanvasElement} [options.minimapCanvas]
   * @param {'zoom'|'pan'} [options.wheelMode='zoom']
   * @param {'pan'|'select'} [options.dragMode='pan'] 空白部分を左ドラッグしたときの動作（Shift で反転）
   * @param {boolean} [options.readOnly=false]
   * @param {number}  [options.historyLimit=200] Undo 履歴の上限
   * @param {number}  [options.minNodeWidth=100] リサイズ時の最小幅
   * @param {{maxInputs?:number, maxOutputs?:number, onFull?:'reject'|'replace'}} [options.rules] 接続ルール（既定上限と満杯時の挙動）
   * @param {boolean} [options.edgeDeleteIcon=true] ホバー／選択中のコネクタに削除アイコンを表示する
   * @param {number}  [options.wheelGestureGap=250] ホイールイベントの間隔（ms）がこれ未満なら同じスクロール操作とみなし、ズーム / パンの判定を維持する
   * @param {number}  [options.moveSnap=0] ノードの移動単位（ワールド px）。0 で無効。設定するとドラッグ・矢印キー・ノード追加・JSON 追加の位置がこの単位に揃う
   */
  constructor(canvas, options = {}) {
    super();
    this.canvas = canvas;
    this.options = { wheelMode: 'zoom', dragMode: 'pan', readOnly: false, historyLimit: 200, minNodeWidth: 100, edgeDeleteIcon: true, moveSnap: 0, focusMode: 'off', focusDepth: 1, focusDirection: 'lineage', ...options };
    this.theme = mergeTheme(defaultTheme, options.theme);
    this.nodeTypes = { ...(options.nodeTypes ?? {}) };

    this.graph =
      options.graph ??
      new Graph({
        rules: options.rules,
        layout: {
          headerHeight: this.theme.node.headerHeight,
          itemHeight: this.theme.node.itemHeight,
          padding: this.theme.node.padding,
          defaultWidth: this.theme.node.width,
          curvature: this.theme.edge.curvature,
          edgeType: this.theme.edge.type,
          stepOffset: this.theme.edge.stepOffset,
        },
      });
    this.viewport = new Viewport();
    this.renderer = new Renderer(canvas, this.graph, this.viewport, this.theme);
    this.renderer.resolveNodeStyle = (node) => this._nodeStyle(node);

    this.selection = { nodes: new Set(), edges: new Set() };
    this.hover = { node: null, edge: null, port: null, edgeDelete: null };
    this.selectionBox = null;
    this.pendingEdge = null;
    this._clipboard = null;
    /** 強調表示の対象のキャッシュ（選択・グラフ変更で破棄） */
    this._focusCache = null;
    /** selectFocused() 実行中だけ入る、固定したい強調対象 */
    this._pinnedFocus = null;
    this._raf = 0;
    this._anim = null;

    this.history = new History(this.graph, { limit: this.options.historyLimit });
    this.history.on('change', (s) => this.emit('history:change', s));

    this.minimap = options.minimapCanvas ? new Minimap(options.minimapCanvas, this) : null;
    this.interaction = new Interaction(this);

    this._onGraphChange = () => {
      this._focusCache = null;
      this.minimap?.invalidate();
      this.requestRender();
      this.emit('graph:change');
    };
    this.graph.on('change', this._onGraphChange);
    for (const t of ['node:add', 'node:remove', 'node:change', 'nodes:move', 'edge:add', 'edge:remove', 'edge:change']) {
      this.graph.on(t, (p) => this.emit(t, p));
    }
    this.graph.on('node:remove', (n) => {
      this.selection.nodes.delete(n.id);
    });
    this.graph.on('edge:remove', (e) => {
      this.selection.edges.delete(e.id);
    });
  }

  /* ---------- 見た目 ---------- */

  setTheme(patch) {
    this.theme = mergeTheme(this.theme, patch);
    this.renderer.setTheme(this.theme);
    this.graph.setLayout({
      headerHeight: this.theme.node.headerHeight,
      itemHeight: this.theme.node.itemHeight,
      padding: this.theme.node.padding,
      defaultWidth: this.theme.node.width,
      childIndent: this.theme.node.childIndent,
      childGap: this.theme.node.childGap,
      curvature: this.theme.edge.curvature,
      edgeType: this.theme.edge.type,
      stepOffset: this.theme.edge.stepOffset,
    });
    this.minimap?.invalidate();
    this.requestRender();
  }

  /**
   * ノードの移動単位を設定する（ワールド px）。0 / null で無効。
   * ドラッグ中はクリックしたノードの左上がこの単位に揃い、他の選択ノードは相対位置を保ったまま追従する。
   * 矢印キーは 1 押下でこの単位だけ動く。addNodeAt / insertJSON の位置も既定でこの単位に吸着する。
   */
  setMoveSnap(step) {
    this.options.moveSnap = step > 0 ? step : 0;
  }

  /** 現在の移動単位（0 なら無効） */
  get moveSnap() {
    return this.options.moveSnap > 0 ? this.options.moveSnap : 0;
  }

  /** 値を移動単位に揃える（無効時はそのまま） */
  snapValue(v) {
    const s = this.moveSnap;
    return s ? Math.round(v / s) * s : v;
  }

  /** 座標を移動単位に揃える */
  snapPoint(p) {
    return { x: this.snapValue(p.x), y: this.snapValue(p.y) };
  }

  /**
   * 選択ノードを移動単位に揃える（既にずれているノードを整える用途）。1 回の Undo で戻る。
   * @param {Iterable<string>} [ids] 省略時は選択中ノード。選択が無ければ全ノード
   * @returns {string[]} 動かしたノード ID
   */
  snapNodes(ids) {
    if (this.options.readOnly || !this.moveSnap) return [];
    const list = ids ? [...ids] : this.selection.nodes.size ? [...this.selection.nodes] : [...this.graph.nodes.keys()];
    const moved = [];
    this.graph.batch(() => {
      for (const id of list) {
        const n = this.graph.nodes.get(id);
        if (!n) continue;
        const dx = this.snapValue(n.x) - n.x;
        const dy = this.snapValue(n.y) - n.y;
        if (dx || dy) {
          this.graph.moveNodes([id], dx, dy);
          moved.push(id);
        }
      }
    });
    return moved;
  }

  /** 接続ルールを変更（{ maxInputs, maxOutputs, onFull }） */
  setRules(rules) {
    Object.assign(this.graph.rules, rules);
    this.requestRender();
  }

  /**
   * コネクタの描画方法の既定を変える: 'bezier'（曲線）| 'straight'（直線）| 'step'（直角の階段状）。
   * コネクタ単位で変えるときは `setEdgeType(type, edgeIds)`（edge.type を更新、Undo 可）。
   * @param {'bezier'|'straight'|'step'} type
   * @param {string[]} [edgeIds] 指定したコネクタだけ変える（省略時は全体の既定）
   */
  setEdgeType(type, edgeIds) {
    const t = normalizeEdgeType(type);
    if (edgeIds) {
      this.history.begin();
      try {
        this.graph.batch(() => {
          for (const id of edgeIds) if (this.graph.edges.has(id)) this.graph.updateEdge(id, { type: t });
        });
      } finally {
        this.history.end();
      }
    } else {
      this.theme.edge.type = t;
      this.graph.setLayout({ edgeType: t });
    }
    this.emit('edge-type:change', { type: t, edges: edgeIds ?? null });
    this.requestRender();
  }

  /** 現在の既定の描画方法 */
  get edgeType() {
    return normalizeEdgeType(this.graph.layout.edgeType);
  }

  set edgeType(type) {
    this.setEdgeType(type);
  }

  /** 選択中のコネクタの描画方法を変える（何も選択していなければ全体の既定を変える） */
  setSelectedEdgeType(type) {
    const ids = [...this.selection.edges];
    this.setEdgeType(type, ids.length ? ids : undefined);
  }

  /* ---------- 親子（子ノード） ---------- */

  /** 子ノードを追加する（Undo 可）。`child` はノード定義か既存ノードの ID */
  addChild(parentId, child, index) {
    if (this.options.readOnly) return null;
    return this.graph.addChild(parentId, child, index);
  }

  /** 子を親から外して独立させる（Undo 可）。x / y を渡すとその位置に置く */
  removeChild(id, options) {
    if (this.options.readOnly) return null;
    return this.graph.removeChild(id, options);
  }

  /** 親子関係を付け替える（Undo 可）。`parentId` に null を渡すと独立させる */
  setParent(id, parentId, index) {
    if (this.options.readOnly) return false;
    return this.graph.setParent(id, parentId, index);
  }

  /** 子ノードの配列（表示順） */
  childrenOf(nodeOrId) {
    return this.graph.childrenOf(nodeOrId);
  }

  /** 一番外側の親（自分が子でなければ自分自身） */
  rootNodeOf(nodeOrId) {
    return this.graph.rootOf(nodeOrId);
  }

  /* ---------- goto（ID 指定の遷移） ---------- */

  /**
   * `goto` を設定する（Undo 可）。`itemId` を渡すとその項目に設定する。
   * 値は `'n1'` / `['n1','n2']` / `{to:'n1', label:'戻る'}` のいずれでも可。null で解除。
   */
  setGoto(nodeOrId, value, options) {
    if (this.options.readOnly) return null;
    return this.graph.setGoto(nodeOrId, value, options);
  }

  /** ノード（と項目）に書かれた goto の一覧。引数を省略するとグラフ全体 */
  gotoLinks(nodeOrId) {
    return this.graph.gotoLinks(nodeOrId);
  }

  /** このノードを goto で指しているリンク */
  gotoSources(nodeOrId) {
    return this.graph.gotoSources(nodeOrId);
  }

  /* ---------- 強調表示（つながりのハイライト） ---------- */

  /**
   * 選択ノードと繋がっている要素を強調し、それ以外を薄く描くモードを切り替える。
   *  - 'off'（既定）… 無効
   *  - 'connected' … 辿れる範囲すべて（上流・下流をたどって行ける全部）
   *  - 'neighbors' … 隣接のみ（`focusDepth` 段まで。既定 1）
   * 既定の `focusDirection: 'lineage'` は「上流をたどってから、そこから流れる先すべて」を強調する。
   * 選択ノードの手前（上流）とその先の流れは入るが、途中のノードへ合流しているだけの別系統は入らない。
   * 進める先だけなら `'downstream'`、遡るだけなら `'upstream'`、向きを無視するなら `'both'`。
   * @param {'off'|'connected'|'neighbors'|boolean} mode
   * @param {{depth?:number, direction?:'lineage'|'downstream'|'upstream'|'both'}} [options]
   */
  setFocusMode(mode, { depth, direction } = {}) {
    this.options.focusMode = mode === true ? 'connected' : mode === false ? 'off' : mode;
    if (depth != null) this.options.focusDepth = depth;
    if (direction) this.options.focusDirection = direction;
    this._focusCache = null;
    this.emit('focus:change', this._focusDetail());
    this.requestRender();
  }

  get focusMode() {
    const m = this.options.focusMode;
    return m === 'connected' || m === 'neighbors' ? m : 'off';
  }

  set focusMode(mode) {
    this.setFocusMode(mode);
  }

  /**
   * 現在の強調表示の対象。無効なとき・選択が空のときは null（= 全部を通常描画）。
   * @returns {{nodes:Set<string>, edges:Set<string>}|null}
   */
  focusSet() {
    if (this.focusMode === 'off' || this.selection.nodes.size === 0) return null;
    if (this._focusCache) return this._focusCache;
    // 'connected' は辿れる範囲すべて。'neighbors' は focusDepth 段まで（既定 1）
    const depth = this.focusMode === 'connected' ? Infinity : Math.max(1, this.options.focusDepth || 1);
    const set = this.graph.connectedTo(this.selection.nodes, {
      depth,
      direction: this.options.focusDirection,
    });
    // 選択中のコネクタも常に強調側に含める
    for (const id of this.selection.edges) set.edges.add(id);
    if (!set.links) set.links = new Set();
    this._focusCache = set;
    return set;
  }

  _focusDetail() {
    const set = this.focusSet();
    return {
      mode: this.focusMode,
      direction: this.options.focusDirection,
      nodes: set ? [...set.nodes] : [],
      edges: set ? [...set.edges] : [],
      links: set ? [...(set.links ?? [])] : [],
    };
  }

  /**
   * いま強調表示されている要素（`focusSet()` の中身）をそのまま選択する。
   * 強調表示が無効（focusMode: 'off'）のときは `focusDirection` / `focusDepth` の設定どおりに
   * 繋がりを辿って選択する（`selectConnected()` と同じ挙動）。
   * @param {{additive?:boolean, depth?:number, direction?:'lineage'|'downstream'|'upstream'|'both'}} [options]
   *   additive: 既存の選択に加える（既定 false = 置き換え）
   * @returns {{nodes:string[], edges:string[]}|null} 選択が空なら null
   */
  selectFocused(options) {
    if (!this.selection.nodes.size) return null;
    const set =
      (options?.depth == null && options?.direction == null ? this.focusSet() : null) ??
      this.graph.connectedTo(this.selection.nodes, {
        depth: options?.depth ?? (this.focusMode === 'neighbors' ? Math.max(1, this.options.focusDepth || 1) : Infinity),
        direction: options?.direction ?? this.options.focusDirection,
      });
    const nodes = [...set.nodes];
    const edges = [...set.edges];
    const additive = !!options?.additive;
    // 選択後の範囲をそのまま強調対象として固定する。
    // そうしないと「選択が増えた分だけ強調範囲も広がる」ため、押すたびに範囲が育ってしまう。
    // 固定は次の選択変更・グラフ変更までで、そこからは通常の計算に戻る。
    this._pinnedFocus =
      this.focusMode === 'off'
        ? null
        : {
            nodes: new Set(additive ? [...this.selection.nodes, ...nodes] : nodes),
            edges: new Set(additive ? [...this.selection.edges, ...edges] : edges),
            links: new Set(set.links ?? []),
          };
    try {
      this.select({ nodes, edges }, { additive });
    } finally {
      this._pinnedFocus = null;
    }
    this.emit('focus:select', { nodes, edges, mode: this.focusMode });
    return { nodes, edges };
  }

  /** 強調表示の対象を選択に加える（繋がりを丸ごと選びたいとき） */
  selectConnected(options) {
    const nodes = [...this.selection.nodes];
    if (!nodes.length) return null;
    const set = this.graph.connectedTo(nodes, {
      depth: options?.depth ?? (this.focusMode === 'neighbors' ? Math.max(1, this.options.focusDepth || 1) : Infinity),
      direction: options?.direction ?? this.options.focusDirection,
    });
    this.select({ nodes: [...set.nodes], edges: [...set.edges] });
    return { nodes: [...set.nodes], edges: [...set.edges] };
  }

  /** ノード種別を登録（style はテーマ node.* の上書き） */
  registerNodeType(type, def) {
    this.nodeTypes[type] = def;
    this.requestRender();
  }

  _nodeStyle(node) {
    const typeStyle = node.type ? this.nodeTypes[node.type]?.style : null;
    if (!typeStyle && !node.style) return this.theme.node;
    return { ...this.theme.node, ...(typeStyle ?? {}), ...(node.style ?? {}) };
  }

  /** 独自のノード描画関数を設定（null で既定に戻す） */
  set nodeRenderer(fn) {
    this.renderer.renderNode = fn;
    this.requestRender();
  }

  set edgeRenderer(fn) {
    this.renderer.renderEdge = fn;
    this.requestRender();
  }

  /**
   * ノード・エッジを描いたあとに呼ばれる追加描画（null で解除）。
   * ワールド座標系で呼ばれる。画面上で一定の大きさにしたいものは第 2 引数の `zoom` で割る。
   * @param {((ctx:CanvasRenderingContext2D, info:object)=>void)|null} fn
   */
  set overlayRenderer(fn) {
    this.renderer.renderOverlay = fn;
    this.requestRender();
  }

  get overlayRenderer() {
    return this.renderer.renderOverlay;
  }

  /* ---------- サイズ・描画 ---------- */

  resize(width, height, dpr) {
    this.viewport.setSize(width, height);
    this.renderer.resize(width, height, dpr);
    this.requestRender();
  }

  resizeMinimap(width, height, dpr) {
    this.minimap?.resize(width, height, dpr);
    this.requestRender();
  }

  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.render();
    });
  }

  render() {
    this.renderer.render({
      selectedNodes: this.selection.nodes,
      selectedEdges: this.selection.edges,
      hoverNode: this.hover.node,
      hoverEdge: this.hover.edge,
      hoverPort: this.hover.port,
      hoverEdgeDelete: this.hover.edgeDelete,
      deleteIconEdges: this.deleteIconEdges(),
      selectionBox: this.selectionBox,
      pendingEdge: this.pendingEdge,
      focus: this.focusSet(),
    });
    this.minimap?.render();
    this.emit('render', this.renderer.stats);
  }

  /* ---------- 座標 ---------- */

  /** クライアント座標 → ワールド座標 */
  clientToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return this.viewport.toWorld(clientX - r.left, clientY - r.top);
  }

  /** ワールド矩形 → canvas 基準のスクリーン矩形 */
  worldRectToScreen(rect) {
    const a = this.viewport.toScreen(rect.x, rect.y);
    return { x: a.x, y: a.y, w: rect.w * this.viewport.zoom, h: rect.h * this.viewport.zoom };
  }

  /* ---------- ヒットテスト ---------- */

  /**
   * ワールド座標にあるものを返す。
   * @returns {{type:'edge-delete',edge:object}|{type:'resize',node:object}|{type:'port',node:object,port:object}|{type:'item',node:object,item:object}|{type:'node',node:object,header:boolean}|{type:'edge',edge:object}|{type:'none'}}
   */
  hitTest(wx, wy) {
    const { graph, viewport } = this;
    // コネクタの削除アイコン（表示中のものだけ。ノードより手前に描かれるので最優先）
    const delEdge = this.edgeDeleteIconAt(wx, wy);
    if (delEdge) return { type: 'edge-delete', edge: delEdge };
    const portR = (this.theme.port.radius + 4) / Math.min(1, viewport.zoom);
    // ポート判定はノード矩形の外側にもはみ出すので少し広く取る
    const candidates = graph.nodesInRect({ x: wx - portR, y: wy - portR, w: portR * 2, h: portR * 2 });
    // 入れ子が浅い順に並べる（逆順に見るので、深い子ノードから判定される）
    if (candidates.length > 1) {
      const depth = new Map(candidates.map((n) => [n.id, graph.depthOf(n)]));
      candidates.sort((a, b) => depth.get(a.id) - depth.get(b.id));
    }
    // リサイズグリップ（右下隅）はポートより優先。子ノードは親から幅をもらうので対象外
    const grip = this.resizeGripSize();
    for (let i = candidates.length - 1; i >= 0; i--) {
      const node = candidates[i];
      if (graph.isChild(node)) continue;
      const r = graph.nodeRect(node);
      if (wx <= r.x + r.w && wx >= r.x + r.w - grip && wy <= r.y + r.h && wy >= r.y + r.h - grip) {
        return { type: 'resize', node };
      }
    }
    // 後から追加されたノードが上に描かれるので、逆順で見る
    for (let i = candidates.length - 1; i >= 0; i--) {
      const node = candidates[i];
      for (const p of graph.nodePorts(node, { visibleOnly: true })) {
        const dx = p.x - wx;
        const dy = p.y - wy;
        if (dx * dx + dy * dy <= portR * portR) return { type: 'port', node, port: p };
      }
    }
    for (let i = candidates.length - 1; i >= 0; i--) {
      const node = candidates[i];
      const r = graph.nodeRect(node);
      if (wx < r.x || wx > r.x + r.w || wy < r.y || wy > r.y + r.h) continue;
      const hh = graph.layout.headerHeight;
      if (wy <= r.y + hh) return { type: 'node', node, header: true };
      const rel = wy - (r.y + hh + graph.layout.padding / 2);
      const idx = Math.floor(rel / graph.layout.itemHeight);
      const itemsH = node.items ? node.items.length * graph.layout.itemHeight : 0;
      if (node.items && idx >= 0 && idx < node.items.length && rel < itemsH) {
        return { type: 'item', node, item: node.items[idx] };
      }
      return { type: 'node', node, header: false };
    }
    const edge = this.edgeAt(wx, wy);
    if (edge) return { type: 'edge', edge };
    return { type: 'none' };
  }

  /** 削除アイコンを表示するコネクタ（ホバー中 + 選択中）。表示条件を満たさなければ空 */
  deleteIconEdges() {
    if (!this.options.edgeDeleteIcon || this.options.readOnly || this.viewport.zoom <= this.theme.lodZoom) return [];
    const ids = new Set(this.selection.edges);
    if (this.hover.edge) ids.add(this.hover.edge);
    if (this.hover.edgeDelete) ids.add(this.hover.edgeDelete);
    const out = [];
    for (const id of ids) {
      const e = this.graph.edges.get(id);
      if (e) out.push(e);
    }
    return out;
  }

  /** 削除アイコンの半径（ワールド座標）。画面上では常に theme.edge.deleteIcon.radius px */
  edgeDeleteIconRadius() {
    return this.theme.edge.deleteIcon.radius / this.viewport.zoom;
  }

  /** ワールド座標に削除アイコンがあればそのエッジを返す */
  edgeDeleteIconAt(wx, wy) {
    const edges = this.deleteIconEdges();
    if (!edges.length) return null;
    const r = this.edgeDeleteIconRadius() + 2 / this.viewport.zoom;
    for (let i = edges.length - 1; i >= 0; i--) {
      const p = this.graph.edgePoint(edges[i]);
      if (!p) continue;
      const dx = p.x - wx;
      const dy = p.y - wy;
      if (dx * dx + dy * dy <= r * r) return edges[i];
    }
    return null;
  }

  /** リサイズグリップの一辺（ワールド座標）。縮小時は画面上で小さくなりすぎないようにする */
  resizeGripSize() {
    return 12 / Math.min(1, this.viewport.zoom);
  }

  /** 点に最も近いエッジ（しきい値内） */
  edgeAt(wx, wy) {
    const tol = 6 / Math.min(1, this.viewport.zoom);
    const edges = this.graph.edgesInRect({ x: wx - tol, y: wy - tol, w: tol * 2, h: tol * 2 });
    let best = null;
    let bestD = tol * tol;
    for (const e of edges) {
      const g = this.graph.edgeGeometry(e);
      if (!g) continue;
      const d = geometryDistanceSq(g, wx, wy);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /* ---------- 選択 ---------- */

  _emitSelection() {
    // selectFocused() の実行中だけは、選択した範囲を強調対象として固定する
    this._focusCache = this._pinnedFocus ?? null;
    this.emit('selection:change', { nodes: [...this.selection.nodes], edges: [...this.selection.edges] });
    if (this.focusMode !== 'off') this.emit('focus:change', this._focusDetail());
    this.minimap?.invalidate();
    this.requestRender();
  }

  select({ nodes = [], edges = [] }, { additive = false } = {}) {
    if (!additive) {
      this.selection.nodes.clear();
      this.selection.edges.clear();
    }
    for (const id of nodes) this.selection.nodes.add(id);
    for (const id of edges) this.selection.edges.add(id);
    this._emitSelection();
  }

  toggleSelect({ nodes = [], edges = [] }) {
    for (const id of nodes) this.selection.nodes.has(id) ? this.selection.nodes.delete(id) : this.selection.nodes.add(id);
    for (const id of edges) this.selection.edges.has(id) ? this.selection.edges.delete(id) : this.selection.edges.add(id);
    this._emitSelection();
  }

  clearSelection() {
    if (this.selection.nodes.size === 0 && this.selection.edges.size === 0) return;
    this.selection.nodes.clear();
    this.selection.edges.clear();
    this._emitSelection();
  }

  selectAll() {
    this.select({ nodes: [...this.graph.nodes.keys()], edges: [...this.graph.edges.keys()] });
  }

  /** 矩形（ワールド）に完全に含まれるノードと、その間のエッジを選択 */
  /** 範囲選択。子ノードは親と一緒に動くので、選ぶのは親を持たないノードだけ */
  selectInRect(rect, { additive = false } = {}) {
    const nodes = this.graph
      .nodesFullyInRect(rect)
      .filter((n) => !this.graph.isChild(n))
      .map((n) => n.id);
    const set = new Set(nodes);
    const edges = [];
    for (const id of nodes) {
      for (const e of this.graph.edgesOf(id)) {
        if (set.has(e.source) && set.has(e.target)) edges.push(e.id);
      }
    }
    this.select({ nodes, edges }, { additive });
  }

  get selectedNodes() {
    return [...this.selection.nodes].map((id) => this.graph.nodes.get(id)).filter(Boolean);
  }

  /* ---------- 編集コマンド ---------- */

  /** 選択中のノード・エッジを削除 */
  deleteSelection() {
    if (this.options.readOnly) return;
    const nodes = [...this.selection.nodes];
    const edges = [...this.selection.edges];
    if (!nodes.length && !edges.length) return;
    this.graph.batch(() => {
      this.graph.removeEdges(edges);
      this.graph.removeNodes(nodes);
    });
    this._emitSelection();
  }

  /**
   * 選択範囲内のコネクタだけを削除する（ノードは残す）。1 回の Undo で戻る。
   * @param {object} [options]
   * @param {'selected'|'between'|'attached'} [options.scope='between']
   *   selected: 選択中のコネクタのみ
   *   between : 選択中のコネクタ + 両端とも選択中ノードに繋がるコネクタ（範囲選択の内側）
   *   attached: 選択中のコネクタ + 選択中ノードに繋がる全コネクタ（外へ出るものも含む）
   * @returns {string[]} 削除したコネクタ ID
   */
  deleteSelectedEdges({ scope = 'between' } = {}) {
    if (this.options.readOnly) return [];
    const ids = this.selectedEdgeIds({ scope });
    if (!ids.length) return [];
    this.graph.removeEdges(ids);
    this._emitSelection();
    this.emit('edges:delete', { ids, scope });
    return ids;
  }

  /** deleteSelectedEdges と同じ規則で、対象になるコネクタ ID を返す（削除はしない） */
  selectedEdgeIds({ scope = 'between' } = {}) {
    const ids = new Set(this.selection.edges);
    if (scope !== 'selected') {
      const nodes = this.selection.nodes;
      for (const nodeId of nodes) {
        for (const e of this.graph.edgesOf(nodeId)) {
          if (scope === 'attached' || (nodes.has(e.source) && nodes.has(e.target))) ids.add(e.id);
        }
      }
    }
    return [...ids].filter((id) => this.graph.edges.has(id));
  }

  removeNode(id) {
    this.graph.removeNode(id);
  }

  removeEdge(id) {
    this.graph.removeEdge(id);
  }

  /** 選択中のノード（と内部のエッジ）を複製し、複製を選択状態にする */
  duplicateSelection(offset = { x: 40, y: 40 }) {
    if (this.options.readOnly) return null;
    const ids = [...this.selection.nodes];
    if (!ids.length) return null;
    const result = this.graph.duplicateNodes(ids, offset);
    this.select({ nodes: result.nodes.map((n) => n.id), edges: result.edges.map((e) => e.id) });
    return result;
  }

  duplicateNode(id, offset) {
    const result = this.graph.duplicateNodes([id], offset);
    return result.nodes[0] ?? null;
  }

  /** 選択内容を内部クリップボードへ */
  copySelection() {
    const ids = [...this.selection.nodes];
    if (!ids.length) return false;
    const set = new Set(ids);
    const nodes = ids.map((id) => structuredClone(this.graph.nodes.get(id)));
    const edges = [];
    const seen = new Set();
    for (const id of ids) {
      for (const e of this.graph.edgesOf(id)) {
        if (!seen.has(e.id) && set.has(e.source) && set.has(e.target)) {
          seen.add(e.id);
          edges.push(structuredClone(e));
        }
      }
    }
    this._clipboard = { nodes, edges };
    return true;
  }

  /**
   * クリップボードの内容を貼り付ける。
   * @param {{x:number,y:number}} [at] 貼り付け先（ワールド座標。省略時は元の位置 + オフセット）
   */
  paste(at) {
    if (this.options.readOnly || !this._clipboard) return null;
    const { nodes, edges } = this._clipboard;
    let dx = 40;
    let dy = 40;
    if (at) {
      const minX = Math.min(...nodes.map((n) => n.x));
      const minY = Math.min(...nodes.map((n) => n.y));
      dx = at.x - minX;
      dy = at.y - minY;
    }
    const idMap = new Map();
    const newNodes = [];
    const newEdges = [];
    this.graph.batch(() => {
      for (const n of nodes) {
        const copy = structuredClone(n);
        copy.id = uid('n');
        copy.x += dx;
        copy.y += dy;
        idMap.set(n.id, copy.id);
        newNodes.push(this.graph.addNode(copy));
      }
      for (const e of edges) {
        const copy = structuredClone(e);
        copy.id = uid('e');
        copy.source = idMap.get(e.source);
        copy.target = idMap.get(e.target);
        const added = this.graph.addEdge(copy);
        if (added) newEdges.push(added);
      }
    });
    // 連続貼り付けでずれるように
    for (const n of this._clipboard.nodes) {
      n.x += 40;
      n.y += 40;
    }
    this.select({ nodes: newNodes.map((n) => n.id), edges: newEdges.map((e) => e.id) });
    return { nodes: newNodes, edges: newEdges };
  }

  /** 選択ノードを移動 */
  moveSelection(dx, dy) {
    if (this.options.readOnly) return;
    this.graph.moveNodes([...this.selection.nodes], dx, dy);
  }

  /**
   * 選択ノードを移動単位で動かす（矢印キー用）。単位が未設定なら 1px × steps。
   * 先頭の選択ノードを単位に揃えたうえで動かすので、押すたびにグリッド上を進む。
   */
  nudgeSelection(stepsX, stepsY, { pixels = 1 } = {}) {
    if (this.options.readOnly || !this.selection.nodes.size) return;
    const unit = this.moveSnap || pixels;
    const ids = [...this.selection.nodes];
    const anchor = this.graph.nodes.get(ids[0]);
    let dx = stepsX * unit;
    let dy = stepsY * unit;
    if (this.moveSnap && anchor) {
      // 動かす軸だけ揃える。まだ目盛りに乗っていなければ、進む方向の次の目盛りを 1 歩目にする
      const along = (v, steps) => {
        if (!steps) return 0;
        const on = Math.abs(v / unit - Math.round(v / unit)) < 1e-6;
        const first = on ? v + Math.sign(steps) * unit : steps > 0 ? Math.ceil(v / unit) * unit : Math.floor(v / unit) * unit;
        return first + (steps - Math.sign(steps)) * unit - v;
      };
      dx = along(anchor.x, stepsX);
      dy = along(anchor.y, stepsY);
    }
    if (dx || dy) this.graph.moveNodes(ids, dx, dy);
  }

  /** ポートの表示 / 非表示（ノードのヘッダ or 項目の 1 ポート）。Undo 可 */
  setPortVisible(nodeId, portKey, visible) {
    if (this.options.readOnly) return false;
    return this.graph.setPortVisible(nodeId, portKey, visible);
  }

  /** ノード（itemId 指定なら項目）の全ポートの表示 / 非表示。Undo 可 */
  setPortsVisible(nodeId, visible, itemId) {
    if (this.options.readOnly) return false;
    return this.graph.setPortsVisible(nodeId, visible, itemId);
  }

  /** ノードの幅を変更（高さは項目数で決まる） */
  resizeNode(id, width) {
    if (this.options.readOnly) return null;
    const w = Math.max(this.options.minNodeWidth, Math.round(width));
    const node = this.graph.getNode(id);
    if (!node || this.graph.isChild(node)) return node ?? null;
    if (this.graph.nodeWidth(node) === w) return node;
    return this.graph.updateNode(id, { width: w });
  }

  /**
   * 自動整列（階層レイアウト）。コネクタが左から右へ流れ、他のノードの上を横切らないように並べる。
   * 2 つ以上のノードを選択していればその範囲だけ、そうでなければ全ノードを対象にする。1 回の Undo で戻る。
   * @param {object} [options] layeredLayout のオプションに加えて:
   * @param {Iterable<string>} [options.nodeIds]  対象ノードを明示する
   * @param {boolean} [options.fit=true]           整列後に対象が収まるように表示する（全体対象のとき）
   * @param {boolean} [options.animate=true]      fit のアニメーション
   * @returns {string[]} 移動対象になったノード ID
   */
  autoLayout({ nodeIds, fit = true, animate = true, ...layoutOptions } = {}) {
    if (this.options.readOnly) return [];
    let ids = nodeIds ? [...nodeIds] : null;
    let scoped = true;
    if (!ids) {
      if (this.selection.nodes.size >= 2) ids = [...this.selection.nodes];
      else {
        ids = [...this.graph.nodes.keys()];
        scoped = false;
      }
    }
    if (!ids.length) return [];
    const positions = layeredLayout(this.graph, ids, layoutOptions);
    this.graph.batch(() => {
      for (const [id, p] of positions) {
        const n = this.graph.nodes.get(id);
        const dx = Math.round(p.x) - n.x;
        const dy = Math.round(p.y) - n.y;
        if (dx || dy) this.graph.moveNodes([id], dx, dy);
      }
    });
    if (fit) {
      if (!scoped) this.fitView(40, { animate });
      else {
        // 選択範囲だけのときは、その範囲が見えるように寄せる（ズームは変えない）
        const b = boundsOf(this.graph, ids);
        if (b) this.centerOn(b.x + b.w / 2, b.y + b.h / 2, { animate });
      }
    }
    this.emit('layout', { nodes: [...positions.keys()] });
    return [...positions.keys()];
  }

  /* ---------- ポインタ位置・ノード追加 ---------- */

  /**
   * 最後に観測したポインタ位置。canvas 上に無ければ inside=false（座標は最後の位置）。
   * @returns {{world:{x:number,y:number}, screen:{x:number,y:number}, inside:boolean}|null} 一度も観測していなければ null
   */
  getPointer() {
    const c = this.interaction._lastClientPos;
    if (!c) return null;
    const r = this.canvas.getBoundingClientRect();
    const screen = { x: c.x - r.left, y: c.y - r.top };
    return { world: this.viewport.toWorld(screen.x, screen.y), screen, inside: this.interaction.pointerInside };
  }

  /** 表示中の画面の中央（ワールド座標） */
  viewCenter() {
    return this.viewport.toWorld(this.viewport.width / 2, this.viewport.height / 2);
  }

  /**
   * 指定位置にノードを追加する（Undo 可）。
   * @param {object} spec  ノード定義（x, y は無視される）
   * @param {object} [options]
   * @param {{x:number,y:number}} [options.at]            ワールド座標。省略時はポインタ位置（canvas 外・未観測なら画面中央）
   * @param {{clientX:number, clientY:number}} [options.client] クライアント座標（マウスイベントの clientX/Y をそのまま渡せる）
   * @param {'center'|'top-left'|'header'} [options.anchor='center'] 位置に合わせるノードの基準点
   * @param {boolean} [options.select=true]   追加後に選択する
   * @param {boolean} [options.snap=false]    theme.grid.size に吸着する
   * @param {boolean} [options.avoidOverlap=false] 既存ノードと重なる場合は右下へずらす
   * @returns {object|null} 追加したノード
   */
  addNodeAt(spec, { at, client, anchor = 'center', select = true, snap = this.moveSnap > 0, avoidOverlap = false } = {}) {
    if (this.options.readOnly) return null;
    let pos = at;
    if (!pos && client) pos = this.clientToWorld(client.clientX, client.clientY);
    if (!pos) {
      const p = this.getPointer();
      pos = p && p.inside ? p.world : this.viewCenter();
    }
    // サイズは幅と項目数から決まるので、追加前に計算する
    const probe = { ...spec, items: spec.items ?? [] };
    const w = this.graph.nodeWidth(probe);
    const h = this.graph.nodeHeight(probe);
    let x = pos.x;
    let y = pos.y;
    if (anchor === 'center') {
      x -= w / 2;
      y -= h / 2;
    } else if (anchor === 'header') {
      x -= w / 2;
      y -= this.graph.layout.headerHeight / 2;
    }
    if (snap) {
      const g = this.moveSnap || this.theme.grid?.size || 1;
      x = Math.round(x / g) * g;
      y = Math.round(y / g) * g;
    }
    if (avoidOverlap) {
      const step = this.moveSnap || 24;
      for (let i = 0; i < 50 && this.graph.nodesInRect({ x, y, w, h }).length; i++) {
        x += step;
        y += step;
      }
    }
    const node = this.graph.addNode({ ...spec, x: Math.round(x), y: Math.round(y) });
    if (select) this.select({ nodes: [node.id] });
    return node;
  }

  /** ポインタ位置にノードを追加（addNodeAt の別名。canvas 外なら画面中央） */
  addNodeAtPointer(spec, options) {
    return this.addNodeAt(spec, { ...options, at: undefined, client: undefined });
  }

  /** 画面中央にノードを追加 */
  addNodeAtCenter(spec, options) {
    return this.addNodeAt(spec, { ...options, at: this.viewCenter() });
  }

  /* ---------- Undo / Redo ---------- */

  get canUndo() {
    return this.history.canUndo;
  }

  get canRedo() {
    return this.history.canRedo;
  }

  undo() {
    if (this.options.readOnly) return false;
    const ok = this.history.undo();
    if (ok) this._pruneSelection();
    return ok;
  }

  redo() {
    if (this.options.readOnly) return false;
    const ok = this.history.redo();
    if (ok) this._pruneSelection();
    return ok;
  }

  /** 存在しなくなった要素を選択から外す */
  _pruneSelection() {
    let changed = false;
    for (const id of [...this.selection.nodes]) {
      if (!this.graph.nodes.has(id)) {
        this.selection.nodes.delete(id);
        changed = true;
      }
    }
    for (const id of [...this.selection.edges]) {
      if (!this.graph.edges.has(id)) {
        this.selection.edges.delete(id);
        changed = true;
      }
    }
    if (changed) this._emitSelection();
    else this.requestRender();
  }

  /* ---------- ビュー操作 ---------- */

  zoomIn(factor = 1.2) {
    this.viewport.zoomAt(this.viewport.width / 2, this.viewport.height / 2, factor);
    this._viewportChanged();
  }

  zoomOut(factor = 1.2) {
    this.viewport.zoomAt(this.viewport.width / 2, this.viewport.height / 2, 1 / factor);
    this._viewportChanged();
  }

  setZoom(zoom) {
    this.viewport.setZoomAt(this.viewport.width / 2, this.viewport.height / 2, zoom);
    this._viewportChanged();
  }

  /** 縮尺を 1 に戻す（中心は維持） */
  resetZoom() {
    this.setZoom(1);
  }

  /** 縮尺 1・原点を左上へ */
  resetView() {
    this.viewport.reset();
    this._viewportChanged();
  }

  fitView(padding = 40, { animate = false } = {}) {
    const b = this.graph.bounds();
    if (!b) return;
    const before = this.viewport.snapshot();
    this.viewport.fitRect(b, padding);
    if (animate) this._animateFrom(before);
    else this._viewportChanged();
  }

  /** ノードが画面中央に来るようにスクロール */
  centerOnNode(id, { zoom, animate = true, duration = 300 } = {}) {
    const node = this.graph.nodes.get(id);
    if (!node) return false;
    const r = this.graph.nodeRect(node);
    const before = this.viewport.snapshot();
    this.viewport.centerOn(r.x + r.w / 2, r.y + r.h / 2, zoom ?? this.viewport.zoom);
    if (animate) this._animateFrom(before, duration);
    else this._viewportChanged();
    return true;
  }

  centerOn(wx, wy, { zoom, animate = false, duration = 300 } = {}) {
    const before = this.viewport.snapshot();
    this.viewport.centerOn(wx, wy, zoom ?? this.viewport.zoom);
    if (animate) this._animateFrom(before, duration);
    else this._viewportChanged();
  }

  _animateFrom(from, duration = 300) {
    const to = this.viewport.snapshot();
    if (this._anim) cancelAnimationFrame(this._anim);
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const k = ease(t);
      // ズームは対数補間すると自然
      const zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * k);
      this.viewport.zoom = zoom;
      this.viewport.tx = from.tx + (to.tx - from.tx) * k;
      this.viewport.ty = from.ty + (to.ty - from.ty) * k;
      this.render();
      if (t < 1) this._anim = requestAnimationFrame(step);
      else {
        this._anim = null;
        this.viewport.restore(to);
        this._viewportChanged();
      }
    };
    this.viewport.restore(from);
    this._anim = requestAnimationFrame(step);
  }

  _viewportChanged() {
    this.requestRender();
    this.emit('viewport:change', this.viewport.snapshot());
  }

  /* ---------- 検索 ---------- */

  /**
   * タイトル・項目ラベル・項目値・ID を部分一致（大文字小文字無視）で検索。
   * @param {string|RegExp|((node:object)=>boolean)} query
   * @returns {object[]} 一致ノード
   */
  search(query) {
    if (!query) return [];
    let pred;
    if (typeof query === 'function') pred = query;
    else {
      const re = query instanceof RegExp ? query : new RegExp(escapeRegExp(String(query)), 'i');
      pred = (n) =>
        re.test(n.title ?? '') ||
        re.test(n.id) ||
        (n.items ?? []).some((it) => re.test(it.label ?? '') || re.test(String(it.value ?? '')));
    }
    const out = [];
    for (const n of this.graph.nodes.values()) if (pred(n)) out.push(n);
    return out;
  }

  /** 検索して最初の一致を中央に表示・選択する。戻り値は一致一覧。 */
  searchAndFocus(query, index = 0) {
    const matches = this.search(query);
    if (matches.length) {
      const node = matches[((index % matches.length) + matches.length) % matches.length];
      this.select({ nodes: [node.id] });
      this.centerOnNode(node.id);
    }
    return matches;
  }

  /* ---------- JSON インポート / エクスポート ---------- */

  /**
   * エクスポート用オブジェクト（{format, version, nodes, edges, viewport?}）を返す。
   * @param {{selectionOnly?:boolean, includeViewport?:boolean}} [options]
   */
  exportData({ selectionOnly = false, includeViewport = true } = {}) {
    const data = serialize(this.graph, {
      nodeIds: selectionOnly ? this.selection.nodes : undefined,
      viewport: includeViewport && !selectionOnly ? this.viewport.snapshot() : null,
    });
    this.emit('export', { data, selectionOnly });
    return data;
  }

  /** JSON 文字列としてエクスポート */
  exportJSON({ pretty = true, ...options } = {}) {
    return JSON.stringify(this.exportData(options), null, pretty ? 2 : 0);
  }

  /** ブラウザでファイルとしてダウンロード */
  downloadJSON(filename = 'canvas-flow.json', options = {}) {
    downloadText(this.exportJSON(options), filename);
  }

  /**
   * JSON（文字列またはオブジェクト）を読み込む。
   * @param {string|object} input
   * @param {object} [options]
   * @param {'replace'|'merge'} [options.mode='replace'] replace: 置き換え（履歴は破棄） / merge: 追加（Undo 可）
   * @param {{x:number,y:number}} [options.offset]  merge 時に加える位置オフセット
   * @param {{x:number,y:number}} [options.at]      merge 時の配置位置（ワールド座標）。anchor で基準を選ぶ
   * @param {'origin'|'top-left'|'center'} [options.anchor='top-left']
   *   origin  : JSON 内の座標を at からの相対位置として扱う（(0,0) のノードが at に来る）
   *   top-left: ノード群を囲む矩形の左上を at に合わせる
   *   center  : ノード群を囲む矩形の中心を at に合わせる
   * @param {boolean} [options.select=true]         merge 後に読み込んだ要素を選択する
   * @param {boolean} [options.restoreViewport=true] replace 時に viewport を復元する
   * @param {boolean} [options.fitView=false]       読み込み後に全体表示する
   * @returns {{ok:true, nodes:object[], edges:object[], warnings:string[]} | {ok:false, errors:string[]}}
   */
  importData(input, { mode = 'replace', offset, at, anchor = 'top-left', select = true, restoreViewport = true, fitView = false } = {}) {
    if (this.options.readOnly) return { ok: false, errors: ['読み取り専用です'] };
    const parsed = parse(input);
    if (!parsed.ok) return parsed;
    const { data, warnings } = parsed;
    let nodes;
    let edges;

    if (mode === 'merge') {
      let off = offset;
      if (at && data.nodes.length) {
        if (anchor === 'origin') {
          off = { x: at.x, y: at.y };
        } else {
          const b = boundsOfNodes(this.graph, data.nodes);
          off =
            anchor === 'center'
              ? { x: at.x - (b.x + b.w / 2), y: at.y - (b.y + b.h / 2) }
              : { x: at.x - b.x, y: at.y - b.y };
        }
        off = { x: Math.round(off.x), y: Math.round(off.y) };
      }
      const remapped = remapForMerge(data, this.graph, { offset: off });
      nodes = [];
      edges = [];
      this.graph.batch(() => {
        for (const n of remapped.nodes) nodes.push(this.graph.addNode(n));
        for (const e of remapped.edges) {
          const added = this.graph.addEdge(e);
          if (added) edges.push(added);
        }
      });
      if (select) this.select({ nodes: nodes.map((n) => n.id), edges: edges.map((e) => e.id) });
    } else {
      this.clearSelection();
      this.graph.load(data);
      nodes = [...this.graph.nodes.values()];
      edges = [...this.graph.edges.values()];
      if (restoreViewport && data.viewport) {
        this.viewport.restore(data.viewport);
        this._viewportChanged();
      }
    }
    if (fitView) this.fitView();
    const result = { ok: true, mode, nodes, edges, warnings };
    this.emit('import', result);
    return result;
  }

  /** importData の別名 */
  importJSON(input, options) {
    return this.importData(input, options);
  }

  /**
   * 複数のノード・コネクタを含む JSON を、指定位置に追加する（既存の内容は残す。1 回の Undo で戻る）。
   * JSON 内のノード座標は「追加位置からの相対位置」として扱われる（既定 anchor='origin'）。
   * つまり JSON で (0, 0) にあるノードは追加位置にそのまま置かれ、(300, 80) のノードは追加位置から右に 300、下に 80 ずれる。
   *
   * @param {string|object} input  {nodes, edges} を含む JSON 文字列またはオブジェクト
   * @param {object} [options]
   * @param {{x:number,y:number}} [options.at]      追加位置（ワールド座標）。省略時はポインタ位置（canvas 外・未観測なら画面中央）
   * @param {{clientX:number, clientY:number}} [options.client] クライアント座標で指定（マウスイベントをそのまま渡せる）
   * @param {'origin'|'top-left'|'center'} [options.anchor='origin'] 追加位置に合わせる基準
   * @param {boolean} [options.select=true]  追加した要素を選択する
   * @param {boolean} [options.snap=false]   追加位置を theme.grid.size に吸着する
   * @returns {{ok:true, nodes, edges, warnings} | {ok:false, errors}}
   */
  insertJSON(input, { at, client, anchor = 'origin', select = true, snap = this.moveSnap > 0 } = {}) {
    if (this.options.readOnly) return { ok: false, errors: ['読み取り専用です'] };
    let pos = at;
    if (!pos && client) pos = this.clientToWorld(client.clientX, client.clientY);
    if (!pos) {
      const p = this.getPointer();
      pos = p && p.inside ? p.world : this.viewCenter();
    }
    if (snap) {
      const g = this.moveSnap || this.theme.grid?.size || 1;
      pos = { x: Math.round(pos.x / g) * g, y: Math.round(pos.y / g) * g };
    }
    const r = this.importData(input, { mode: 'merge', at: pos, anchor, select });
    if (r.ok) this.emit('insert', { at: pos, anchor, nodes: r.nodes, edges: r.edges });
    return r;
  }

  /** insertJSON をポインタ位置で（canvas 外なら画面中央） */
  insertJSONAtPointer(input, options) {
    return this.insertJSON(input, { ...options, at: undefined, client: undefined });
  }

  /** File / Blob から読み込む */
  async importFromFile(file, options) {
    const text = typeof file === 'string' ? file : await file.text();
    return this.importData(text, options);
  }

  /** ファイル選択ダイアログを開いて読み込む。キャンセル時は null */
  async openImportDialog(options) {
    const picked = await pickTextFile();
    if (!picked) return null;
    return this.importData(picked.text, options);
  }

  /** エクスポート用オブジェクト（exportData と同じ。JSON.stringify(editor) でも使える） */
  toJSON() {
    return serialize(this.graph, { viewport: this.viewport.snapshot() });
  }

  /** 内容を置き換えて読み込む（importData(data, {mode:'replace'}) の簡易版。検証は行わない） */
  load(data) {
    this.clearSelection();
    this.graph.load(data);
    if (data.viewport) {
      this.viewport.restore(data.viewport);
      this._viewportChanged();
    }
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._anim) cancelAnimationFrame(this._anim);
    this.interaction.destroy();
    this.history.destroy();
    this.minimap?.destroy();
    this.graph.off('change', this._onGraphChange);
  }
}

/** ノード定義の配列を囲む矩形（グラフに未登録のノードでも計算できる） */
function boundsOfNodes(graph, nodes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const w = graph.nodeWidth(n);
    const h = graph.nodeHeight({ ...n, items: n.items ?? [] });
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + w);
    y1 = Math.max(y1, n.y + h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function boundsOf(graph, ids) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const n = graph.nodes.get(id);
    if (!n) continue;
    const r = graph.nodeRect(n);
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** コネクタ形状と点の距離の二乗（ベジェは折れ線近似） */
function geometryDistanceSq(g, px, py) {
  const pts = geometryPolyline(g, 24);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    best = Math.min(best, segDistSq(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, px, py));
  }
  return best;
}

function segDistSq(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t - px;
  const y = ay + dy * t - py;
  return x * x + y * y;
}

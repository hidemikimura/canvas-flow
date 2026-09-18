import { edgeGeometryFor, geometryPoint, normalizeEdgeType } from './graph.js';

/**
 * Canvas 2D レンダラー。
 * 表示範囲内のノード・エッジだけを空間インデックスから取り出して描画する。
 */
export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./graph.js').Graph} graph
   * @param {import('./viewport.js').Viewport} viewport
   * @param {object} theme
   */
  constructor(canvas, graph, viewport, theme) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.graph = graph;
    this.viewport = viewport;
    this.theme = theme;
    this.dpr = 1;
    /** @type {((ctx:CanvasRenderingContext2D, node:any, rect:any, api:any)=>boolean|void)|null} 独自ノード描画。true を返すと既定描画を省略 */
    this.renderNode = null;
    /** @type {((ctx:CanvasRenderingContext2D, edge:any, geom:any, api:any)=>boolean|void)|null} */
    this.renderEdge = null;
    /**
     * @type {((ctx:CanvasRenderingContext2D, info:{visible:object, lod:boolean, zoom:number, nodes:any[], edges:any[], state:object, theme:object, graph:object, roundRect:Function, fitText:Function})=>void)|null}
     * ノード・エッジを描いたあとに呼ばれる追加描画（バッジや分析表示など）。
     * ワールド座標系のまま呼ばれるので、画面上で一定の大きさにしたいものは `zoom` で割る。
     */
    this.renderOverlay = null;
    /** @type {(node:any)=>object} ノードのスタイル解決（種別スタイル + node.style） */
    this.resolveNodeStyle = (node) => (node.style ? { ...theme.node, ...node.style } : theme.node);
    this.resolveEdgeStyle = (edge) => (edge.style ? { ...theme.edge, ...edge.style } : theme.edge);
    this._textCache = new Map();
    this._portBatch = { plain: [], connected: [], full: [], hover: [] };
    this.stats = { nodes: 0, edges: 0, ms: 0 };
  }

  setTheme(theme) {
    this.theme = theme;
    this._textCache.clear();
  }

  /** 表示サイズ（CSS px）と devicePixelRatio に合わせて canvas を調整 */
  resize(width, height, dpr = window.devicePixelRatio || 1) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  /**
   * @param {object} state 描画状態
   * @param {Set<string>} state.selectedNodes
   * @param {Set<string>} state.selectedEdges
   * @param {string|null} state.hoverNode
   * @param {string|null} state.hoverEdge
   * @param {{node:string, port:string}|null} state.hoverPort
   * @param {{x:number,y:number,w:number,h:number}|null} state.selectionBox ワールド座標
   * @param {{from:{x:number,y:number}, to:{x:number,y:number}, dir:string}|null} state.pendingEdge
   * @param {object[]} [state.deleteIconEdges] 削除アイコンを描くエッジ
   * @param {string|null} [state.hoverEdgeDelete] アイコンをホバー中のエッジ ID
   * @param {{nodes:Set<string>, edges:Set<string>}|null} [state.focus] 強調表示の対象。これ以外は薄く描く
   */
  render(state) {
    const t0 = performance.now();
    const { ctx, viewport: vp, theme, dpr } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, W, H);

    this._drawGrid();

    // ワールド座標系へ
    ctx.setTransform(dpr * vp.zoom, 0, 0, dpr * vp.zoom, dpr * vp.tx, dpr * vp.ty);

    const visible = vp.visibleRect(64);
    const lod = vp.zoom <= theme.lodZoom;

    let edges;
    let nodes;
    if (lod && !this.renderNode && !this.renderEdge) {
      // 遠景: 個別スタイルを省き、1 パスにまとめて描く（10000 ノード全表示でも数 ms）
      ({ edges, nodes } = this._renderFar(visible, state));
    } else {
      const focus = state.focus ?? null;
      const dimAlpha = this.theme.focus.dimOpacity;

      // --- エッジ ---
      edges = this.graph.edgesInRect(visible);
      const deferred = [];
      ctx.lineCap = 'round';
      // 薄くする側を先に描いてから、強調する側を上に重ねる
      if (focus) {
        ctx.globalAlpha = dimAlpha;
        for (const e of edges) if (!focus.edges.has(e.id)) this._drawEdge(e, false, false);
        ctx.globalAlpha = 1;
      }
      for (const e of edges) {
        if (focus && !focus.edges.has(e.id)) continue;
        const sel = state.selectedEdges.has(e.id);
        const hov = state.hoverEdge === e.id;
        if (sel || hov) deferred.push(e);
        else this._drawEdge(e, false, false, focus ? 'focus' : null);
      }
      for (const e of deferred) {
        this._drawEdge(e, state.selectedEdges.has(e.id), state.hoverEdge === e.id, focus ? 'focus' : null);
      }

      // --- ノード ---
      // 子ノードは親の描画から再帰で描くので、ここでは親を持たないものだけ回す
      nodes = this.graph.nodesInRect(visible);
      const roots = nodes.filter((n) => !this.graph.isChild(n));
      if (focus) {
        ctx.globalAlpha = dimAlpha;
        for (const n of roots) if (!focus.nodes.has(n.id)) this._drawNode(n, state, lod);
        this._flushPorts();
        ctx.globalAlpha = 1;
      }
      for (const n of roots) {
        if (focus && !focus.nodes.has(n.id)) continue;
        this._drawNode(n, state, lod);
      }
      this._flushPorts();
    }

    // --- goto（ID 指定の遷移）の点線。選択・強調されているものだけ ---
    if (!lod) this._drawGotoLinks(state);

    // --- 追加描画（ノードより手前。分析表示やバッジなど） ---
    if (this.renderOverlay) {
      ctx.save();
      this.renderOverlay(ctx, {
        visible,
        lod,
        zoom: vp.zoom,
        nodes,
        edges,
        state,
        theme,
        graph: this.graph,
        roundRect: (x, y, w, h, r) => this._roundRect(x, y, w, h, r),
        fitText: (text, w, font) => this._fit(text, w, font),
      });
      ctx.restore();
    }

    // --- コネクタの削除アイコン（ノードより手前） ---
    if (state.deleteIconEdges && state.deleteIconEdges.length) {
      for (const e of state.deleteIconEdges) this._drawEdgeDeleteIcon(e, state.hoverEdgeDelete === e.id);
    }

    // --- 接続中の仮エッジ ---
    if (state.pendingEdge) this._drawPendingEdge(state.pendingEdge);

    // --- 範囲選択矩形 ---
    if (state.selectionBox) {
      const b = state.selectionBox;
      ctx.fillStyle = theme.selectionBox.fill;
      ctx.strokeStyle = theme.selectionBox.stroke;
      ctx.lineWidth = 1 / vp.zoom;
      ctx.setLineDash([4 / vp.zoom, 4 / vp.zoom]);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.stats = { nodes: nodes.length, edges: edges.length, ms: performance.now() - t0 };
  }

  /** 遠景描画: エッジは直線 1 パス、ノードは矩形のみ */
  _renderFar(visible, state) {
    const { ctx, viewport: vp, theme, graph } = this;
    const edges = graph.edgesInRect(visible);
    const nodes = graph.nodesInRect(visible);

    const focus = state.focus ?? null;

    // エッジ（通常）。focus 中は対象外を先に薄く描く
    ctx.lineCap = 'butt';
    for (const pass of focus ? ['dim', 'focus'] : ['all']) {
      ctx.globalAlpha = pass === 'dim' ? theme.focus.dimOpacityLod : 1;
      ctx.beginPath();
      for (const e of edges) {
        if (state.selectedEdges.has(e.id)) continue;
        if (pass === 'dim' && focus.edges.has(e.id)) continue;
        if (pass === 'focus' && !focus.edges.has(e.id)) continue;
        const g = graph.edgeGeometry(e);
        if (!g) continue;
        this._edgePathFar(g);
      }
      ctx.strokeStyle = pass === 'focus' && theme.focus.edgeStroke ? theme.focus.edgeStroke : theme.edge.stroke;
      ctx.lineWidth = (pass === 'focus' && theme.focus.edgeWidth ? theme.focus.edgeWidth : theme.edge.strokeWidth) / vp.zoom;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ノード（通常）: 種別スタイルが違っても塗りは既定色でまとめる
    for (const pass of focus ? ['dim', 'focus'] : ['all']) {
      ctx.globalAlpha = pass === 'dim' ? theme.focus.dimOpacityLod : 1;
      ctx.beginPath();
      for (const n of nodes) {
        if (state.selectedNodes.has(n.id)) continue;
        if (graph.isChild(n)) continue;
        if (pass === 'dim' && focus.nodes.has(n.id)) continue;
        if (pass === 'focus' && !focus.nodes.has(n.id)) continue;
        const r = graph.nodeRect(n);
        ctx.rect(r.x, r.y, r.w, r.h);
      }
      ctx.fillStyle = theme.node.headerFill;
      ctx.fill();
      ctx.strokeStyle = theme.node.stroke;
      ctx.lineWidth = theme.node.strokeWidth / vp.zoom;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 選択中のものは強調して上に描く
    if (state.selectedEdges.size) {
      ctx.beginPath();
      for (const e of edges) {
        if (!state.selectedEdges.has(e.id)) continue;
        const g = graph.edgeGeometry(e);
        if (!g) continue;
        this._edgePathFar(g);
      }
      ctx.strokeStyle = theme.edge.selectedStroke;
      ctx.lineWidth = theme.edge.selectedStrokeWidth / vp.zoom;
      ctx.stroke();
    }
    if (state.selectedNodes.size) {
      ctx.beginPath();
      for (const n of nodes) {
        if (!state.selectedNodes.has(n.id)) continue;
        const r = graph.nodeRect(n);
        ctx.rect(r.x, r.y, r.w, r.h);
      }
      ctx.fillStyle = theme.node.fill;
      ctx.fill();
      ctx.strokeStyle = theme.node.selectedStroke;
      ctx.lineWidth = theme.node.selectedStrokeWidth / vp.zoom;
      ctx.stroke();
    }
    return { edges, nodes };
  }

  _drawGrid() {
    const { ctx, viewport: vp, theme, dpr } = this;
    const g = theme.grid;
    if (!g) return;
    // 画面上で 12px 未満になるグリッドは間引く
    let step = g.size;
    while (step * vp.zoom < 12) step *= g.majorEvery;
    const stepPx = step * vp.zoom * dpr;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ox = ((vp.tx * dpr) % stepPx + stepPx) % stepPx;
    const oy = ((vp.ty * dpr) % stepPx + stepPx) % stepPx;
    const worldStartX = Math.floor(-vp.tx / step);
    const worldStartY = Math.floor(-vp.ty / step);

    ctx.lineWidth = 1;
    ctx.beginPath();
    let i = 0;
    for (let x = ox; x <= W; x += stepPx, i++) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
    }
    for (let y = oy; y <= H; y += stepPx) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.strokeStyle = g.color;
    ctx.stroke();

    // 太線
    if (g.majorEvery > 1) {
      ctx.beginPath();
      let k = worldStartX;
      for (let x = ox; x <= W; x += stepPx, k++) {
        if (k % g.majorEvery !== 0) continue;
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, H);
      }
      k = worldStartY;
      for (let y = oy; y <= H; y += stepPx, k++) {
        if (k % g.majorEvery !== 0) continue;
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(W, Math.round(y) + 0.5);
      }
      ctx.strokeStyle = g.majorColor;
      ctx.stroke();
    }
  }

  /** 形状 g のパスを ctx に積む */
  _edgePath(g, begin = true) {
    const { ctx } = this;
    if (begin) ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    if (g.type === 'bezier') {
      ctx.bezierCurveTo(g.c1x, g.c1y, g.c2x, g.c2y, g.x2, g.y2);
    } else {
      const pts = g.points;
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
  }

  /** 遠景用: bezier は直線 1 本、それ以外は折れ線をそのまま */
  _edgePathFar(g) {
    const { ctx } = this;
    ctx.moveTo(g.x1, g.y1);
    if (g.type === 'bezier') {
      ctx.lineTo(g.x2, g.y2);
    } else {
      for (let i = 1; i < g.points.length; i++) ctx.lineTo(g.points[i].x, g.points[i].y);
    }
  }

  _drawEdge(edge, selected, hover, emphasis = null) {
    const g = this.graph.edgeGeometry(edge);
    if (!g) return;
    const { ctx, viewport: vp } = this;
    const st = this.resolveEdgeStyle(edge);
    if (this.renderEdge && this.renderEdge(ctx, edge, g, this._api(selected, hover, st)) === true) return;
    const fs = this.theme.focus;
    this._edgePath(g);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = selected
      ? st.selectedStroke
      : hover
        ? st.hoverStroke
        : emphasis === 'focus' && fs.edgeStroke
          ? fs.edgeStroke
          : st.stroke;
    const w = selected
      ? st.selectedStrokeWidth
      : emphasis === 'focus' && fs.edgeWidth
        ? fs.edgeWidth
        : st.strokeWidth;
    ctx.lineWidth = w / vp.zoom;
    ctx.stroke();
  }

  /** コネクタ中央の × アイコン。画面上のサイズが一定になるよう zoom で割る */
  /**
   * goto（コネクタを使わない ID 指定の遷移）を点線の矢印で描く。
   * 対象は「選択中のノードに出入りするリンク」と「強調表示で辿ったリンク」だけ。
   */
  _drawGotoLinks(state) {
    const { ctx, graph, viewport: vp, theme } = this;
    const st = theme.goto;
    if (!st) return;
    const focusLinks = state.focus?.links ?? null;
    const picked = new Map();
    const add = (link) => {
      if (link.exists && !picked.has(link.key)) picked.set(link.key, link);
    };
    if (focusLinks && focusLinks.size) {
      for (const id of state.focus.nodes) {
        for (const l of graph.gotoLinks(id)) if (focusLinks.has(l.key)) add(l);
      }
    }
    for (const id of state.selectedNodes) {
      for (const l of graph.gotoLinks(id)) add(l);
      for (const l of graph.gotoSources(id)) add(l);
    }
    if (!picked.size) return;

    const type = normalizeEdgeType(graph.layout.edgeType);
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = (st.strokeWidth ?? 1.5) / vp.zoom;
    ctx.setLineDash((st.dash ?? [6, 4]).map((v) => v / vp.zoom));
    for (const link of picked.values()) {
      const anchor = graph.gotoAnchor(link);
      if (!anchor) continue;
      const g = edgeGeometryFor(type, anchor.a, anchor.b, graph.layout, 1);
      this._edgePath(g);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 矢印とラベルは実線で
    for (const link of picked.values()) {
      const anchor = graph.gotoAnchor(link);
      if (!anchor) continue;
      this._drawGotoArrow(anchor.b, anchor.a, st);
      if (link.label && vp.zoom >= 0.7) {
        // 出発点寄りに置く。往復する 2 本があっても重ならない
        const g = edgeGeometryFor(type, anchor.a, anchor.b, graph.layout, 1);
        this._drawGotoLabel(link.label, geometryPoint(g, 0.32) ?? anchor.a, st);
      }
    }
    ctx.restore();
  }

  /** 遷移先ノードの左端に三角の矢印を描く（tip に向けて from の側から） */
  _drawGotoArrow(tip, from, st) {
    const { ctx, viewport: vp } = this;
    const size = (st.arrow ?? 9) / vp.zoom;
    // 入口は常に左からなので、向きは固定（水平）にしておくと小さくても読みやすい
    void from;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - size, tip.y - size * 0.45);
    ctx.lineTo(tip.x - size, tip.y + size * 0.45);
    ctx.closePath();
    ctx.fillStyle = st.stroke;
    ctx.fill();
  }

  _drawGotoLabel(text, at, st) {
    const { ctx, viewport: vp } = this;
    const { x, y } = at;
    const scale = 1 / vp.zoom;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.font = st.labelFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = st.labelBg;
    this._roundRect(-w / 2, -8, w, 16, 4);
    ctx.fill();
    ctx.fillStyle = st.labelColor;
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  }

  _drawEdgeDeleteIcon(edge, hover) {
    const p = this.graph.edgePoint(edge);
    if (!p) return;
    const { ctx, viewport: vp, theme } = this;
    const ic = theme.edge.deleteIcon;
    const r = ic.radius / vp.zoom;
    const k = r * 0.42;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = hover ? ic.hoverFill : ic.fill;
    ctx.fill();
    ctx.strokeStyle = ic.stroke;
    ctx.lineWidth = 1.5 / vp.zoom;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - k, p.y - k);
    ctx.lineTo(p.x + k, p.y + k);
    ctx.moveTo(p.x + k, p.y - k);
    ctx.lineTo(p.x - k, p.y + k);
    ctx.strokeStyle = hover ? ic.hoverColor : ic.color;
    ctx.lineWidth = 2 / vp.zoom;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  _drawPendingEdge(p) {
    const { ctx, viewport: vp, theme } = this;
    const dir = p.dir === 'out' ? 1 : -1;
    const g = edgeGeometryFor(normalizeEdgeType(this.graph.layout.edgeType), p.from, p.to, this.graph.layout, dir);
    this._edgePath(g);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = theme.edge.pendingStroke;
    ctx.lineWidth = theme.edge.strokeWidth / vp.zoom;
    ctx.setLineDash([6 / vp.zoom, 4 / vp.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawNode(node, state, lod) {
    const { ctx, viewport: vp, theme, graph } = this;
    const rect = graph.nodeRect(node);
    const st = this.resolveNodeStyle(node);
    const selected = state.selectedNodes.has(node.id);
    const hover = state.hoverNode === node.id;

    if (this.renderNode && this.renderNode(ctx, node, rect, this._api(selected, hover, st, lod)) === true) return;

    const r = Math.min(st.radius, rect.w / 2, rect.h / 2);

    // 影（縮小時はほぼ見えないうえに高コストなので 50% 未満では省く）
    if (!lod && st.shadow && vp.zoom >= 0.5) {
      ctx.save();
      ctx.shadowColor = st.shadow;
      ctx.shadowBlur = 8 * vp.zoom;
      ctx.shadowOffsetY = 2 * vp.zoom;
      ctx.fillStyle = st.fill;
      this._roundRect(rect.x, rect.y, rect.w, rect.h, r);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = st.fill;
      this._roundRect(rect.x, rect.y, rect.w, rect.h, r);
      ctx.fill();
    }

    // ヘッダ
    const hh = graph.layout.headerHeight;
    ctx.fillStyle = st.headerFill;
    if (rect.h > hh) {
      this._roundRectTop(rect.x, rect.y, rect.w, hh, r);
    } else {
      this._roundRect(rect.x, rect.y, rect.w, rect.h, r);
    }
    ctx.fill();

    // 枠
    this._roundRect(rect.x, rect.y, rect.w, rect.h, r);
    ctx.strokeStyle = selected ? st.selectedStroke : hover ? st.hoverStroke : st.stroke;
    ctx.lineWidth = (selected ? st.selectedStrokeWidth : st.strokeWidth) / vp.zoom;
    ctx.stroke();

    if (lod) {
      for (const child of graph.childrenOf(node)) this._drawNode(child, state, lod);
      return;
    }

    // タイトル
    ctx.font = theme.titleFont;
    ctx.fillStyle = st.titleColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(this._fit(node.title, rect.w - st.padding * 2, theme.titleFont), rect.x + st.padding, rect.y + hh / 2);

    // 項目
    if (node.items && node.items.length) {
      ctx.font = theme.font;
      const ih = graph.layout.itemHeight;
      let y = rect.y + hh + graph.layout.padding / 2;
      for (let i = 0; i < node.items.length; i++) {
        const item = node.items[i];
        const cy = y + ih / 2;
        if (i > 0) {
          ctx.strokeStyle = st.itemSeparator;
          ctx.lineWidth = 1 / vp.zoom;
          ctx.beginPath();
          ctx.moveTo(rect.x + st.padding, y);
          ctx.lineTo(rect.x + rect.w - st.padding, y);
          ctx.stroke();
        }
        ctx.fillStyle = st.textColor;
        ctx.textAlign = 'left';
        const hasValue = item.value != null && item.value !== '';
        const labelW = hasValue ? (rect.w - st.padding * 2) * 0.5 : rect.w - st.padding * 2;
        ctx.fillText(this._fit(item.label ?? '', labelW, theme.font), rect.x + st.padding + 4, cy);
        if (hasValue) {
          ctx.textAlign = 'right';
          ctx.fillStyle = st.titleColor;
          ctx.fillText(this._fit(String(item.value), labelW - 8, theme.font), rect.x + rect.w - st.padding - 4, cy);
        }
        y += ih;
      }
    }

    // 子ノード（項目の下に縦に並ぶ。座標は Graph が計算済み）
    for (const child of graph.childrenOf(node)) this._drawNode(child, state, lod);

    // リサイズグリップ（選択中 / ホバー中のみ。子は親から幅をもらうので出さない）
    if ((selected || hover) && !graph.isChild(node)) {
      const g = Math.min(10, rect.w / 4, rect.h / 4);
      const x1 = rect.x + rect.w - 3;
      const y1 = rect.y + rect.h - 3;
      ctx.strokeStyle = selected ? st.selectedStroke : st.stroke;
      ctx.lineWidth = 1 / vp.zoom;
      ctx.beginPath();
      ctx.moveTo(x1 - g, y1);
      ctx.lineTo(x1, y1 - g);
      ctx.moveTo(x1 - g / 2, y1);
      ctx.lineTo(x1, y1 - g / 2);
      ctx.stroke();
    }

    // ポート
    const connected = new Set();
    for (const e of graph.edgesOf(node.id)) {
      if (e.source === node.id) connected.add(e.sourcePort);
      if (e.target === node.id) connected.add(e.targetPort);
    }
    // 描画は種類ごとにまとめて行う（フレーム末尾の _flushPorts）
    const batch = this._portBatch;
    for (const p of graph.nodePorts(node, { visibleOnly: true })) {
      const isHover = state.hoverPort && state.hoverPort.node === node.id && state.hoverPort.port === p.key;
      const isConnected = connected.has(p.key);
      // 上限のあるポートは満杯かどうかで色を変える
      let full = false;
      if (isConnected) {
        const cap = graph.portCapacity(node.id, p.key);
        full = !!cap && cap.full && Number.isFinite(cap.max);
      }
      const kind = isHover ? 'hover' : full ? 'full' : isConnected ? 'connected' : 'plain';
      batch[kind].push(p.x, p.y);
    }
  }

  /** ノード描画で集めたポートを、塗り色ごとに 1 パスで描く */
  _flushPorts() {
    const { ctx, theme } = this;
    const ps = theme.port;
    const b = this._portBatch;
    const styles = {
      plain: [ps.fill, ps.stroke],
      connected: [ps.connectedFill, ps.stroke],
      full: [ps.fullFill, ps.fullFill],
      hover: [ps.hoverFill, ps.hoverFill],
    };
    ctx.lineWidth = ps.strokeWidth;
    for (const kind of ['plain', 'connected', 'full', 'hover']) {
      const pts = b[kind];
      if (!pts.length) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        ctx.moveTo(pts[i] + ps.radius, pts[i + 1]);
        ctx.arc(pts[i], pts[i + 1], ps.radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = styles[kind][0];
      ctx.fill();
      ctx.strokeStyle = styles[kind][1];
      ctx.stroke();
      pts.length = 0;
    }
  }

  _api(selected, hover, style, lod = false) {
    return {
      selected,
      hover,
      style,
      lod,
      zoom: this.viewport.zoom,
      theme: this.theme,
      graph: this.graph,
      roundRect: (x, y, w, h, r) => this._roundRect(x, y, w, h, r),
      fitText: (text, w, font) => this._fit(text, w, font),
    };
  }

  _roundRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _roundRectTop(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** 幅に収まるように末尾を … で省略（結果はキャッシュ） */
  _fit(text, maxWidth, font) {
    if (!text) return '';
    const key = font + '|' + maxWidth + '|' + text;
    const cached = this._textCache.get(key);
    if (cached !== undefined) return cached;
    const { ctx } = this;
    ctx.font = font;
    let out = text;
    if (ctx.measureText(text).width > maxWidth) {
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
        else hi = mid - 1;
      }
      out = text.slice(0, lo) + '…';
    }
    if (this._textCache.size > 5000) this._textCache.clear();
    this._textCache.set(key, out);
    return out;
  }
}

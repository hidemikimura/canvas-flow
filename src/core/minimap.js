/**
 * ミニマップ。全ノードの配置と現在の表示範囲を小さな canvas に描く。
 * ノード部分はオフスクリーンにキャッシュし、グラフ変更時のみ（間引きして）再描画する。
 */
export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./editor.js').NodeEditor} editor
   */
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.editor = editor;
    this.width = 200;
    this.height = 140;
    this.dpr = 1;
    this.padding = 10;
    this._cache = document.createElement('canvas');
    this._cacheDirty = true;
    this._lastCacheAt = 0;
    this.cacheInterval = 120; // ms
    this._world = null; // ミニマップに映すワールド矩形
    this._dragging = false;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  resize(width, height, dpr = window.devicePixelRatio || 1) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this._cache.width = this.canvas.width;
    this._cache.height = this.canvas.height;
    this._cacheDirty = true;
  }

  invalidate() {
    this._cacheDirty = true;
  }

  /** 表示対象のワールド矩形（全ノード ∪ 現在の表示範囲） */
  _computeWorld() {
    const { graph, viewport } = this.editor;
    const vis = viewport.visibleRect();
    const b = graph.bounds() ?? vis;
    const x0 = Math.min(b.x, vis.x);
    const y0 = Math.min(b.y, vis.y);
    const x1 = Math.max(b.x + b.w, vis.x + vis.w);
    const y1 = Math.max(b.y + b.h, vis.y + vis.h);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  _transform(world) {
    const s = Math.min((this.width - this.padding * 2) / world.w, (this.height - this.padding * 2) / world.h);
    const ox = (this.width - world.w * s) / 2;
    const oy = (this.height - world.h * s) / 2;
    return { s, ox, oy };
  }

  toWorld(mx, my) {
    if (!this._world) return { x: 0, y: 0 };
    const { s, ox, oy } = this._transform(this._world);
    return { x: (mx - ox) / s + this._world.x, y: (my - oy) / s + this._world.y };
  }

  render() {
    const { ctx, dpr } = this;
    const { graph, viewport, theme, selection } = this.editor;
    const mm = theme.minimap;
    const world = this._computeWorld();
    // 表示範囲の移動で世界矩形が変わったらキャッシュも作り直す
    const prev = this._world;
    if (!prev || Math.abs(prev.x - world.x) > 1 || Math.abs(prev.y - world.y) > 1 || Math.abs(prev.w - world.w) > 1 || Math.abs(prev.h - world.h) > 1) {
      this._cacheDirty = true;
    }
    this._world = world;
    const { s, ox, oy } = this._transform(world);

    const now = performance.now();
    if (this._cacheDirty && now - this._lastCacheAt >= this.cacheInterval) {
      this._cacheDirty = false;
      this._lastCacheAt = now;
      const c = this._cache.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this._cache.width, this._cache.height);
      c.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox - world.x * s), dpr * (oy - world.y * s));
      c.fillStyle = mm.node;
      const minSize = 1 / (s * dpr); // 最低 1 デバイスピクセル
      for (const n of graph.nodes.values()) {
        if (selection.nodes.has(n.id)) continue;
        const r = graph.nodeRect(n);
        c.fillRect(r.x, r.y, Math.max(r.w, minSize), Math.max(r.h, minSize));
      }
      c.fillStyle = mm.selectedNode;
      for (const id of selection.nodes) {
        const n = graph.nodes.get(id);
        if (!n) continue;
        const r = graph.nodeRect(n);
        c.fillRect(r.x, r.y, Math.max(r.w, minSize), Math.max(r.h, minSize));
      }
    } else if (this._cacheDirty) {
      this.editor.requestRender(); // 次フレームで再試行
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = mm.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._cache, 0, 0);

    // 表示範囲
    const vis = viewport.visibleRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vx = ox + (vis.x - world.x) * s;
    const vy = oy + (vis.y - world.y) * s;
    ctx.fillStyle = mm.viewportFill;
    ctx.strokeStyle = mm.viewportStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(vx, vy, vis.w * s, vis.h * s);
    ctx.strokeRect(vx + 0.5, vy + 0.5, vis.w * s, vis.h * s);

    ctx.strokeStyle = mm.border;
    ctx.strokeRect(0.5, 0.5, this.width - 1, this.height - 1);
  }

  _local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onDown(e) {
    e.preventDefault();
    e.stopPropagation();
    this._dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this._local(e);
    const w = this.toWorld(p.x, p.y);
    this.editor.viewport.centerOn(w.x, w.y);
    this.editor.requestRender();
  }

  _onMove(e) {
    if (!this._dragging) return;
    const p = this._local(e);
    const w = this.toWorld(p.x, p.y);
    this.editor.viewport.centerOn(w.x, w.y);
    this.editor.requestRender();
  }

  _onUp(e) {
    if (!this._dragging) return;
    this._dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    this.editor.emit('viewport:change', this.editor.viewport.snapshot());
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointercancel', this._onUp);
  }
}

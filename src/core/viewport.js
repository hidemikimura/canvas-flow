/**
 * ビューポート（パン・ズーム）の状態。
 *
 * screen = world * zoom + (tx, ty)
 * 座標に上限は無いので、無限スクロールが可能。
 */
export class Viewport {
  constructor({ minZoom = 0.05, maxZoom = 4 } = {}) {
    this.tx = 0;
    this.ty = 0;
    this.zoom = 1;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    /** 表示領域（CSS ピクセル） */
    this.width = 0;
    this.height = 0;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
  }

  toWorld(sx, sy) {
    return { x: (sx - this.tx) / this.zoom, y: (sy - this.ty) / this.zoom };
  }

  toScreen(wx, wy) {
    return { x: wx * this.zoom + this.tx, y: wy * this.zoom + this.ty };
  }

  /** 現在見えているワールド座標の矩形 */
  visibleRect(margin = 0) {
    const tl = this.toWorld(-margin, -margin);
    const br = this.toWorld(this.width + margin, this.height + margin);
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  }

  panBy(dx, dy) {
    this.tx += dx;
    this.ty += dy;
  }

  clampZoom(z) {
    return Math.min(this.maxZoom, Math.max(this.minZoom, z));
  }

  /** スクリーン上の点 (sx, sy) を固定したままズーム倍率を変更する */
  zoomAt(sx, sy, factor) {
    const next = this.clampZoom(this.zoom * factor);
    this.setZoomAt(sx, sy, next);
  }

  setZoomAt(sx, sy, nextZoom) {
    const next = this.clampZoom(nextZoom);
    const before = this.toWorld(sx, sy);
    this.zoom = next;
    const after = this.toScreen(before.x, before.y);
    this.tx += sx - after.x;
    this.ty += sy - after.y;
  }

  /** ワールド座標 (wx, wy) が画面中央に来るように移動する */
  centerOn(wx, wy, zoom = this.zoom) {
    this.zoom = this.clampZoom(zoom);
    this.tx = this.width / 2 - wx * this.zoom;
    this.ty = this.height / 2 - wy * this.zoom;
  }

  /** ズーム 1・原点を左上に戻す */
  reset() {
    this.zoom = 1;
    this.tx = 0;
    this.ty = 0;
  }

  /** 矩形全体が収まるようにズーム・位置を合わせる */
  fitRect(rect, padding = 40) {
    if (!rect || rect.w <= 0 || rect.h <= 0 || this.width <= 0) return;
    const z = Math.min(
      (this.width - padding * 2) / rect.w,
      (this.height - padding * 2) / rect.h,
    );
    this.centerOn(rect.x + rect.w / 2, rect.y + rect.h / 2, z);
  }

  /** 状態の複製（アニメーション用） */
  snapshot() {
    return { tx: this.tx, ty: this.ty, zoom: this.zoom };
  }

  restore(s) {
    this.tx = s.tx;
    this.ty = s.ty;
    this.zoom = s.zoom;
  }
}

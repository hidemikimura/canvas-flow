/**
 * 均一グリッドによる空間インデックス。
 * 10000 個以上の要素でも、表示範囲内の要素だけを O(可視セル数) で取り出せる。
 *
 * 要素は矩形 {x, y, w, h} で登録する。
 */
export class SpatialIndex {
  /**
   * @param {number} cellSize セルの一辺（ワールド座標）。ノードの平均サイズの 2〜4 倍程度が目安。
   */
  constructor(cellSize = 512) {
    this.cellSize = cellSize;
    /** @type {Map<string, Set<string>>} セルキー → id 集合 */
    this._cells = new Map();
    /** @type {Map<string, {x:number,y:number,w:number,h:number}>} id → 登録時の矩形 */
    this._rects = new Map();
  }

  get size() {
    return this._rects.size;
  }

  _cellRange(r) {
    const s = this.cellSize;
    return {
      x0: Math.floor(r.x / s),
      y0: Math.floor(r.y / s),
      x1: Math.floor((r.x + r.w) / s),
      y1: Math.floor((r.y + r.h) / s),
    };
  }

  _forEachCell(r, fn) {
    const { x0, y0, x1, y1 } = this._cellRange(r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) fn(cx + ',' + cy);
    }
  }

  insert(id, rect) {
    if (this._rects.has(id)) this.remove(id);
    const stored = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    this._rects.set(id, stored);
    this._forEachCell(stored, (key) => {
      let set = this._cells.get(key);
      if (!set) {
        set = new Set();
        this._cells.set(key, set);
      }
      set.add(id);
    });
  }

  remove(id) {
    const rect = this._rects.get(id);
    if (!rect) return;
    this._forEachCell(rect, (key) => {
      const set = this._cells.get(key);
      if (!set) return;
      set.delete(id);
      if (set.size === 0) this._cells.delete(key);
    });
    this._rects.delete(id);
  }

  /** 矩形が変わった要素を再登録する。セルが変わらない場合は矩形だけ更新して高速化。 */
  update(id, rect) {
    const prev = this._rects.get(id);
    if (!prev) return this.insert(id, rect);
    const a = this._cellRange(prev);
    const b = this._cellRange(rect);
    if (a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1) {
      prev.x = rect.x;
      prev.y = rect.y;
      prev.w = rect.w;
      prev.h = rect.h;
      return;
    }
    this.remove(id);
    this.insert(id, rect);
  }

  getRect(id) {
    return this._rects.get(id);
  }

  /**
   * 矩形と交差する要素 id を返す（重複なし）。
   * @returns {string[]}
   */
  query(rect) {
    const out = [];
    const seen = new Set();
    this._forEachCell(rect, (key) => {
      const set = this._cells.get(key);
      if (!set) return;
      for (const id of set) {
        if (seen.has(id)) continue;
        seen.add(id);
        const r = this._rects.get(id);
        if (
          r.x < rect.x + rect.w &&
          r.x + r.w > rect.x &&
          r.y < rect.y + rect.h &&
          r.y + r.h > rect.y
        ) {
          out.push(id);
        }
      }
    });
    return out;
  }

  /** 点を含む要素 id を返す。 */
  queryPoint(x, y) {
    return this.query({ x, y, w: 0, h: 0 });
  }

  clear() {
    this._cells.clear();
    this._rects.clear();
  }
}

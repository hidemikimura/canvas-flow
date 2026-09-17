/**
 * 最小限のイベントエミッタ。
 * コアはフレームワークに依存しないため、DOM の EventTarget は使わない。
 */
export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * @param {string} type
   * @param {(payload:any)=>void} fn
   * @returns {() => void} 解除関数
   */
  on(type, fn) {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}

/**
 * Node 環境（vitest の environment: 'node'）で NodeEditor を動かすための最小スタブ。
 * 描画そのものは検証できないが、選択・強調表示・編集コマンドなど
 * canvas の中身に依存しないロジックはこれでテストできる。
 */
const noop = () => {};

const ctx = new Proxy(
  {},
  {
    get(target, key) {
      if (key === 'canvas') return null;
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop: noop });
      }
      if (typeof key !== 'string') return undefined;
      return (target[key] ??= noop);
    },
    set: () => true,
  },
);

export function makeCanvas({ width = 800, height = 600 } = {}) {
  const listeners = new Map();
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    getContext: () => ctx,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height }),
    hasAttribute: () => true,
    setAttribute: noop,
    dispatchEvent: () => true,
    /** テストからイベントを流し込みたいとき用 */
    _emit: (type, event) => listeners.get(type)?.(event),
  };
}

/** document / window / rAF を用意する（すでにあれば何もしない） */
export function installDom() {
  globalThis.document ??= {
    addEventListener: noop,
    removeEventListener: noop,
    createElement: () => ({ style: {}, addEventListener: noop, remove: noop, click: noop }),
    body: { appendChild: noop },
  };
  globalThis.window ??= { devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop };
  globalThis.requestAnimationFrame ??= (fn) => setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
}

import { Emitter } from './emitter.js';

/**
 * Undo / Redo 履歴。
 * Graph が発火する 'op'（取り消し可能な操作記録）を購読し、トランザクション単位でまとめる。
 *
 *  - Graph.batch() の間、または begin()/end() の間の操作は 1 つの履歴項目になる
 *  - 連続した同種の操作（同じノード群の移動、同じノードの更新）は 1 つに併合する
 *  - load() / clear() で履歴は破棄される
 *
 * 発火イベント: 'change' { canUndo, canRedo }
 */
export class History extends Emitter {
  /**
   * @param {import('./graph.js').Graph} graph
   * @param {{limit?:number}} [options]
   */
  constructor(graph, { limit = 200 } = {}) {
    super();
    this.graph = graph;
    this.limit = limit;
    /** @type {Array<{label?:string, ops:object[]}>} */
    this.undoStack = [];
    this.redoStack = [];
    this._current = null; // 収集中のトランザクション
    this._depth = 0;
    this._applying = false;

    this._onOp = (op) => this._record(op);
    this._onLoad = () => this.clear();
    this._onClear = () => {
      if (!this._applying) this.clear();
    };
    graph.on('op', this._onOp);
    graph.on('load', this._onLoad);
    graph.on('clear', this._onClear);

    // Graph.batch とトランザクションを連動させる
    const origBatch = graph.batch.bind(graph);
    graph.batch = (fn) => {
      this.begin();
      try {
        return origBatch(fn);
      } finally {
        this.end();
      }
    };
    this._origBatch = origBatch;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** トランザクション開始（ネスト可）。ドラッグ中の連続移動をまとめるために使う */
  begin(label) {
    if (this._applying) return;
    if (this._depth === 0) this._current = { label, ops: [] };
    else if (label && this._current && !this._current.label) this._current.label = label;
    this._depth++;
  }

  end() {
    if (this._applying) return;
    if (this._depth === 0) return;
    this._depth--;
    if (this._depth === 0) {
      const tx = this._current;
      this._current = null;
      if (tx && tx.ops.length) this._push(tx);
    }
  }

  _record(op) {
    if (this._applying) return;
    if (this._depth > 0) {
      this._appendMerged(this._current.ops, op);
      return;
    }
    // トランザクション外の単発操作はそのまま 1 項目にする
    this._push({ ops: [op] });
  }

  _appendMerged(ops, op) {
    const last = ops[ops.length - 1];
    if (last && mergeKey(last) && mergeKey(last) === mergeKey(op) && mergeInto(last, op)) return;
    ops.push(op);
  }

  _push(tx) {
    // 差分の無い更新は捨てる
    tx.ops = tx.ops.filter((op) => !(op.type === 'node:update' || op.type === 'edge:update') || !deepEqual(op.before, op.after));
    if (!tx.ops.length) return;
    this.undoStack.push(tx);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this._emitChange();
  }

  undo() {
    const tx = this.undoStack.pop();
    if (!tx) return false;
    this._apply(tx.ops.slice().reverse(), true);
    this.redoStack.push(tx);
    this._emitChange();
    return true;
  }

  redo() {
    const tx = this.redoStack.pop();
    if (!tx) return false;
    this._apply(tx.ops, false);
    this.undoStack.push(tx);
    this._emitChange();
    return true;
  }

  _apply(ops, inverse) {
    const g = this.graph;
    this._applying = true;
    const prevSilent = g.silentOps;
    g.silentOps = true;
    try {
      this._origBatch(() => {
        for (const op of ops) this._applyOne(op, inverse);
      });
    } finally {
      g.silentOps = prevSilent;
      this._applying = false;
    }
  }

  _applyOne(op, inverse) {
    const g = this.graph;
    switch (op.type) {
      case 'node:add':
        if (inverse) g.removeNode(op.node.id);
        else g.restoreNode(op.node);
        break;
      case 'node:remove':
        if (inverse) g.restoreNode(op.node);
        else g.removeNode(op.node.id);
        break;
      case 'node:update':
        g.restoreNode(inverse ? op.before : op.after);
        break;
      case 'nodes:move':
        g.moveNodes(op.ids, inverse ? -op.dx : op.dx, inverse ? -op.dy : op.dy);
        break;
      case 'node:parent': {
        const state = inverse ? op.before : op.after;
        g.setParent(op.id, state.parent ?? null, state.index ?? undefined);
        if (!state.parent && (state.x != null || state.y != null)) {
          const patch = { x: state.x, y: state.y };
          if (state.width != null) patch.width = state.width;
          g.updateNode(op.id, patch);
        }
        break;
      }
      case 'edge:add':
        if (inverse) g.removeEdge(op.edge.id);
        else g.restoreEdge(op.edge);
        break;
      case 'edge:remove':
        if (inverse) g.restoreEdge(op.edge);
        else g.removeEdge(op.edge.id);
        break;
      case 'edge:update':
        g.restoreEdgeState(inverse ? op.before : op.after);
        break;
    }
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this._current = this._depth > 0 ? { ops: [] } : null;
    this._emitChange();
  }

  _emitChange() {
    this.emit('change', { canUndo: this.canUndo, canRedo: this.canRedo });
  }

  destroy() {
    this.graph.off('op', this._onOp);
    this.graph.off('load', this._onLoad);
    this.graph.off('clear', this._onClear);
    this.graph.batch = this._origBatch;
  }
}

/** 併合可能な操作の同一性キー */
function mergeKey(op) {
  if (op.type === 'nodes:move') return 'move:' + [...op.ids].sort().join(',');
  if (op.type === 'node:update') return 'node:' + op.id;
  if (op.type === 'edge:update') return 'edge:' + op.id;
  return null;
}

/** prev に next を取り込む。成功したら true */
function mergeInto(prev, next) {
  if (prev.type !== next.type) return false;
  if (prev.type === 'nodes:move') {
    prev.dx += next.dx;
    prev.dy += next.dy;
    return true;
  }
  if (prev.type === 'node:update' || prev.type === 'edge:update') {
    prev.after = next.after;
    return true;
  }
  return false;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

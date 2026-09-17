import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph.js';
import { History } from '../src/core/history.js';

function setup() {
  const g = new Graph();
  const h = new History(g);
  g.addNode({ id: 'a', title: 'A', x: 0, y: 0, output: true, items: [{ id: 'i', label: 'x', output: true }] });
  g.addNode({ id: 'b', title: 'B', x: 400, y: 0, input: true, items: [{ id: 'j', label: 'y', input: true }] });
  g.addEdge({ id: 'e1', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
  h.clear();
  return { g, h };
}

describe('History', () => {
  it('ノード追加を取り消し・やり直しできる', () => {
    const { g, h } = setup();
    g.addNode({ id: 'c', title: 'C' });
    expect(h.canUndo).toBe(true);
    h.undo();
    expect(g.nodes.has('c')).toBe(false);
    expect(h.canRedo).toBe(true);
    h.redo();
    expect(g.nodes.has('c')).toBe(true);
    expect(g.getNode('c').title).toBe('C');
  });

  it('ノード削除の取り消しで接続エッジも復元される', () => {
    const { g, h } = setup();
    g.addEdge({ id: 'e2', source: 'a', sourcePort: 'item:i:out', target: 'b', targetPort: 'item:j:in' });
    h.clear();
    g.removeNode('a');
    expect(g.edges.size).toBe(0);
    expect(h.undoStack.length).toBe(1); // 1 トランザクション
    h.undo();
    expect(g.nodes.has('a')).toBe(true);
    expect([...g.edges.keys()].sort()).toEqual(['e1', 'e2']);
    expect(g.edgesInRect({ x: 0, y: -50, w: 500, h: 200 }).length).toBe(2); // インデックスも復元
    h.redo();
    expect(g.nodes.has('a')).toBe(false);
    expect(g.edges.size).toBe(0);
  });

  it('プロパティ更新（タイトル・項目・幅）を戻せる', () => {
    const { g, h } = setup();
    g.updateNode('a', { title: 'A2', width: 300 });
    g.updateItem('a', 'i', { label: 'x2' });
    expect(h.undoStack.length).toBe(2);
    h.undo();
    expect(g.getNode('a').items[0].label).toBe('x');
    expect(g.getNode('a').title).toBe('A2');
    h.undo();
    expect(g.getNode('a').title).toBe('A');
    expect(g.getNode('a').width).toBeUndefined();
    expect(g.nodeIndex.getRect('a').w).toBe(200);
    h.redo();
    expect(g.nodeIndex.getRect('a').w).toBe(300);
  });

  it('begin/end の間の連続移動は 1 つの履歴になり、合計で戻る', () => {
    const { g, h } = setup();
    h.begin('move');
    g.moveNodes(['a'], 10, 0);
    g.moveNodes(['a'], 10, 5);
    g.moveNodes(['a'], 10, 5);
    h.end();
    expect(h.undoStack.length).toBe(1);
    expect(h.undoStack[0].ops.length).toBe(1);
    h.undo();
    expect(g.getNode('a').x).toBe(0);
    expect(g.getNode('a').y).toBe(0);
    h.redo();
    expect(g.getNode('a').x).toBe(30);
    expect(g.getNode('a').y).toBe(10);
  });

  it('batch 内の複製 → 削除 → undo × 2 で元に戻る', () => {
    const { g, h } = setup();
    const r = g.duplicateNodes(['a', 'b'], { x: 10, y: 10 });
    expect(g.nodes.size).toBe(4);
    expect(g.edges.size).toBe(2);
    g.removeNodes(r.nodes.map((n) => n.id));
    expect(g.nodes.size).toBe(2);
    h.undo();
    expect(g.nodes.size).toBe(4);
    expect(g.edges.size).toBe(2);
    h.undo();
    expect(g.nodes.size).toBe(2);
    expect(g.edges.size).toBe(1);
    expect(h.canUndo).toBe(false);
  });

  it('差分の無い更新は履歴に入らない', () => {
    const { g, h } = setup();
    g.updateNode('a', { title: 'A' });
    expect(h.canUndo).toBe(false);
  });

  it('新しい操作で redo スタックは消える', () => {
    const { g, h } = setup();
    g.addNode({ id: 'c' });
    h.undo();
    expect(h.canRedo).toBe(true);
    g.addNode({ id: 'd' });
    expect(h.canRedo).toBe(false);
  });

  it('load で履歴が破棄され、上限を超えると古い項目が消える', () => {
    const { g, h } = setup();
    h.limit = 3;
    for (let i = 0; i < 5; i++) g.addNode({ id: 'n' + i });
    expect(h.undoStack.length).toBe(3);
    g.load({ nodes: [{ id: 'z' }], edges: [] });
    expect(h.canUndo).toBe(false);
    expect(g.nodes.size).toBe(1);
  });
});

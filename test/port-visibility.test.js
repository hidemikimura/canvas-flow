import { describe, it, expect } from 'vitest';
import { Graph, withPortVisible } from '../src/core/graph.js';
import { History } from '../src/core/history.js';
import { parse, serialize } from '../src/core/serializer.js';

function g() {
  const graph = new Graph();
  graph.addNode({ id: 'a', x: 0, y: 0, input: true, output: { max: 2, visible: false }, items: [{ id: 'i', label: 'x', input: 1, output: true }] });
  graph.addNode({ id: 'b', x: 400, y: 0, input: true, items: [{ id: 'j', label: 'y', input: true, showPorts: false }] });
  graph.addNode({ id: 'c', x: 800, y: 0, input: true, output: true, showPorts: false });
  return graph;
}

describe('ポートの表示 / 非表示', () => {
  it('withPortVisible は true / 数値 / オブジェクトを扱い、表示に戻すと元の形に近づける', () => {
    expect(withPortVisible(true, false)).toEqual({ visible: false });
    expect(withPortVisible(3, false)).toEqual({ max: 3, visible: false });
    expect(withPortVisible({ max: 2 }, false)).toEqual({ max: 2, visible: false });
    expect(withPortVisible({ visible: false }, true)).toBe(true);
    expect(withPortVisible({ max: 2, visible: false }, true)).toEqual({ max: 2 });
    expect(withPortVisible(false, false)).toBe(false);
  });

  it('visible: false / showPorts: false のポートは nodePorts(visibleOnly) に出ないが、存在はする', () => {
    const graph = g();
    const all = graph.nodePorts(graph.getNode('a')).map((p) => [p.key, p.visible]);
    expect(all).toEqual([
      ['in', true],
      ['out', false],
      ['item:i:in', true],
      ['item:i:out', true],
    ]);
    expect(graph.nodePorts(graph.getNode('a'), { visibleOnly: true }).map((p) => p.key)).toEqual(['in', 'item:i:in', 'item:i:out']);
    // 項目の showPorts
    expect(graph.nodePorts(graph.getNode('b'), { visibleOnly: true }).map((p) => p.key)).toEqual(['in']);
    expect(graph.portVisible('b', 'item:j:in')).toBe(false);
    // ノードの showPorts で全部隠れる
    expect(graph.nodePorts(graph.getNode('c'), { visibleOnly: true })).toEqual([]);
    expect(graph.portVisible('c', 'in')).toBe(false);
    // 存在はするので位置・接続は有効
    expect(graph.portPosition('a', 'out')).not.toBeNull();
    expect(graph.addEdge({ source: 'a', sourcePort: 'out', target: 'c', targetPort: 'in' })).not.toBeNull();
    expect(graph.portCapacity('a', 'out')).toEqual({ count: 1, max: 2, full: false });
  });

  it('setPortVisible / setPortsVisible は Undo で戻る', () => {
    const graph = g();
    const h = new History(graph);
    expect(graph.portVisible('a', 'item:i:in')).toBe(true);
    expect(graph.setPortVisible('a', 'item:i:in', false)).toBe(true);
    expect(graph.portVisible('a', 'item:i:in')).toBe(false);
    expect(graph.getNode('a').items[0].input).toEqual({ max: 1, visible: false });
    expect(graph.setPortVisible('a', 'out', true)).toBe(true);
    expect(graph.getNode('a').output).toEqual({ max: 2 });
    expect(graph.setPortVisible('a', 'nope', true)).toBe(false);
    expect(graph.setPortVisible('b', 'out', false)).toBe(false); // ポート無し
    expect(h.undoStack.length).toBe(2);
    h.undo();
    expect(graph.portVisible('a', 'out')).toBe(false);
    h.undo();
    expect(graph.portVisible('a', 'item:i:in')).toBe(true);

    graph.setPortsVisible('c', true);
    expect(graph.portVisible('c', 'in')).toBe(true);
    expect('showPorts' in graph.getNode('c')).toBe(false);
    graph.setPortsVisible('b', true, 'j');
    expect(graph.portVisible('b', 'item:j:in')).toBe(true);
    graph.setPortsVisible('a', false, 'i');
    expect(graph.portVisible('a', 'item:i:out')).toBe(false);
    h.undo();
    expect(graph.portVisible('a', 'item:i:out')).toBe(true);
  });

  it('JSON に visible / showPorts が保存・復元される', () => {
    const graph = g();
    const json = JSON.stringify(serialize(graph));
    const r = parse(json);
    expect(r.ok).toBe(true);
    const g2 = new Graph();
    g2.load(r.data);
    expect(g2.portVisible('a', 'out')).toBe(false);
    expect(g2.portVisible('b', 'item:j:in')).toBe(false);
    expect(g2.portVisible('c', 'in')).toBe(false);
    expect(g2.portVisible('a', 'in')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { Graph, normalizePortSpec } from '../src/core/graph.js';
import { History } from '../src/core/history.js';
import { parse } from '../src/core/serializer.js';

function graph(rules) {
  const g = new Graph({ rules });
  // src: ヘッダ out 上限 2、項目 o1 上限 1、o2 無制限
  g.addNode({ id: 'src', x: 0, y: 0, output: 2, items: [{ id: 'o1', label: 'a', output: { max: 1 } }, { id: 'o2', label: 'b', output: true }] });
  // dst1: ヘッダ in 上限 1、項目 i1 上限 2
  g.addNode({ id: 'dst1', x: 400, y: 0, input: { max: 1 }, items: [{ id: 'i1', label: 'x', input: 2 }] });
  g.addNode({ id: 'dst2', x: 400, y: 300, input: true, items: [{ id: 'i1', label: 'x', input: true }] });
  g.addNode({ id: 'dst3', x: 400, y: 600, input: true });
  return g;
}

describe('normalizePortSpec', () => {
  it('true / 数値 / {max} / false を解釈する', () => {
    expect(normalizePortSpec(undefined)).toBeNull();
    expect(normalizePortSpec(false)).toBeNull();
    expect(normalizePortSpec(0)).toBeNull();
    expect(normalizePortSpec(true)).toEqual({ max: Infinity, visible: true });
    expect(normalizePortSpec(true, 3)).toEqual({ max: 3, visible: true });
    expect(normalizePortSpec(2)).toEqual({ max: 2, visible: true });
    expect(normalizePortSpec({ max: 4 })).toEqual({ max: 4, visible: true });
    expect(normalizePortSpec({ max: 4, visible: false })).toEqual({ max: 4, visible: false });
    expect(normalizePortSpec({}, 5)).toEqual({ max: 5, visible: true });
  });
});

describe('ポートごとの接続数上限', () => {
  it('出力側の上限（開始できるコネクタ数）を超えると接続できない', () => {
    const g = graph();
    expect(g.addEdge({ source: 'src', sourcePort: 'out', target: 'dst1', targetPort: 'in' })).not.toBeNull();
    expect(g.addEdge({ source: 'src', sourcePort: 'out', target: 'dst2', targetPort: 'in' })).not.toBeNull();
    expect(g.portCapacity('src', 'out')).toEqual({ count: 2, max: 2, full: true });
    expect(g.connectError('src', 'out', 'dst3', 'in')).toBe('source-full');
    expect(g.addEdge({ source: 'src', sourcePort: 'out', target: 'dst3', targetPort: 'in' })).toBeNull();
    // 項目ポート（上限 1）
    expect(g.addEdge({ source: 'src', sourcePort: 'item:o1:out', target: 'dst2', targetPort: 'item:i1:in' })).not.toBeNull();
    expect(g.connectError('src', 'item:o1:out', 'dst1', 'item:i1:in')).toBe('source-full');
    // 無制限の項目ポート
    for (const t of ['dst1', 'dst2']) expect(g.addEdge({ source: 'src', sourcePort: 'item:o2:out', target: t, targetPort: 'item:i1:in' })).not.toBeNull();
    expect(g.portCapacity('src', 'item:o2:out').full).toBe(false);
  });

  it('入力側の上限（終了できるコネクタ数）を超えると接続できない', () => {
    const g = graph();
    g.addNode({ id: 'src2', x: 0, y: 300, output: true });
    expect(g.addEdge({ source: 'src', sourcePort: 'out', target: 'dst1', targetPort: 'in' })).not.toBeNull();
    expect(g.connectError('src2', 'out', 'dst1', 'in')).toBe('target-full');
    // 項目 in 上限 2
    expect(g.addEdge({ source: 'src', sourcePort: 'item:o2:out', target: 'dst1', targetPort: 'item:i1:in' })).not.toBeNull();
    expect(g.addEdge({ source: 'src2', sourcePort: 'out', target: 'dst1', targetPort: 'item:i1:in' })).not.toBeNull();
    expect(g.portCapacity('dst1', 'item:i1:in')).toEqual({ count: 2, max: 2, full: true });
    g.addNode({ id: 'src3', x: 0, y: 600, output: true });
    expect(g.canConnect('src3', 'out', 'dst1', 'item:i1:in')).toBe(false);
  });

  it('コネクタを削除すると空きができる', () => {
    const g = graph();
    const e = g.addEdge({ source: 'src', sourcePort: 'out', target: 'dst1', targetPort: 'in' });
    g.addNode({ id: 'src2', x: 0, y: 300, output: true });
    expect(g.canConnect('src2', 'out', 'dst1', 'in')).toBe(false);
    g.removeEdge(e.id);
    expect(g.canConnect('src2', 'out', 'dst1', 'in')).toBe(true);
  });

  it('rules の既定上限は、ポート側で指定しないときだけ効く', () => {
    const g = graph({ maxInputs: 1, maxOutputs: 1 });
    // src の項目 o2 は true → 既定上限 1
    expect(g.portSpec('src', 'item:o2:out')).toMatchObject({ max: 1 });
    // dst1 の項目 i1 は 2 を明示 → そのまま
    expect(g.portSpec('dst1', 'item:i1:in')).toMatchObject({ max: 2 });
    g.addEdge({ source: 'src', sourcePort: 'item:o2:out', target: 'dst2', targetPort: 'in' });
    expect(g.connectError('src', 'item:o2:out', 'dst3', 'in')).toBe('source-full');
  });

  it("onFull: 'replace' なら古いコネクタを外して付け替え、1 回の Undo で戻る", () => {
    const g = graph({ onFull: 'replace' });
    const h = new History(g);
    const old = g.addEdge({ source: 'src', sourcePort: 'out', target: 'dst1', targetPort: 'in' });
    g.addNode({ id: 'src2', x: 0, y: 300, output: true });
    h.clear();
    expect(g.canConnect('src2', 'out', 'dst1', 'in')).toBe(false); // 既定は拒否
    expect(g.canConnect('src2', 'out', 'dst1', 'in', { replace: true })).toBe(true);
    const fresh = g.connect('src2', 'out', 'dst1', 'in');
    expect(fresh).not.toBeNull();
    expect(g.edges.has(old.id)).toBe(false);
    expect(g.portCapacity('dst1', 'in').count).toBe(1);
    expect(h.undoStack.length).toBe(1);
    h.undo();
    expect(g.edges.has(old.id)).toBe(true);
    expect(g.edges.has(fresh.id)).toBe(false);
  });

  it("onFull: 'reject'（既定）の connect は null を返す", () => {
    const g = graph();
    g.addEdge({ source: 'src', sourcePort: 'out', target: 'dst1', targetPort: 'in' });
    g.addNode({ id: 'src2', x: 0, y: 300, output: true });
    expect(g.connect('src2', 'out', 'dst1', 'in')).toBeNull();
    expect(g.connect('src2', 'out', 'dst1', 'in', { replace: true })).not.toBeNull();
  });

  it('JSON の読み込みで上限付きポートの定義がそのまま残る', () => {
    const r = parse({
      nodes: [
        { id: 'a', output: 2, items: [{ id: 'p', label: 'p', output: { max: 1 } }] },
        { id: 'b', input: { max: 1 } },
      ],
      edges: [{ source: 'a', sourcePort: 'item:p:out', target: 'b', targetPort: 'in' }],
    });
    expect(r.ok).toBe(true);
    expect(r.data.edges.length).toBe(1);
    const g = new Graph();
    g.load(r.data);
    expect(g.portSpec('a', 'out')).toMatchObject({ max: 2 });
    expect(g.portSpec('a', 'item:p:out')).toMatchObject({ max: 1 });
    expect(g.portCapacity('b', 'in')).toEqual({ count: 1, max: 1, full: true });
  });
});

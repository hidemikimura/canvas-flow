import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph.js';
import { layeredLayout } from '../src/core/layout.js';

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 直線近似でエッジが（両端以外の）ノード矩形を横切るか */
function edgeCrossesNode(g, e) {
  const geo = g.edgeGeometry(e);
  for (const n of g.nodes.values()) {
    if (n.id === e.source || n.id === e.target) continue;
    const r = g.nodeRect(n);
    for (let i = 0; i <= 40; i++) {
      const p = g.edgePoint(e, i / 40);
      if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return true;
    }
    void geo;
  }
  return false;
}

function apply(g, pos) {
  for (const [id, p] of pos) g.updateNode(id, { x: p.x, y: p.y });
}

describe('layeredLayout', () => {
  it('コネクタの向きに沿って左から右へ層が並び、ノードが重ならない', () => {
    const g = new Graph();
    // ばらばらな位置に置く
    g.addNode({ id: 'a', x: 500, y: 300, output: true });
    g.addNode({ id: 'b', x: 0, y: 0, input: true, output: true });
    g.addNode({ id: 'c', x: 100, y: 500, input: true, output: true });
    g.addNode({ id: 'd', x: 50, y: 50, input: true });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'c', targetPort: 'in' });
    g.addEdge({ source: 'b', sourcePort: 'out', target: 'd', targetPort: 'in' });
    g.addEdge({ source: 'c', sourcePort: 'out', target: 'd', targetPort: 'in' });
    const pos = layeredLayout(g, g.nodes.keys());
    apply(g, pos);
    const n = (id) => g.getNode(id);
    expect(n('a').x).toBeLessThan(n('b').x);
    expect(n('b').x).toBe(n('c').x);
    expect(n('b').x).toBeLessThan(n('d').x);
    // 元の左上（0,0）が基準
    expect(Math.min(...[...g.nodes.values()].map((v) => v.x))).toBe(0);
    expect(Math.min(...[...g.nodes.values()].map((v) => v.y))).toBe(0);
    const rects = [...g.nodes.values()].map((v) => g.nodeRect(v));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
  });

  it('層をまたぐコネクタは途中の層のノードを横切らない（ダミーノード）', () => {
    const g = new Graph();
    g.addNode({ id: 'a', x: 0, y: 0, output: true });
    g.addNode({ id: 'b', x: 0, y: 0, input: true, output: true });
    g.addNode({ id: 'c', x: 0, y: 0, input: true, output: true });
    g.addNode({ id: 'd', x: 0, y: 0, input: true, output: true });
    g.addNode({ id: 'e', x: 0, y: 0, input: true });
    // a → b → c → d → e の鎖と、a → e の長いコネクタ
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.addEdge({ source: 'b', sourcePort: 'out', target: 'c', targetPort: 'in' });
    g.addEdge({ source: 'c', sourcePort: 'out', target: 'd', targetPort: 'in' });
    g.addEdge({ source: 'd', sourcePort: 'out', target: 'e', targetPort: 'in' });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'e', targetPort: 'in' });
    apply(g, layeredLayout(g, g.nodes.keys()));
    for (const e of g.edges.values()) expect(edgeCrossesNode(g, e)).toBe(false);
  });

  it('サイクルがあっても終了し、全ノードに位置が付く', () => {
    const g = new Graph();
    for (const id of ['a', 'b', 'c']) g.addNode({ id, x: 0, y: 0, input: true, output: true });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.addEdge({ source: 'b', sourcePort: 'out', target: 'c', targetPort: 'in' });
    g.addEdge({ source: 'c', sourcePort: 'out', target: 'a', targetPort: 'in' });
    const pos = layeredLayout(g, g.nodes.keys());
    expect(pos.size).toBe(3);
    const xs = new Set([...pos.values()].map((p) => p.x));
    expect(xs.size).toBe(3); // 3 層に分かれる
  });

  it('連結成分は縦に積まれ、孤立ノードは最後にグリッド配置される', () => {
    const g = new Graph();
    g.addNode({ id: 'a', x: 0, y: 0, output: true });
    g.addNode({ id: 'b', x: 0, y: 0, input: true });
    g.addNode({ id: 'c', x: 0, y: 0, output: true });
    g.addNode({ id: 'd', x: 0, y: 0, input: true });
    g.addNode({ id: 'x', x: 0, y: 0 });
    g.addNode({ id: 'y', x: 0, y: 0 });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.addEdge({ source: 'c', sourcePort: 'out', target: 'd', targetPort: 'in' });
    apply(g, layeredLayout(g, g.nodes.keys(), { componentGap: 100 }));
    const n = (id) => g.getNode(id);
    expect(n('a').x).toBe(n('c').x);
    expect(Math.abs(n('a').y - n('c').y)).toBeGreaterThanOrEqual(100);
    // 孤立ノードは一番下
    const compBottom = Math.max(...['a', 'b', 'c', 'd'].map((id) => n(id).y + g.nodeHeight(n(id))));
    expect(n('x').y).toBeGreaterThanOrEqual(compBottom);
    expect(n('y').y).toBe(n('x').y);
    expect(n('y').x).toBeGreaterThan(n('x').x);
    const rects = [...g.nodes.values()].map((v) => g.nodeRect(v));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
  });

  it('対象ノードを絞ると、その外側のノードは動かず、外へのコネクタは無視される', () => {
    const g = new Graph();
    g.addNode({ id: 'a', x: 100, y: 100, output: true });
    g.addNode({ id: 'b', x: 900, y: 900, input: true, output: true });
    g.addNode({ id: 'z', x: 5000, y: 5000, input: true });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.addEdge({ source: 'b', sourcePort: 'out', target: 'z', targetPort: 'in' });
    const pos = layeredLayout(g, ['a', 'b']);
    expect(pos.has('z')).toBe(false);
    expect(pos.get('a')).toEqual({ x: 100, y: 100 }); // 元の左上が基準
    expect(pos.get('b').x).toBeGreaterThan(100);
  });

  it('1000 ノードでも高速', () => {
    const g = new Graph();
    const cols = 40;
    for (let i = 0; i < 1000; i++) g.addNode({ id: 'n' + i, x: (i % cols) * 280, y: Math.floor(i / cols) * 160, input: true, output: true });
    for (let i = 1; i < 1000; i++) {
      if (i % cols) g.addEdge({ source: 'n' + (i - 1), sourcePort: 'out', target: 'n' + i, targetPort: 'in' });
      if (i >= cols && i % 3 === 0) g.addEdge({ source: 'n' + (i - cols), sourcePort: 'out', target: 'n' + i, targetPort: 'in' });
    }
    const t0 = performance.now();
    const pos = layeredLayout(g, g.nodes.keys());
    const ms = performance.now() - t0;
    expect(pos.size).toBe(1000);
    expect(ms).toBeLessThan(2000);
  });
});

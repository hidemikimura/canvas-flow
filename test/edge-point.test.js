import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph.js';

describe('Graph.edgePoint', () => {
  it('中点は両端の中間にあり、端点は t=0/1 で一致する', () => {
    const g = new Graph();
    g.addNode({ id: 'a', x: 0, y: 0, output: true });
    g.addNode({ id: 'b', x: 400, y: 200, input: true });
    const e = g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    const geo = g.edgeGeometry(e);
    const p0 = g.edgePoint(e, 0);
    const p1 = g.edgePoint(e, 1);
    const mid = g.edgePoint(e);
    expect(p0).toEqual({ x: geo.x1, y: geo.y1 });
    expect(p1).toEqual({ x: geo.x2, y: geo.y2 });
    // 対称なベジェなので中点は端点の中央
    expect(mid.x).toBeCloseTo((geo.x1 + geo.x2) / 2);
    expect(mid.y).toBeCloseTo((geo.y1 + geo.y2) / 2);
    g.removeNode('b');
    expect(g.edgePoint(e)).toBeNull();
  });
});

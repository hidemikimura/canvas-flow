import { describe, it, expect } from 'vitest';
import { Graph, normalizeEdgeType, edgeGeometryFor, geometryPoint } from '../src/core/graph.js';

function make(edgeType) {
  const g = new Graph({ layout: { edgeType } });
  g.addNode({ id: 'a', x: 0, y: 0, title: 'a', output: true });
  g.addNode({ id: 'b', x: 400, y: 200, title: 'b', input: true });
  const e = g.addEdge({ id: 'e', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
  return { g, e };
}

describe('edge type', () => {
  it('normalizes aliases', () => {
    expect(normalizeEdgeType(undefined)).toBe('bezier');
    expect(normalizeEdgeType('line')).toBe('straight');
    expect(normalizeEdgeType('orthogonal')).toBe('step');
    expect(normalizeEdgeType('nonsense')).toBe('bezier');
  });

  it('bezier geometry has control points', () => {
    const { g, e } = make('bezier');
    const geo = g.edgeGeometry(e);
    expect(geo.type).toBe('bezier');
    expect(geo.c1x).toBeGreaterThan(geo.x1);
    expect(geo.c2x).toBeLessThan(geo.x2);
    expect(geo.points).toHaveLength(4);
  });

  it('straight geometry is two points and midpoint is the mean', () => {
    const { g, e } = make('straight');
    const geo = g.edgeGeometry(e);
    expect(geo.points).toHaveLength(2);
    const m = g.edgePoint(e, 0.5);
    expect(m.x).toBeCloseTo((geo.x1 + geo.x2) / 2);
    expect(m.y).toBeCloseTo((geo.y1 + geo.y2) / 2);
  });

  it('step geometry only has horizontal / vertical segments', () => {
    const { g, e } = make('step');
    const geo = g.edgeGeometry(e);
    expect(geo.type).toBe('step');
    for (let i = 1; i < geo.points.length; i++) {
      const p = geo.points[i - 1], q = geo.points[i];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
    // 端点はポート位置
    expect(geo.points[0]).toEqual({ x: geo.x1, y: geo.y1 });
    expect(geo.points.at(-1)).toEqual({ x: geo.x2, y: geo.y2 });
    // 中点は形状上（縦線の上）
    const m = g.edgePoint(e, 0.5);
    expect(m.x).toBeCloseTo((geo.x1 + geo.x2) / 2);
  });

  it('step routes backwards with an overhang', () => {
    const geo = edgeGeometryFor('step', { x: 500, y: 0 }, { x: 0, y: 100 }, { stepOffset: 24 });
    expect(geo.points[1]).toEqual({ x: 524, y: 0 });
    expect(geo.points.at(-2)).toEqual({ x: -24, y: 100 });
    for (let i = 1; i < geo.points.length; i++) {
      const p = geo.points[i - 1], q = geo.points[i];
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
  });

  it('per-edge type overrides the default and edgeRect covers the polyline', () => {
    const { g, e } = make('bezier');
    g.updateEdge('e', { type: 'step' });
    expect(g.edgeType(e)).toBe('step');
    const r = g.edgeRect(e);
    const geo = g.edgeGeometry(e);
    for (const p of geo.points) {
      expect(p.x).toBeGreaterThanOrEqual(r.x);
      expect(p.x).toBeLessThanOrEqual(r.x + r.w);
      expect(p.y).toBeGreaterThanOrEqual(r.y);
      expect(p.y).toBeLessThanOrEqual(r.y + r.h);
    }
    expect(geometryPoint(geo, 0)).toEqual({ x: geo.x1, y: geo.y1 });
  });
});

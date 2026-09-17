import { describe, it, expect } from 'vitest';
import { Graph, portKey } from '../src/core/graph.js';
import { SpatialIndex } from '../src/core/spatial-index.js';
import { Viewport } from '../src/core/viewport.js';

function twoNodes() {
  const g = new Graph();
  const a = g.addNode({ id: 'a', title: 'A', x: 0, y: 0, output: true, items: [{ id: 'i1', label: 'x', output: true }] });
  const b = g.addNode({ id: 'b', title: 'B', x: 400, y: 100, input: true, items: [{ id: 'j1', label: 'y', input: true }] });
  return { g, a, b };
}

describe('SpatialIndex', () => {
  it('矩形問い合わせで交差する要素だけ返す', () => {
    const idx = new SpatialIndex(100);
    idx.insert('a', { x: 0, y: 0, w: 50, h: 50 });
    idx.insert('b', { x: 1000, y: 1000, w: 50, h: 50 });
    idx.insert('c', { x: 90, y: 90, w: 300, h: 300 }); // 複数セルにまたがる
    expect(idx.query({ x: 0, y: 0, w: 60, h: 60 }).sort()).toEqual(['a']);
    expect(idx.query({ x: 200, y: 200, w: 10, h: 10 })).toEqual(['c']);
    expect(idx.queryPoint(1010, 1010)).toEqual(['b']);
    idx.update('a', { x: 2000, y: 0, w: 50, h: 50 });
    expect(idx.query({ x: 0, y: 0, w: 60, h: 60 })).toEqual([]);
    idx.remove('c');
    expect(idx.size).toBe(2);
  });

  it('10000 件でも問い合わせが小さい', () => {
    const idx = new SpatialIndex(512);
    for (let i = 0; i < 10000; i++) idx.insert('n' + i, { x: (i % 100) * 280, y: Math.floor(i / 100) * 160, w: 200, h: 80 });
    const t0 = performance.now();
    const r = idx.query({ x: 0, y: 0, w: 1600, h: 900 });
    const ms = performance.now() - t0;
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(100);
    expect(ms).toBeLessThan(20);
  });
});

describe('Graph', () => {
  it('ノード高さは項目数で決まり、ポート位置が計算できる', () => {
    const { g, a } = twoNodes();
    expect(g.nodeHeight(a)).toBe(30 + 26 + 8);
    const p = g.portPosition('a', portKey('i1', 'out'));
    expect(p).toEqual({ x: 200, y: 30 + 4 + 13 });
    expect(g.portPosition('a', 'in')).toBeNull(); // input 無し
  });

  it('接続の可否と重複禁止', () => {
    const { g } = twoNodes();
    expect(g.canConnect('a', 'item:i1:out', 'b', 'item:j1:in')).toBe(true);
    expect(g.canConnect('a', 'item:i1:out', 'a', 'item:i1:out')).toBe(false);
    expect(g.canConnect('b', 'item:j1:in', 'a', 'item:i1:out')).toBe(false); // in→out は不可
    const e = g.addEdge({ source: 'a', sourcePort: 'item:i1:out', target: 'b', targetPort: 'item:j1:in' });
    expect(e).not.toBeNull();
    expect(g.addEdge({ source: 'a', sourcePort: 'item:i1:out', target: 'b', targetPort: 'item:j1:in' })).toBeNull();
    // 逆向きで渡しても正規化される
    const e2 = g.addEdge({ source: 'b', sourcePort: 'in', target: 'a', targetPort: 'out' });
    expect(e2.source).toBe('a');
    expect(g.edges.size).toBe(2);
  });

  it('ノード削除で接続エッジも消え、インデックスから外れる', () => {
    const { g } = twoNodes();
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    expect(g.edgesInRect({ x: 0, y: 0, w: 1000, h: 1000 }).length).toBe(1);
    g.removeNode('a');
    expect(g.edges.size).toBe(0);
    expect(g.nodesInRect({ x: -10, y: -10, w: 100, h: 100 })).toEqual([]);
    expect(g.edgesInRect({ x: 0, y: 0, w: 1000, h: 1000 })).toEqual([]);
  });

  it('項目削除でその項目のエッジだけ消える', () => {
    const { g } = twoNodes();
    g.addEdge({ id: 'e1', source: 'a', sourcePort: 'item:i1:out', target: 'b', targetPort: 'item:j1:in' });
    g.addEdge({ id: 'e2', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.removeItem('a', 'i1');
    expect([...g.edges.keys()]).toEqual(['e2']);
    expect(g.nodeHeight(g.getNode('a'))).toBe(30);
  });

  it('移動でノードとエッジのインデックスが追従する', () => {
    const { g } = twoNodes();
    g.addEdge({ id: 'e1', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.moveNodes(['a', 'b'], 5000, 5000);
    expect(g.nodesInRect({ x: 0, y: 0, w: 1000, h: 1000 })).toEqual([]);
    expect(g.nodesInRect({ x: 5000, y: 5000, w: 1000, h: 1000 }).length).toBe(2);
    expect(g.edgesInRect({ x: 5000, y: 5000, w: 1000, h: 1000 }).length).toBe(1);
  });

  it('複製は内部エッジだけを複製し、外部エッジは複製しない', () => {
    const { g } = twoNodes();
    g.addNode({ id: 'c', title: 'C', x: 800, y: 0, input: true });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    g.addEdge({ source: 'a', sourcePort: 'out', target: 'c', targetPort: 'in' });
    const r = g.duplicateNodes(['a', 'b'], { x: 10, y: 10 });
    expect(r.nodes.length).toBe(2);
    expect(r.edges.length).toBe(1);
    expect(g.nodes.size).toBe(5);
    expect(g.edges.size).toBe(3);
    expect(r.nodes[0].x).toBe(10);
    // 深いコピー
    r.nodes[0].items[0].label = 'changed';
    expect(g.getNode('a').items[0].label).toBe('x');
  });

  it('範囲に完全に含まれるノードだけ選ぶ', () => {
    const { g } = twoNodes();
    expect(g.nodesFullyInRect({ x: -1, y: -1, w: 250, h: 100 }).map((n) => n.id)).toEqual(['a']);
    expect(g.nodesFullyInRect({ x: 10, y: -1, w: 250, h: 100 })).toEqual([]);
  });

  it('batch は change を 1 回にまとめる', () => {
    const g = new Graph();
    let n = 0;
    g.on('change', () => n++);
    g.batch(() => {
      g.addNode({ id: 'a' });
      g.addNode({ id: 'b' });
    });
    expect(n).toBe(1);
  });

  it('toJSON / load で往復できる', () => {
    const { g } = twoNodes();
    g.addEdge({ id: 'e1', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const g2 = new Graph();
    g2.load(json);
    expect(g2.nodes.size).toBe(2);
    expect(g2.edges.size).toBe(1);
    expect(g2.bounds()).toEqual(g.bounds());
  });
});

describe('Viewport', () => {
  it('ズームしてもカーソル位置のワールド座標が変わらない', () => {
    const vp = new Viewport();
    vp.setSize(800, 600);
    vp.panBy(123, -45);
    const before = vp.toWorld(300, 200);
    vp.zoomAt(300, 200, 1.7);
    const after = vp.toWorld(300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('centerOn で中央に来る / reset で戻る / fitRect で収まる', () => {
    const vp = new Viewport();
    vp.setSize(800, 600);
    vp.centerOn(1000, 2000, 2);
    expect(vp.toScreen(1000, 2000)).toEqual({ x: 400, y: 300 });
    vp.reset();
    expect(vp.snapshot()).toEqual({ tx: 0, ty: 0, zoom: 1 });
    vp.fitRect({ x: 0, y: 0, w: 8000, h: 600 }, 0);
    expect(vp.zoom).toBeCloseTo(0.1);
    const vis = vp.visibleRect();
    expect(vis.x).toBeLessThanOrEqual(0);
    expect(vis.x + vis.w).toBeGreaterThanOrEqual(8000);
  });

  it('ズーム範囲は minZoom〜maxZoom に収まる', () => {
    const vp = new Viewport({ minZoom: 0.1, maxZoom: 3 });
    vp.zoomAt(0, 0, 1000);
    expect(vp.zoom).toBe(3);
    vp.zoomAt(0, 0, 0.0001);
    expect(vp.zoom).toBe(0.1);
  });
});

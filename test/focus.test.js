import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph.js';

/** a → b → c、d → b、孤立した e */
function build() {
  const g = new Graph();
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    g.addNode({ id, x: 0, y: 0, title: id, input: true, output: true });
  }
  g.addEdge({ id: 'ab', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
  g.addEdge({ id: 'bc', source: 'b', sourcePort: 'out', target: 'c', targetPort: 'in' });
  g.addEdge({ id: 'db', source: 'd', sourcePort: 'out', target: 'b', targetPort: 'in' });
  return g;
}

describe('connectedTo', () => {
  it('辿れる範囲すべてを集める', () => {
    const g = build();
    const { nodes, edges } = g.connectedTo(['a']);
    expect([...nodes].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...edges].sort()).toEqual(['ab', 'bc', 'db']);
    expect(nodes.has('e')).toBe(false);
  });

  it('depth 1 なら隣接のみ', () => {
    const g = build();
    const { nodes, edges } = g.connectedTo(['a'], { depth: 1 });
    expect([...nodes].sort()).toEqual(['a', 'b']);
    expect([...edges].sort()).toEqual(['ab']);
  });

  it('depth 2 で 2 段先まで', () => {
    const g = build();
    const { nodes } = g.connectedTo(['a'], { depth: 2 });
    expect([...nodes].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('downstream はコネクタの向きに沿ってのみ辿る', () => {
    const g = build();
    const { nodes, edges } = g.connectedTo(['a'], { direction: 'downstream' });
    expect([...nodes].sort()).toEqual(['a', 'b', 'c']);
    expect(nodes.has('d')).toBe(false);
    expect([...edges].sort()).toEqual(['ab', 'bc']);
  });

  it('upstream は逆向きにのみ辿る', () => {
    const g = build();
    const { nodes } = g.connectedTo(['c'], { direction: 'upstream' });
    expect([...nodes].sort()).toEqual(['a', 'b', 'c', 'd']);
    const only = g.connectedTo(['b'], { direction: 'upstream' });
    expect([...only.nodes].sort()).toEqual(['a', 'b', 'd']);
  });

  it('孤立ノードは自分だけ', () => {
    const g = build();
    const { nodes, edges } = g.connectedTo(['e']);
    expect([...nodes]).toEqual(['e']);
    expect(edges.size).toBe(0);
  });

  it('includeStart:false で起点を外せる', () => {
    const g = build();
    const { nodes } = g.connectedTo(['a'], { depth: 1, includeStart: false });
    expect([...nodes]).toEqual(['b']);
  });

  it('存在しない ID と複数起点', () => {
    const g = build();
    const { nodes } = g.connectedTo(['nope', 'e'], { depth: 1 });
    expect([...nodes]).toEqual(['e']);
    const multi = g.connectedTo(['c', 'e']);
    expect([...multi.nodes].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('向きの既定', () => {
  it('downstream は「進める先」だけで、入ってくる側は含めない', () => {
    const g = build();
    // a → b → c、d → b。b から進めるのは c だけ（a と d は b へ入ってくる側）
    const { nodes, edges } = g.connectedTo(['b'], { direction: 'downstream' });
    expect([...nodes].sort()).toEqual(['b', 'c']);
    expect([...edges]).toEqual(['bc']);
    expect(nodes.has('a')).toBe(false);
    expect(nodes.has('d')).toBe(false);
  });
});

/**
 * 木村さんの例。
 *   A → B → C
 *   A → E、D → E、E → F
 * B を選ぶと A・B・C・E・F が強調され、D（E へ合流しているだけの別系統）は薄いまま。
 */
function buildLineage() {
  const g = new Graph();
  for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) {
    g.addNode({ id, x: 0, y: 0, title: id, input: true, output: true });
  }
  const e = (id, s, t) => g.addEdge({ id, source: s, sourcePort: 'out', target: t, targetPort: 'in' });
  e('AB', 'A', 'B');
  e('BC', 'B', 'C');
  e('AE', 'A', 'E');
  e('DE', 'D', 'E');
  e('EF', 'E', 'F');
  return g;
}

describe('lineage（起点の祖先と子孫だけ）', () => {
  it('B を選ぶと A,B,C だけ（祖先 A から分かれた E・F は入らない）', () => {
    const g = buildLineage();
    const { nodes, edges } = g.connectedTo(['B'], { direction: 'lineage' });
    expect([...nodes].sort()).toEqual(['A', 'B', 'C']);
    expect(nodes.has('E')).toBe(false);
    expect(nodes.has('D')).toBe(false);
    expect([...edges].sort()).toEqual(['AB', 'BC']);
  });

  it('D を選ぶと D,E,F（子孫と、その先）', () => {
    const g = buildLineage();
    const { nodes, edges } = g.connectedTo(['D'], { direction: 'lineage' });
    expect([...nodes].sort()).toEqual(['D', 'E', 'F']);
    expect([...edges].sort()).toEqual(['DE', 'EF']);
  });

  it('E を選ぶと祖先 A・D と子孫 F（A から分かれた B・C は入らない）', () => {
    const g = buildLineage();
    const { nodes, edges } = g.connectedTo(['E'], { direction: 'lineage' });
    expect([...nodes].sort()).toEqual(['A', 'D', 'E', 'F']);
    expect(nodes.has('B')).toBe(false);
    expect([...edges].sort()).toEqual(['AE', 'DE', 'EF']);
  });

  it('A を選ぶと子孫すべて（合流してくる D は入らない）', () => {
    const g = buildLineage();
    const { nodes } = g.connectedTo(['A'], { direction: 'lineage' });
    expect([...nodes].sort()).toEqual(['A', 'B', 'C', 'E', 'F']);
    expect(nodes.has('D')).toBe(false);
  });

  it('depth は上流・下流それぞれに効く', () => {
    const g = buildLineage();
    const { nodes } = g.connectedTo(['E'], { direction: 'lineage', depth: 1 });
    // 上流 1 段で A と D、下流 1 段で F
    expect([...nodes].sort()).toEqual(['A', 'D', 'E', 'F']);
    const two = g.connectedTo(['C'], { direction: 'lineage', depth: 1 });
    expect([...two.nodes].sort()).toEqual(['B', 'C']);
  });

  it('祖先から分かれた別の枝は goto でも入らない（A>B, B>C, A>D の D）', () => {
    const g = new Graph();
    for (const id of ['A', 'B', 'C', 'D']) g.addNode({ id, x: 0, y: 0, title: id, input: true, output: true });
    g.addEdge({ id: 'AB', source: 'A', sourcePort: 'out', target: 'B', targetPort: 'in' });
    g.addEdge({ id: 'BC', source: 'B', sourcePort: 'out', target: 'C', targetPort: 'in' });
    g.setGoto('A', 'D');
    const { nodes, links } = g.connectedTo(['C'], { direction: 'lineage' });
    expect([...nodes].sort()).toEqual(['A', 'B', 'C']);
    expect(nodes.has('D')).toBe(false);
    expect(links.size).toBe(0);
    // A を選べば goto 先の D は子孫として入る
    const fromA = g.connectedTo(['A'], { direction: 'lineage' });
    expect([...fromA.nodes].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(fromA.links.size).toBe(1);
  });
});

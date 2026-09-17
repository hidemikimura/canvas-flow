import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph.js';
import { serialize, parse, validate, remapForMerge, FORMAT, FORMAT_VERSION } from '../src/core/serializer.js';

function sample() {
  const g = new Graph();
  g.addNode({ id: 'a', title: 'A', x: 0, y: 0, output: true, items: [{ id: 'i', label: 'x', output: true }] });
  g.addNode({ id: 'b', title: 'B', x: 400, y: 100, input: true, items: [{ id: 'j', label: 'y', input: true }] });
  g.addNode({ id: 'c', title: 'C', x: 800, y: 0, input: true });
  g.addEdge({ id: 'e1', source: 'a', sourcePort: 'item:i:out', target: 'b', targetPort: 'item:j:in' });
  g.addEdge({ id: 'e2', source: 'a', sourcePort: 'out', target: 'c', targetPort: 'in' });
  return g;
}

describe('serialize', () => {
  it('全体をフォーマット付きで出力し、JSON 往復できる', () => {
    const g = sample();
    const out = serialize(g, { viewport: { tx: 1, ty: 2, zoom: 0.5, extra: 'x' } });
    expect(out.format).toBe(FORMAT);
    expect(out.version).toBe(FORMAT_VERSION);
    expect(out.nodes.length).toBe(3);
    expect(out.edges.length).toBe(2);
    expect(out.viewport).toEqual({ tx: 1, ty: 2, zoom: 0.5 });
    // 元のオブジェクトとは別インスタンス
    out.nodes[0].title = 'changed';
    expect(g.getNode(out.nodes[0].id).title).not.toBe('changed');

    const g2 = new Graph();
    const parsed = parse(JSON.stringify(out));
    expect(parsed.ok).toBe(true);
    g2.load(parsed.data);
    expect(g2.nodes.size).toBe(3);
    expect(g2.edges.size).toBe(2);
  });

  it('nodeIds 指定で選択部分だけを出力し、外部へのエッジは含めない', () => {
    const out = serialize(sample(), { nodeIds: ['a', 'b'] });
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(out.edges.map((e) => e.id)).toEqual(['e1']);
    expect(out.viewport).toBeUndefined();
  });
});

describe('parse / validate', () => {
  it('構文エラー・不正な構造はエラーになる', () => {
    expect(parse('{oops').ok).toBe(false);
    expect(parse('[]').ok).toBe(false);
    expect(parse('{"nodes": 5}').ok).toBe(false);
    expect(parse({ format: 'other', nodes: [] }).ok).toBe(false);
    expect(parse({ format: FORMAT, version: 99, nodes: [] }).ok).toBe(false);
    expect(parse({ nodes: [{ id: 'a' }, { id: 'a' }] }).ok).toBe(false);
  });

  it('プレーンな {nodes, edges} も受け付け、欠けた値を補う', () => {
    const r = parse({ nodes: [{ title: 'T', x: 'bad' }, { id: 5, items: [{ label: 'k' }] }], edges: [] });
    expect(r.ok).toBe(true);
    expect(r.data.nodes[0].x).toBe(0);
    expect(typeof r.data.nodes[0].id).toBe('string');
    expect(r.data.nodes[1].id).toBe('5');
    expect(typeof r.data.nodes[1].items[0].id).toBe('string');
  });

  it('壊れたエッジは警告付きで除外される', () => {
    const r = parse({
      nodes: [
        { id: 'a', output: true },
        { id: 'b', input: true },
      ],
      edges: [
        { id: 'ok', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' },
        { id: 'noNode', source: 'a', sourcePort: 'out', target: 'zzz', targetPort: 'in' },
        { id: 'noPort', source: 'a', sourcePort: 'item:q:out', target: 'b', targetPort: 'in' },
        { id: 'ok', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' }, // id 重複
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.data.edges.length).toBe(2);
    expect(r.data.edges[0].id).toBe('ok');
    expect(r.data.edges[1].id).not.toBe('ok');
    expect(r.warnings.length).toBe(3);
  });

  it('viewport は妥当なときだけ取り込む', () => {
    expect(validate({ nodes: [], viewport: { tx: 0, ty: 0, zoom: 0 } }).data.viewport).toBeUndefined();
    expect(validate({ nodes: [], viewport: { tx: 1, ty: 2, zoom: 2 } }).data.viewport).toEqual({ tx: 1, ty: 2, zoom: 2 });
  });
});

describe('remapForMerge', () => {
  it('既存と衝突する ID だけ付け替え、エッジの参照も追従する', () => {
    const g = sample();
    const data = parse(JSON.stringify(serialize(g, { nodeIds: ['a', 'b'] }))).data;
    data.nodes.push({ id: 'fresh', x: 0, y: 0, items: [] });
    const r = remapForMerge(data, g, { offset: { x: 10, y: 20 } });
    expect(r.idMap.size).toBe(2);
    expect(r.nodes.find((n) => n.id === 'fresh')).toBeTruthy();
    expect(r.nodes.some((n) => n.id === 'a')).toBe(false);
    const e = r.edges[0];
    expect(e.id).not.toBe('e1');
    expect(e.source).toBe(r.idMap.get('a'));
    expect(e.target).toBe(r.idMap.get('b'));
    expect(r.nodes[0].x).toBe(10);
    expect(r.nodes[0].y).toBe(20);

    // 実際に追加できる
    for (const n of r.nodes) g.addNode(n);
    for (const ed of r.edges) expect(g.addEdge(ed)).not.toBeNull();
    expect(g.nodes.size).toBe(6);
    expect(g.edges.size).toBe(3);
  });
});

import { describe, it, expect } from 'vitest';
import { Graph } from '../src/core/graph.js';
import { History } from '../src/core/history.js';
import { serialize, parse, remapForMerge } from '../src/core/serializer.js';

/**
 * 親 n0（項目 1 つ）+ 子 n1（項目 1 つ）+ 孫 n2、それに外のノード out。
 */
function nested() {
  const g = new Graph();
  g.addNode({
    id: 'n0',
    x: 100,
    y: 50,
    title: '親',
    input: true,
    output: true,
    items: [{ id: 'p0', label: 'p0', input: true, output: true }],
    childs: [
      {
        id: 'n1',
        title: '子',
        input: true,
        output: true,
        items: [{ id: 'p1', label: 'p1', input: true, output: true }],
        childs: [{ id: 'n2', title: '孫', input: true, output: true }],
      },
    ],
  });
  g.addNode({ id: 'out', x: 600, y: 60, title: '外', input: true, output: true });
  return g;
}

describe('子ノード（childs）', () => {
  it('childs を平坦なノードとして登録し、親子関係を引ける', () => {
    const g = nested();
    expect([...g.nodes.keys()].sort()).toEqual(['n0', 'n1', 'n2', 'out']);
    expect(g.childrenOf('n0').map((n) => n.id)).toEqual(['n1']);
    expect(g.childrenOf('n1').map((n) => n.id)).toEqual(['n2']);
    expect(g.isChild('n1')).toBe(true);
    expect(g.isChild('n0')).toBe(false);
    expect(g.parentOf('n2').id).toBe('n1');
    expect(g.rootOf('n2').id).toBe('n0');
    expect(g.depthOf('n2')).toBe(2);
    expect(g.descendantIds('n0')).toEqual(['n1', 'n2']);
    expect(g.rootNodes().map((n) => n.id).sort()).toEqual(['n0', 'out']);
    // ノード自身に childs / parent は残らない
    expect(g.getNode('n0').childs).toBeUndefined();
    expect(g.getNode('n1').parent).toBe('n0');
  });

  it('子は親の項目の下に縦に積まれ、幅はインデント分だけ狭くなる', () => {
    const g = nested();
    const { headerHeight, padding, childIndent } = g.layout;
    const n0 = g.nodeRect('n0');
    const n1 = g.nodeRect('n1');
    const n2 = g.nodeRect('n2');
    expect(n1.x).toBe(n0.x + childIndent);
    expect(n1.w).toBe(n0.w - childIndent * 2);
    expect(n2.x).toBe(n1.x + childIndent);
    expect(n1.y).toBe(n0.y + headerHeight + (g.layout.itemHeight + padding) + padding / 2);
    expect(n2.y).toBeGreaterThan(n1.y);
    // 親の高さは子ブロックを含む
    expect(n0.h).toBeGreaterThan(n1.h + headerHeight);
    expect(n1.h).toBe(headerHeight + g.layout.itemHeight + padding + g._childrenHeight(g.getNode('n1')));
  });

  it('子のポートは一番外側の親の左右の縁に出る', () => {
    const g = nested();
    const root = g.nodeRect('n0');
    for (const id of ['n1', 'n2']) {
      expect(g.portPosition(id, 'in').x).toBe(root.x);
      expect(g.portPosition(id, 'out').x).toBe(root.x + root.w);
    }
    expect(g.portPosition('n1', 'item:p1:in').x).toBe(root.x);
    // 縦位置は子ノード自身の行
    expect(g.portPosition('n1', 'in').y).toBeCloseTo(g.nodeRect('n1').y + g.layout.headerHeight / 2);
  });

  it('親を動かすと子もついてくる。子を指定しても親ごと動く', () => {
    const g = nested();
    const before = g.nodeRect('n2');
    g.moveNodes(['n0'], 40, 10);
    expect(g.nodeRect('n2').x).toBe(before.x + 40);
    expect(g.nodeRect('n2').y).toBe(before.y + 10);
    // 子 id を渡しても一番外側の親が動く（子だけ動かすことはできない）
    g.moveNodes(['n2'], -40, -10);
    expect(g.nodeRect('n0').x).toBe(100);
    expect(g.nodeRect('n2')).toEqual(before);
    // 空間インデックスも更新されている
    expect(g.nodesInRect(g.nodeRect('n2')).map((n) => n.id)).toContain('n2');
  });

  it('子ノードも外のノードと自由に接続できる', () => {
    const g = nested();
    const e1 = g.addEdge({ id: 'e1', source: 'n1', sourcePort: 'out', target: 'out', targetPort: 'in' });
    const e2 = g.addEdge({ id: 'e2', source: 'out', sourcePort: 'out', target: 'n2', targetPort: 'in' });
    const e3 = g.addEdge({ id: 'e3', source: 'n1', sourcePort: 'item:p1:out', target: 'out', targetPort: 'in' });
    expect([e1, e2, e3].every(Boolean)).toBe(true);
    const geo = g.edgeGeometry(e1);
    expect(geo.x1).toBe(g.nodeRect('n0').x + g.nodeRect('n0').w);
    // 親を動かすとコネクタの位置も追従する
    g.moveNodes(['n0'], 25, 0);
    expect(g.edgeGeometry(e1).x1).toBe(geo.x1 + 25);
    // 親の強調表示（lineage）にも子が含まれる
    const set = g.connectedTo(['out'], { direction: 'lineage' });
    expect(set.nodes.has('n1')).toBe(true);
  });

  it('addChild / removeChild / setParent が使える。循環は拒否する', () => {
    const g = nested();
    const added = g.addChild('n0', { id: 'k', title: '追加' }, 0);
    expect(added.id).toBe('k');
    expect(g.childrenOf('n0').map((n) => n.id)).toEqual(['k', 'n1']);

    // 親から外すと独立ノードになる
    const freed = g.removeChild('k', { x: 900, y: 300 });
    expect(freed.id).toBe('k');
    expect(freed.parent).toBeUndefined();
    expect(g.removeChild('n0')).toBe(null);
    expect(g.isChild('k')).toBe(false);
    expect(g.nodeRect('k').x).toBe(900);
    expect(g.childrenOf('n0').map((n) => n.id)).toEqual(['n1']);

    // 付け替え
    expect(g.setParent('k', 'n1')).toBe(true);
    expect(g.rootOf('k').id).toBe('n0');
    // 循環（自分の子孫を親にする）は拒否
    expect(g.setParent('n0', 'k')).toBe(false);
    expect(g.setParent('n0', 'n0')).toBe(false);
    expect(g.rootOf('n0').id).toBe('n0');
    // 独立させる
    expect(g.setParent('k', null)).toBe(true);
    expect(g.isChild('k')).toBe(false);
  });

  it('親を消すと子孫もまとめて消える', () => {
    const g = nested();
    g.addEdge({ id: 'e1', source: 'n1', sourcePort: 'out', target: 'out', targetPort: 'in' });
    expect(g.removeNode('n0')).toBe(true);
    expect([...g.nodes.keys()]).toEqual(['out']);
    expect(g.edges.size).toBe(0);
  });

  it('複製は部分木ごとコピーし、二重にコピーしない', () => {
    const g = nested();
    const res = g.duplicateNodes(['n0', 'n1'], { x: 500, y: 0 });
    expect(res.nodes.length).toBe(3);
    expect(g.nodes.size).toBe(4 + 3);
    const newRoot = res.nodes.find((n) => !n.parent);
    expect(g.childrenOf(newRoot).length).toBe(1);
    expect(newRoot.x).toBe(600);
    expect(g.childrenOf(newRoot)[0].x).toBe(newRoot.x + g.layout.childIndent);
  });

  it('JSON は childs として入れ子で出力され、往復しても同じ座標になる', () => {
    const g = nested();
    const out = serialize(g);
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['n0', 'out']);
    const root = out.nodes.find((n) => n.id === 'n0');
    expect(root.childs.map((c) => c.id)).toEqual(['n1']);
    expect(root.childs[0].childs.map((c) => c.id)).toEqual(['n2']);
    // 子に座標は書き出さない
    expect(root.childs[0].x).toBeUndefined();
    expect(root.childs[0].parent).toBeUndefined();

    const parsed = parse(JSON.stringify(out));
    expect(parsed.ok).toBe(true);
    const g2 = new Graph();
    g2.load(parsed.data);
    for (const id of ['n0', 'n1', 'n2']) {
      expect(g2.nodeRect(id)).toEqual(g.nodeRect(id));
    }
  });

  it('選択範囲の書き出しは子孫も含める。子だけを指定したら独立ノードになる', () => {
    const g = nested();
    const only = serialize(g, { nodeIds: ['n0'] });
    expect(only.nodes.map((n) => n.id)).toEqual(['n0']);
    expect(only.nodes[0].childs[0].id).toBe('n1');

    const sub = serialize(g, { nodeIds: ['n1'] });
    expect(sub.nodes.map((n) => n.id)).toEqual(['n1']);
    expect(sub.nodes[0].x).toBe(g.nodeRect('n1').x);
    expect(sub.nodes[0].childs.map((c) => c.id)).toEqual(['n2']);
  });

  it('merge で読み込むと子の id も付け替えられる', () => {
    const g = nested();
    const data = parse(JSON.stringify(serialize(g))).data;
    const remapped = remapForMerge(data, g, { offset: { x: 1000, y: 0 } });
    expect(remapped.idMap.size).toBe(4);
    const nodes = [];
    g.batch(() => {
      for (const n of remapped.nodes) nodes.push(g.addNode(n));
    });
    expect(g.nodes.size).toBe(8);
    const parent = nodes.find((n) => g.childrenOf(n).length);
    expect(parent.id).not.toBe('n0');
    expect(parent.x).toBe(1100);
    expect(g.childrenOf(parent)[0].id).not.toBe('n1');
  });

  it('Undo / Redo で親子関係が戻る', () => {
    const g = nested();
    const history = new History(g);
    g.addChild('n0', { id: 'k', title: '追加' });
    expect(g.childrenOf('n0').map((n) => n.id)).toEqual(['n1', 'k']);
    history.undo();
    expect(g.nodes.has('k')).toBe(false);
    history.redo();
    expect(g.rootOf('k').id).toBe('n0');

    g.setParent('k', null);
    expect(g.isChild('k')).toBe(false);
    history.undo();
    expect(g.rootOf('k').id).toBe('n0');
  });
});

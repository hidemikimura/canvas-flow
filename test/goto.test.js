import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Graph, normalizeGoto } from '../src/core/graph.js';
import { serialize, parse, remapForMerge } from '../src/core/serializer.js';
import { History } from '../src/core/history.js';
import { layeredLayout } from '../src/core/layout.js';
import { installDom, makeCanvas } from './helpers/editor-stub.js';
import { NodeEditor } from '../src/core/editor.js';

/**
 * チャットシナリオ想定:
 *   greet --(コネクタ)--> menu
 *   menu の項目 m1 は goto: 'price'（コネクタなし）
 *   menu の項目 m2 は goto: {to:'howto', label:'使い方'}
 *   price のノード本体に goto: ['menu', 'missing']（存在しない ID も混ぜる）
 */
function scenario() {
  const g = new Graph();
  g.addNode({ id: 'greet', x: 0, y: 0, title: 'あいさつ', output: true });
  g.addNode({
    id: 'menu',
    x: 300,
    y: 0,
    title: 'メニュー',
    input: true,
    items: [
      { id: 'm1', label: '料金', goto: 'price' },
      { id: 'm2', label: '使い方', goto: { to: 'howto', label: '使い方へ' } },
      { id: 'm3', label: 'その他' },
    ],
  });
  g.addNode({ id: 'price', x: 600, y: 0, title: '料金', goto: ['menu', 'missing'] });
  g.addNode({ id: 'howto', x: 600, y: 200, title: '使い方' });
  g.addEdge({ id: 'e1', source: 'greet', sourcePort: 'out', target: 'menu', targetPort: 'in' });
  return g;
}

describe('normalizeGoto', () => {
  it('文字列・配列・オブジェクトを受け付け、不正な値は落とす', () => {
    expect(normalizeGoto('a')).toEqual([{ to: 'a' }]);
    expect(normalizeGoto(['a', 'b'])).toEqual([{ to: 'a' }, { to: 'b' }]);
    expect(normalizeGoto({ to: 'a', label: '戻る' })).toEqual([{ to: 'a', label: '戻る' }]);
    expect(normalizeGoto([{ to: 'a' }, 'b'])).toEqual([{ to: 'a' }, { to: 'b' }]);
    expect(normalizeGoto(null)).toEqual([]);
    expect(normalizeGoto('')).toEqual([]);
    expect(normalizeGoto(123)).toEqual([]);
    expect(normalizeGoto({ label: 'to がない' })).toEqual([]);
  });
});

describe('gotoLinks / gotoSources', () => {
  it('ノードと項目の goto を一覧にする', () => {
    const g = scenario();
    const links = g.gotoLinks('menu');
    expect(links.map((l) => [l.itemId, l.to, l.label])).toEqual([
      ['m1', 'price', null],
      ['m2', 'howto', '使い方へ'],
    ]);
    expect(links.every((l) => l.exists)).toBe(true);
    // key は安定していて重複しない
    expect(new Set(g.gotoLinks().map((l) => l.key)).size).toBe(g.gotoLinks().length);
  });

  it('存在しない遷移先は exists: false になる', () => {
    const g = scenario();
    const links = g.gotoLinks('price');
    expect(links.map((l) => [l.to, l.exists, l.itemId])).toEqual([
      ['menu', true, null],
      ['missing', false, null],
    ]);
  });

  it('逆引き（gotoSources）で「どこから来ているか」が引ける', () => {
    const g = scenario();
    expect(g.gotoSources('price').map((l) => [l.from, l.itemId])).toEqual([['menu', 'm1']]);
    expect(g.gotoSources('menu').map((l) => l.from)).toEqual(['price']);
    expect(g.gotoSources('greet')).toEqual([]);
    expect(g.gotoTargets('menu').map((n) => n.id)).toEqual(['price', 'howto']);
  });

  it('ノードを消したり増やしたりすると逆引きが作り直される', () => {
    const g = scenario();
    expect(g.gotoSources('price').length).toBe(1);
    g.removeNode('menu');
    expect(g.gotoSources('price')).toEqual([]);
    g.addNode({ id: 'again', x: 0, y: 400, title: 'again', goto: 'price' });
    expect(g.gotoSources('price').map((l) => l.from)).toEqual(['again']);
    // 遷移先が消えると exists が false に変わる
    g.removeNode('price');
    expect(g.gotoLinks('again')[0].exists).toBe(false);
  });

  it('setGoto で設定・解除できる（Undo 可）', () => {
    const g = scenario();
    const history = new History(g);
    g.setGoto('howto', 'greet');
    expect(g.gotoLinks('howto').map((l) => l.to)).toEqual(['greet']);
    g.setGoto('menu', { to: 'howto', label: '直行' }, { itemId: 'm3' });
    expect(g.gotoLinks('menu').length).toBe(3);
    history.undo();
    expect(g.gotoLinks('menu').length).toBe(2);
    history.undo();
    expect(g.gotoLinks('howto')).toEqual([]);
    history.redo();
    expect(g.gotoLinks('howto').map((l) => l.to)).toEqual(['greet']);
    // 解除
    g.setGoto('howto', null);
    expect(g.gotoLinks('howto')).toEqual([]);
  });

  it('点線の始点・終点が引ける（項目の行から遷移先の左端へ）', () => {
    const g = scenario();
    const link = g.gotoLinks('menu')[0];
    const anchor = g.gotoAnchor(link);
    const menu = g.nodeRect('menu');
    const price = g.nodeRect('price');
    const row = g.itemRect(g.getNode('menu'), 'm1');
    expect(anchor.a).toEqual({ x: menu.x + menu.w, y: row.y + row.h / 2 });
    expect(anchor.b).toEqual({ x: price.x, y: price.y + g.layout.headerHeight / 2 });
    // 存在しない遷移先では null
    expect(g.gotoAnchor(g.gotoLinks('price')[1])).toBe(null);
  });
});

describe('connectedTo が goto も辿る', () => {
  it('downstream は goto の先も含む', () => {
    const g = scenario();
    const { nodes, edges, links } = g.connectedTo(['menu'], { direction: 'downstream' });
    expect([...nodes].sort()).toEqual(['howto', 'menu', 'price']);
    expect([...edges]).toEqual([]);
    expect(links.size).toBe(3); // m1→price, m2→howto, price→menu
  });

  it('upstream は goto で指してくる側も含む', () => {
    const g = scenario();
    const { nodes } = g.connectedTo(['price'], { direction: 'upstream' });
    expect([...nodes].sort()).toEqual(['greet', 'menu', 'price']);
  });

  it('lineage でも goto がつながりとして扱われる', () => {
    const g = scenario();
    const { nodes, links } = g.connectedTo(['howto'], { direction: 'lineage' });
    // howto の上流は menu（goto 経由）→ さらに上流の greet、そこから流れる先すべて
    expect([...nodes].sort()).toEqual(['greet', 'howto', 'menu', 'price']);
    expect(links.size).toBeGreaterThan(0);
  });

  it('links: false にするとコネクタだけを辿る', () => {
    const g = scenario();
    const { nodes, links } = g.connectedTo(['menu'], { direction: 'downstream', links: false });
    expect([...nodes]).toEqual(['menu']);
    expect(links.size).toBe(0);
  });

  it('存在しない遷移先は辿らない', () => {
    const g = scenario();
    const { nodes } = g.connectedTo(['price'], { direction: 'downstream' });
    expect([...nodes].sort()).toEqual(['howto', 'menu', 'price']);
    expect(nodes.has('missing')).toBe(false);
  });

  it('depth は goto にも効く', () => {
    const g = scenario();
    const { nodes } = g.connectedTo(['menu'], { direction: 'downstream', depth: 1 });
    expect([...nodes].sort()).toEqual(['howto', 'menu', 'price']);
    const one = g.connectedTo(['greet'], { direction: 'downstream', depth: 1 });
    expect([...one.nodes].sort()).toEqual(['greet', 'menu']);
  });
});

describe('強調表示（focusSet）', () => {
  let editor;
  beforeAll(() => installDom());
  beforeEach(() => {
    editor = new NodeEditor(makeCanvas(), { focusMode: 'connected', graph: scenario() });
  });
  afterEach(() => editor.destroy());

  it('goto でつながっているノードも強調対象に入る', () => {
    editor.select({ nodes: ['menu'] });
    const set = editor.focusSet();
    expect([...set.nodes].sort()).toEqual(['greet', 'howto', 'menu', 'price']);
    expect(set.links.size).toBeGreaterThan(0);
  });

  it('focus:change の detail に links が入る', () => {
    const seen = [];
    editor.on('focus:change', (d) => seen.push(d));
    editor.select({ nodes: ['menu'] });
    expect(seen.at(-1).links.length).toBeGreaterThan(0);
  });

  it('selectFocused で goto 先のノードもまとめて選択できる', () => {
    editor.select({ nodes: ['menu'] });
    const picked = editor.selectFocused();
    expect(picked.nodes.sort()).toEqual(['greet', 'howto', 'menu', 'price']);
    expect([...editor.selection.nodes].sort()).toEqual(['greet', 'howto', 'menu', 'price']);
  });
});

describe('JSON と自動整列', () => {
  it('JSON に goto がそのまま残り、往復できる', () => {
    const g = scenario();
    const out = serialize(g);
    const menu = out.nodes.find((n) => n.id === 'menu');
    expect(menu.items[0].goto).toBe('price');
    expect(menu.items[1].goto).toEqual({ to: 'howto', label: '使い方へ' });
    expect(out.nodes.find((n) => n.id === 'price').goto).toEqual(['menu', 'missing']);

    const parsed = parse(JSON.stringify(out));
    expect(parsed.ok).toBe(true);
    const g2 = new Graph();
    g2.load(parsed.data);
    expect(g2.gotoLinks('menu').map((l) => l.to)).toEqual(['price', 'howto']);
  });

  it('解釈できない goto は警告付きで落とす', () => {
    const parsed = parse({
      nodes: [{ id: 'a', x: 0, y: 0, goto: 123, items: [{ id: 'i', goto: { label: 'to がない' } }] }],
      edges: [],
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings.length).toBe(2);
    expect(parsed.data.nodes[0].goto).toBeUndefined();
    expect(parsed.data.nodes[0].items[0].goto).toBeUndefined();
  });

  it('merge で ID を付け替えると goto の遷移先も付け替わる', () => {
    const g = scenario();
    const data = parse(JSON.stringify(serialize(g))).data;
    const remapped = remapForMerge(data, g, { offset: { x: 1000, y: 0 } });
    const menu = remapped.nodes.find((n) => n.title === 'メニュー');
    const newPrice = remapped.idMap.get('price');
    expect(menu.items[0].goto).toBe(newPrice);
    // 付け替え対象に無い ID（存在しない遷移先）はそのまま
    const price = remapped.nodes.find((n) => n.title === '料金');
    expect(price.goto).toEqual([remapped.idMap.get('menu'), 'missing']);

    const added = [];
    g.batch(() => {
      for (const n of remapped.nodes) added.push(g.addNode(n));
    });
    const copiedMenu = added.find((n) => n.title === 'メニュー');
    expect(g.gotoLinks(copiedMenu).every((l) => l.exists)).toBe(true);
    expect(g.gotoLinks(copiedMenu)[0].to).toBe(newPrice);
  });

  it('自動整列で goto もつながりとして扱われる（links: false で無効）', () => {
    const g = scenario();
    const ids = [...g.nodes.keys()];
    const withLinks = layeredLayout(g, ids, { origin: { x: 0, y: 0 } });
    // greet → menu → price / howto の順に層が進む
    expect(withLinks.get('menu').x).toBeGreaterThan(withLinks.get('greet').x);
    expect(withLinks.get('howto').x).toBeGreaterThan(withLinks.get('menu').x);

    const edgesOnly = layeredLayout(g, ids, { origin: { x: 0, y: 0 }, links: false });
    // コネクタだけなら howto は孤立扱いなので menu より右には来ない
    expect(edgesOnly.get('howto').x).not.toBeGreaterThan(edgesOnly.get('menu').x);
  });
});

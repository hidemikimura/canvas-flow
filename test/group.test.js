import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installDom, makeCanvas } from './helpers/editor-stub.js';
import { NodeEditor } from '../src/core/editor.js';
import { Graph } from '../src/core/graph.js';
import { History } from '../src/core/history.js';
import { serialize, parse, remapForMerge } from '../src/core/serializer.js';
import { defaultContextMenuItems } from '../src/lit/context-menu.js';

/**
 * グループ g1（0,0 / 400x300）に a・b が入っていて、外に c がある。a → b → c。
 */
function sample() {
  return {
    groups: [{ id: 'g1', label: '前処理', x: 0, y: 0, width: 400, height: 300 }],
    nodes: [
      { id: 'a', x: 20, y: 40, title: 'A', input: true, output: true, group: 'g1' },
      { id: 'b', x: 180, y: 120, title: 'B', input: true, output: true, group: 'g1' },
      { id: 'c', x: 600, y: 40, title: 'C', input: true, output: true },
    ],
    edges: [
      { id: 'ab', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' },
      { id: 'bc', source: 'b', sourcePort: 'out', target: 'c', targetPort: 'in' },
    ],
  };
}

const pos = (g, id) => {
  const n = g.nodes.get(id) ?? g.groups.get(id);
  return { x: n.x, y: n.y };
};

describe('Graph: グループ', () => {
  it('読み込むとグループとメンバーを引ける。存在しないグループの指定は捨てる', () => {
    const g = new Graph();
    g.load({ ...sample(), nodes: [...sample().nodes, { id: 'd', x: 0, y: 0, group: 'nope' }] });
    expect([...g.groups.keys()]).toEqual(['g1']);
    expect(g.groupMembers('g1').map((n) => n.id)).toEqual(['a', 'b']);
    expect(g.groupOf('a').id).toBe('g1');
    expect(g.groupOf('c')).toBeNull();
    expect(g.getNode('d').group).toBeUndefined();
  });

  it('子ノードはグループに入らず、親のグループが groupOf になる', () => {
    const g = new Graph();
    g.addGroup({ id: 'g1', x: 0, y: 0, width: 400, height: 300 });
    g.addNode({ id: 'p', x: 10, y: 40, group: 'g1', childs: [{ id: 'k', title: '子', group: 'g1' }] });
    expect(g.getNode('k').group).toBeUndefined();
    expect(g.groupOf('k').id).toBe('g1');
    expect(g.groupMembers('g1').map((n) => n.id)).toEqual(['p']);
  });

  it('moveGroups はメンバーも一緒に動かし、Undo で戻る', () => {
    const g = new Graph();
    const h = new History(g);
    g.load(sample());
    g.moveGroups(['g1'], 50, 10);
    expect(pos(g, 'g1')).toEqual({ x: 50, y: 10 });
    expect(pos(g, 'a')).toEqual({ x: 70, y: 50 });
    expect(pos(g, 'b')).toEqual({ x: 230, y: 130 });
    expect(pos(g, 'c')).toEqual({ x: 600, y: 40 });
    h.undo();
    expect(pos(g, 'g1')).toEqual({ x: 0, y: 0 });
    expect(pos(g, 'a')).toEqual({ x: 20, y: 40 });
    h.redo();
    expect(pos(g, 'a')).toEqual({ x: 70, y: 50 });
  });

  it('removeGroup は既定でメンバーを残し、withMembers でメンバーも消す。どちらも Undo で戻る', () => {
    const g = new Graph();
    const h = new History(g);
    g.load(sample());
    g.removeGroup('g1');
    expect(g.groups.size).toBe(0);
    expect(g.nodes.has('a')).toBe(true);
    expect(g.getNode('a').group).toBeUndefined();
    h.undo();
    expect(g.groupMembers('g1').map((n) => n.id)).toEqual(['a', 'b']);

    g.removeGroup('g1', { withMembers: true });
    expect(g.nodes.has('a')).toBe(false);
    expect(g.edges.has('bc')).toBe(false);
    h.undo();
    expect(g.groupMembers('g1').map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(g.edges.has('ab')).toBe(true);
    expect(g.edges.has('bc')).toBe(true);
  });

  it('groupForRect は中心を含む一番小さいグループを返す', () => {
    const g = new Graph();
    g.addGroup({ id: 'big', x: 0, y: 0, width: 1000, height: 1000 });
    g.addGroup({ id: 'small', x: 100, y: 100, width: 200, height: 200 });
    expect(g.groupForRect({ x: 150, y: 150, w: 20, h: 20 }).id).toBe('small');
    expect(g.groupForRect({ x: 500, y: 500, w: 20, h: 20 }).id).toBe('big');
    expect(g.groupForRect({ x: 150, y: 150, w: 20, h: 20 }, { exclude: ['small'] }).id).toBe('big');
    expect(g.groupForRect({ x: 2000, y: 0, w: 20, h: 20 })).toBeNull();
  });

  it('fitGroup はメンバーを余白とラベル帯込みで囲む', () => {
    const g = new Graph();
    g.load(sample());
    g.fitGroup('g1', { padding: 10 });
    const { groupLabelHeight } = g.layout;
    const a = g.nodeRect('a');
    const b = g.nodeRect('b');
    const r = g.groupRect('g1');
    expect(r.x).toBe(a.x - 10);
    expect(r.y).toBe(a.y - 10 - groupLabelHeight);
    expect(r.x + r.w).toBe(b.x + b.w + 10);
    expect(r.y + r.h).toBe(b.y + b.h + 10);
  });

  it('bounds はグループも含む', () => {
    const g = new Graph();
    g.addGroup({ id: 'g', x: -100, y: -50, width: 50, height: 50 });
    g.addNode({ id: 'n', x: 0, y: 0 });
    const b = g.bounds();
    expect(b.x).toBe(-100);
    expect(b.y).toBe(-50);
  });

  it('グループを複製するとメンバーと内部のコネクタも複製され、複製先のグループに入る', () => {
    const g = new Graph();
    g.load(sample());
    const r = g.duplicateNodes([], { x: 0, y: 500 }, { groupIds: ['g1'] });
    expect(r.groups).toHaveLength(1);
    const copy = r.groups[0];
    expect(copy.y).toBe(500);
    expect(g.groupMembers(copy.id)).toHaveLength(2);
    expect(r.edges).toHaveLength(1); // a→b だけ（b→c は c を複製していない）
    expect(g.groupMembers('g1').map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('JSON: グループ', () => {
  it('serialize / parse で往復できる', () => {
    const g = new Graph();
    g.load(sample());
    const data = serialize(g);
    expect(data.groups).toEqual([{ id: 'g1', label: '前処理', x: 0, y: 0, width: 400, height: 300 }]);
    expect(data.nodes.find((n) => n.id === 'a').group).toBe('g1');
    const r = parse(JSON.stringify(data));
    expect(r.ok).toBe(true);
    const g2 = new Graph();
    g2.load(r.data);
    expect(g2.groupMembers('g1').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('グループを持たないデータでは groups キーを出さない', () => {
    const g = new Graph();
    g.addNode({ id: 'n' });
    expect(serialize(g).groups).toBeUndefined();
  });

  it('groupIds を指定するとメンバーごと書き出す', () => {
    const g = new Graph();
    g.load(sample());
    const data = serialize(g, { groupIds: ['g1'] });
    expect(data.groups.map((x) => x.id)).toEqual(['g1']);
    expect(data.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(data.edges.map((e) => e.id)).toEqual(['ab']);
  });

  it('validate は壊れたグループを補正し、重複 ID はエラーにする', () => {
    const r = parse({ groups: [{ id: 'g', width: -1, label: 3 }, 'x'], nodes: [{ id: 'n', group: 5 }] });
    expect(r.ok).toBe(true);
    expect(r.data.groups[0]).toMatchObject({ id: 'g', x: 0, y: 0, width: 320, height: 200, label: '3' });
    expect(r.data.nodes[0].group).toBe('5');
    expect(r.warnings.some((w) => w.includes('groups[1]'))).toBe(true);
    expect(parse({ groups: [{ id: 'g' }, { id: 'g' }] }).ok).toBe(false);
    expect(parse({ groups: {} }).ok).toBe(false);
  });

  it('remapForMerge は衝突するグループ ID を付け替え、メンバーの参照も追従する', () => {
    const g = new Graph();
    g.load(sample());
    const r = remapForMerge(sample(), g, { offset: { x: 10, y: 20 } });
    const gid = r.groups[0].id;
    expect(gid).not.toBe('g1');
    expect(r.groups[0]).toMatchObject({ x: 10, y: 20 });
    expect(r.nodes.filter((n) => n.group === gid)).toHaveLength(2);
  });
});

describe('NodeEditor: グループ', () => {
  let editor;
  let canvas;
  beforeAll(() => installDom());
  beforeEach(() => {
    canvas = makeCanvas();
    editor = new NodeEditor(canvas, {});
    editor.load(sample());
  });
  afterEach(() => {
    editor.destroy();
    editor = null;
  });

  /** ワールド座標でポインタを押して動かして離す */
  function drag(from, to) {
    const a = editor.viewport.toScreen(from.x, from.y);
    const b = editor.viewport.toScreen(to.x, to.y);
    const ev = (p) => ({ pointerId: 1, button: 0, clientX: p.x, clientY: p.y, shiftKey: false, ctrlKey: false, metaKey: false });
    canvas._emit('pointerdown', ev(a));
    canvas._emit('pointermove', ev({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
    canvas._emit('pointermove', ev(b));
    canvas._emit('pointerup', ev(b));
  }

  it('hitTest: ノードの外のグループ内は group、ラベル帯は header、右下は group-resize', () => {
    expect(editor.hitTest(300, 280)).toMatchObject({ type: 'group', header: false });
    expect(editor.hitTest(300, 5)).toMatchObject({ type: 'group', header: true });
    expect(editor.hitTest(398, 298).type).toBe('group-resize');
    // ノードの上はノードが優先
    expect(editor.hitTest(30, 45).type).toBe('node');
    expect(editor.hitTest(500, 500).type).toBe('none');
  });

  it('グループの空き部分をドラッグするとメンバーごと動き、1 回の Undo で戻る', () => {
    drag({ x: 300, y: 280 }, { x: 340, y: 300 });
    expect(editor.selection.groups.has('g1')).toBe(true);
    expect(pos(editor.graph, 'g1')).toEqual({ x: 40, y: 20 });
    expect(pos(editor.graph, 'a')).toEqual({ x: 60, y: 60 });
    expect(pos(editor.graph, 'c')).toEqual({ x: 600, y: 40 });
    editor.undo();
    expect(pos(editor.graph, 'g1')).toEqual({ x: 0, y: 0 });
    expect(pos(editor.graph, 'a')).toEqual({ x: 20, y: 40 });
    expect(editor.canUndo).toBe(false);
  });

  it('ノードをグループの外へドラッグすると外れ、中へドラッグすると入る（同じ Undo 単位）', () => {
    drag({ x: 30, y: 45 }, { x: 830, y: 45 });
    expect(editor.graph.getNode('a').group).toBeUndefined();
    editor.undo();
    expect(editor.graph.getNode('a').group).toBe('g1');
    expect(pos(editor.graph, 'a')).toEqual({ x: 20, y: 40 });

    drag({ x: 610, y: 45 }, { x: 110, y: 205 });
    expect(editor.graph.getNode('c').group).toBe('g1');
  });

  it('groupOnDrop: false ならドラッグしても所属は変わらない', () => {
    editor.options.groupOnDrop = false;
    drag({ x: 30, y: 45 }, { x: 830, y: 45 });
    expect(editor.graph.getNode('a').group).toBe('g1');
  });

  it('右下のグリップでリサイズでき、最小サイズで止まる', () => {
    drag({ x: 398, y: 298 }, { x: 498, y: 348 });
    expect(editor.getGroup('g1')).toMatchObject({ width: 500, height: 350 });
    drag({ x: 498, y: 348 }, { x: 10, y: 10 });
    expect(editor.getGroup('g1')).toMatchObject({ width: editor.theme.group.minWidth, height: editor.theme.group.minHeight });
    editor.undo();
    editor.undo();
    expect(editor.getGroup('g1')).toMatchObject({ width: 400, height: 300 });
  });

  it('groupSelection は選択ノードを囲むグループを作り、Undo 1 回で消える', () => {
    editor.select({ nodes: ['c'] });
    const g = editor.groupSelection({ label: '後処理' });
    expect(g.label).toBe('後処理');
    expect(editor.graph.getNode('c').group).toBe(g.id);
    expect(editor.selection.groups.has(g.id)).toBe(true);
    const r = editor.graph.groupRect(g);
    const c = editor.graph.nodeRect('c');
    expect(r.x).toBeLessThan(c.x);
    expect(r.y + r.h).toBeGreaterThan(c.y + c.h);
    editor.undo();
    expect(editor.graph.groups.has(g.id)).toBe(false);
    expect(editor.graph.getNode('c').group).toBeUndefined();
  });

  it('ungroup は枠だけ消してメンバーを選択する', () => {
    editor.select({ groups: ['g1'] });
    expect(editor.ungroup()).toEqual(['a', 'b']);
    expect(editor.graph.groups.size).toBe(0);
    expect([...editor.selection.nodes]).toEqual(['a', 'b']);
  });

  it('グループを選んで削除するとメンバーも消え、Undo で全部戻る', () => {
    editor.select({ groups: ['g1'] });
    editor.deleteSelection();
    expect(editor.graph.groups.size).toBe(0);
    expect([...editor.graph.nodes.keys()]).toEqual(['c']);
    expect(editor.selection.groups.size).toBe(0);
    editor.undo();
    expect(editor.graph.groupMembers('g1')).toHaveLength(2);
    expect(editor.graph.edges.size).toBe(2);
  });

  it('範囲選択は完全に含まれるグループも選ぶ', () => {
    editor.selectInRect({ x: -10, y: -10, w: 420, h: 320 });
    expect([...editor.selection.groups]).toEqual(['g1']);
    expect([...editor.selection.nodes].sort()).toEqual(['a', 'b']);
  });

  it('グループの複製はメンバーを選択に入れず、グループだけ選ぶ', () => {
    editor.select({ groups: ['g1'] });
    const r = editor.duplicateSelection();
    expect(r.groups).toHaveLength(1);
    expect([...editor.selection.groups]).toEqual([r.groups[0].id]);
    expect(editor.selection.nodes.size).toBe(0);
  });

  it('コピー＆貼り付けでグループとメンバーが新しい ID で増える', () => {
    editor.select({ groups: ['g1'] });
    editor.copySelection();
    const r = editor.paste({ x: 1000, y: 1000 });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ x: 1000, y: 1000 });
    expect(editor.graph.groupMembers(r.groups[0].id)).toHaveLength(2);
  });

  it('insertJSON はグループごと追加し、グループの左上を基準に置ける', () => {
    const r = editor.insertJSON(sample(), { at: { x: 0, y: 1000 }, anchor: 'top-left' });
    expect(r.ok).toBe(true);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ x: 0, y: 1000 });
    expect(editor.graph.groupMembers(r.groups[0].id)).toHaveLength(2);
  });

  it('矢印キーの移動でもグループのメンバーが一緒に動く', () => {
    editor.select({ groups: ['g1'] });
    editor.nudgeSelection(10, 0);
    expect(pos(editor.graph, 'g1')).toEqual({ x: 10, y: 0 });
    expect(pos(editor.graph, 'a')).toEqual({ x: 30, y: 40 });
  });

  it('グループの右クリックメニューを出せる', () => {
    const p = editor.viewport.toScreen(300, 280);
    let detail = null;
    editor.on('context:menu', (d) => (detail = d));
    canvas._emit('contextmenu', { clientX: p.x, clientY: p.y, preventDefault: () => {} });
    expect(detail.type).toBe('group');
    expect(detail.group.id).toBe('g1');
    expect(editor.selection.groups.has('g1')).toBe(true);
    const items = defaultContextMenuItems({ ...detail, el: {}, editor, graph: editor.graph });
    const ids = items.map((it) => it.id).filter(Boolean);
    expect(ids).toEqual(expect.arrayContaining(['group-rename', 'group-fit', 'ungroup', 'group-delete']));
  });

  it('グループのラベルをダブルクリックすると group:edit が出る', () => {
    let detail = null;
    editor.on('group:edit', (d) => (detail = d));
    const p = editor.viewport.toScreen(300, 5);
    canvas._emit('dblclick', { clientX: p.x, clientY: p.y });
    expect(detail.group.id).toBe('g1');
  });
});

describe('NodeEditor: 置いた位置でグループが決まる', () => {
  let editor;
  beforeAll(() => installDom());
  beforeEach(() => {
    editor = new NodeEditor(makeCanvas(), {});
    editor.load(sample());
  });
  afterEach(() => {
    editor.destroy();
    editor = null;
  });

  it('addNodeAt はグループの中に置けばメンバーになり、外なら入らない', () => {
    const inside = editor.addNodeAt({ title: '中' }, { at: { x: 200, y: 250 } });
    expect(inside.group).toBe('g1');
    const outside = editor.addNodeAt({ title: '外' }, { at: { x: 1000, y: 1000 } });
    expect(outside.group).toBeUndefined();
    const explicit = editor.addNodeAt({ title: '指定', group: 'g1' }, { at: { x: 1000, y: 1000 } });
    expect(explicit.group).toBe('g1');
  });

  it('グループのメンバーだけをコピーして外に貼り付けると、元のグループには入らない', () => {
    editor.select({ nodes: ['a'] });
    editor.copySelection();
    const far = editor.paste({ x: 1000, y: 1000 });
    expect(far.nodes[0].group).toBeUndefined();
    const near = editor.paste({ x: 100, y: 200 });
    expect(near.nodes[0].group).toBe('g1');
  });

  it('insertJSON で外のノードをグループの上に置くとメンバーになる', () => {
    const r = editor.insertJSON({ nodes: [{ id: 'z', x: 0, y: 0, title: 'Z' }], edges: [] }, { at: { x: 100, y: 200 } });
    expect(r.nodes[0].group).toBe('g1');
  });

  it('複製はずらした先がグループの外なら外れ、Undo 1 回で消える', () => {
    editor.select({ nodes: ['b'] });
    const r = editor.duplicateSelection({ x: 400, y: 0 });
    expect(editor.graph.getNode(r.nodes[0].id).group).toBeUndefined();
    editor.select({ nodes: ['a'] });
    const r2 = editor.duplicateSelection({ x: 10, y: 10 });
    expect(editor.graph.getNode(r2.nodes[0].id).group).toBe('g1');
    editor.undo();
    expect(editor.graph.nodes.has(r2.nodes[0].id)).toBe(false);
  });

  it('groupOnDrop: false なら貼り付けても元のグループのまま', () => {
    editor.options.groupOnDrop = false;
    editor.select({ nodes: ['a'] });
    editor.copySelection();
    expect(editor.paste({ x: 1000, y: 1000 }).nodes[0].group).toBe('g1');
    expect(editor.addNodeAt({ title: '中' }, { at: { x: 200, y: 250 } }).group).toBeUndefined();
  });
});

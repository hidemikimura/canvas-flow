import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installDom, makeCanvas } from './helpers/editor-stub.js';
import { NodeEditor } from '../src/core/editor.js';
import { defaultContextMenuItems } from '../src/lit/context-menu.js';

let editor;
let canvas;

beforeAll(() => installDom());

beforeEach(() => {
  canvas = makeCanvas();
  editor = new NodeEditor(canvas, {});
  editor.load({
    nodes: [
      {
        id: 'a', x: 0, y: 0, title: 'A', input: true, output: true,
        items: [{ id: 'i1', label: 'x', input: true, output: true }],
        childs: [{ id: 'a1', title: '子', input: true, output: true }],
      },
      { id: 'b', x: 400, y: 0, title: 'B', input: true, output: true },
    ],
    edges: [{ id: 'ab', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' }],
  });
});

afterEach(() => {
  editor.destroy();
  editor = null;
});

/** ワールド座標を指して右クリックする */
function rightClick(wx, wy) {
  const p = editor.viewport.toScreen(wx, wy);
  let prevented = false;
  canvas._emit('contextmenu', {
    clientX: p.x,
    clientY: p.y,
    preventDefault: () => (prevented = true),
  });
  return prevented;
}

const center = (id) => {
  const r = editor.graph.nodeRect(id);
  return [r.x + r.w / 2, r.y + 8];
};

describe('context:menu イベント', () => {
  it('右クリックで発火し、ブラウザ既定のメニューは抑制する', () => {
    const seen = [];
    editor.on('context:menu', (d) => seen.push(d));
    const prevented = rightClick(...center('a'));
    expect(prevented).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0].type).toBe('node');
    expect(seen[0].node.id).toBe('a');
    expect(seen[0].screen).toBeTruthy();
    expect(seen[0].selection.nodes).toEqual(['a']);
  });

  it('未選択のノードを右クリックすると選択する', () => {
    editor.clearSelection();
    rightClick(...center('b'));
    expect([...editor.selection.nodes]).toEqual(['b']);
  });

  it('選択中のノードを右クリックしたら複数選択を保つ', () => {
    editor.select({ nodes: ['a', 'b'] });
    rightClick(...center('b'));
    expect([...editor.selection.nodes].sort()).toEqual(['a', 'b']);
  });

  it('子ノードを右クリックすると一番外側の親が選択される（対象は子のまま）', () => {
    editor.clearSelection();
    const seen = [];
    editor.on('context:menu', (d) => seen.push(d));
    rightClick(...center('a1'));
    expect([...editor.selection.nodes]).toEqual(['a']);
    expect(seen[0].node.id).toBe('a1');
  });

  it('項目の上ではその項目が detail に入る', () => {
    const seen = [];
    editor.on('context:menu', (d) => seen.push(d));
    const r = editor.graph.itemRect(editor.graph.getNode('a'), 'i1');
    rightClick(r.x + 40, r.y + r.h / 2);
    expect(seen[0].type).toBe('item');
    expect(seen[0].item.id).toBe('i1');
  });

  it('未選択のコネクタを右クリックすると選択する', () => {
    editor.clearSelection();
    const seen = [];
    editor.on('context:menu', (d) => seen.push(d));
    const p = editor.graph.edgePoint(editor.graph.getEdge('ab'), 0.5);
    rightClick(p.x, p.y);
    expect(['edge', 'edge-delete']).toContain(seen[0].type);
    expect([...editor.selection.edges]).toEqual(['ab']);
  });

  it('空白では type: none で、選択は変えない', () => {
    editor.select({ nodes: ['a'] });
    const seen = [];
    editor.on('context:menu', (d) => seen.push(d));
    rightClick(-500, -500);
    expect(seen[0].type).toBe('none');
    expect(seen[0].node).toBe(null);
    expect([...editor.selection.nodes]).toEqual(['a']);
  });
});

describe('defaultContextMenuItems', () => {
  /** Web Component の代わりに呼び出しを記録するだけのスタブ */
  function fakeEl() {
    const calls = [];
    const rec = (name) => (...args) => void calls.push([name, ...args]);
    return {
      calls,
      duplicateSelection: rec('duplicateSelection'),
      editNote: rec('editNote'),
      setNote: rec('setNote'),
      deleteSelection: rec('deleteSelection'),
      deleteSelectedEdges: rec('deleteSelectedEdges'),
      addChild: rec('addChild'),
      detachChild: rec('detachChild'),
      removeNode: rec('removeNode'),
      removeEdge: rec('removeEdge'),
      setEdgeType: rec('setEdgeType'),
      selectFocused: rec('selectFocused'),
      selectConnected: rec('selectConnected'),
      focusNode: rec('focusNode'),
      addNodeAt: rec('addNodeAt'),
      autoLayout: rec('autoLayout'),
      fitView: rec('fitView'),
      resetZoom: rec('resetZoom'),
      downloadJSON: rec('downloadJSON'),
    };
  }

  const build = (detail) => {
    const el = fakeEl();
    const ctx = { ...detail, el, editor, graph: editor.graph };
    return { el, ctx, items: defaultContextMenuItems(ctx) };
  };
  const ids = (items) => items.filter((i) => i.type !== 'separator').map((i) => i.id);
  const run = (items, id, ctx) => items.find((i) => i.id === id).run(ctx);

  it('ノードでは編集・子ノード・選択・コピー系が出る', () => {
    editor.select({ nodes: ['a'] });
    const { items } = build({ type: 'node', node: editor.graph.getNode('a') });
    expect(ids(items)).toEqual([
      'duplicate', 'delete', 'delete-edges', 'add-child', 'select-focused', 'select-connected',
      'note-add', 'copy', 'center',
    ]);
    // 区切り線が先頭・末尾に来ない
    expect(items[0].type).not.toBe('separator');
    expect(items.at(-1).type).not.toBe('separator');
  });

  it('複数選択のときはラベルに件数が入る', () => {
    editor.select({ nodes: ['a', 'b'] });
    const { items } = build({ type: 'node', node: editor.graph.getNode('b') });
    expect(items.find((i) => i.id === 'delete').label).toBe('2 件を削除');
  });

  it('コネクタが選択されていなければ「つながりを外す」は無効', () => {
    editor.select({ nodes: ['a'] });
    const { items } = build({ type: 'node', node: editor.graph.getNode('a') });
    expect(items.find((i) => i.id === 'delete-edges').disabled).toBe(true);
    editor.select({ nodes: ['a', 'b'] });
    const again = build({ type: 'node', node: editor.graph.getNode('a') }).items;
    expect(again.find((i) => i.id === 'delete-edges').disabled).toBe(false);
  });

  it('子ノードではその子だけに効く項目に差し替わる', () => {
    editor.select({ nodes: ['a'] });
    const { el, ctx, items } = build({ type: 'node', node: editor.graph.getNode('a1') });
    expect(ids(items)).toContain('duplicate-child');
    expect(ids(items)).toContain('delete-child');
    expect(ids(items)).toContain('detach-child');
    expect(ids(items)).not.toContain('delete');
    run(items, 'delete-child', ctx);
    expect(el.calls).toEqual([['removeNode', 'a1']]);
  });

  it('コネクタでは削除と描画方法の切り替えが出る（現在の方法は無効）', () => {
    const edge = editor.graph.getEdge('ab');
    const { el, ctx, items } = build({ type: 'edge', edge });
    expect(ids(items)).toEqual(['delete-edge', 'edge-bezier', 'edge-straight', 'edge-step', 'note-add', 'select-ends']);
    expect(items.find((i) => i.id === 'edge-bezier').disabled).toBe(true);
    run(items, 'edge-step', ctx);
    expect(el.calls).toEqual([['setEdgeType', 'step', ['ab']]]);
    run(items, 'select-ends', ctx);
    expect([...editor.selection.nodes].sort()).toEqual(['a', 'b']);
  });

  it('メモが付いていれば編集・削除、無ければ追加が出る', () => {
    editor.select({ nodes: ['a'] });
    const before = build({ type: 'node', node: editor.graph.getNode('a') }).items;
    expect(ids(before)).toContain('note-add');
    expect(ids(before)).not.toContain('note-remove');

    editor.graph.setNote('a', '要確認');
    const { el, ctx, items } = build({ type: 'node', node: editor.graph.getNode('a') });
    expect(ids(items)).toContain('note-edit');
    expect(ids(items)).toContain('note-remove');
    el.editNote = (t) => el.calls.push(['editNote', typeof t === 'string' ? t : t.id]);
    el.setNote = (t, v) => el.calls.push(['setNote', typeof t === 'string' ? t : t.id, v]);
    run(items, 'note-edit', ctx);
    run(items, 'note-remove', ctx);
    expect(el.calls).toEqual([
      ['editNote', 'a'],
      ['setNote', 'a', null],
    ]);
  });

  it('空白では追加・選択・ビュー系が出る', () => {
    editor.clearSelection();
    const { el, ctx, items } = build({ type: 'none', x: 120, y: 80 });
    expect(ids(items)).toEqual(['add-node', 'paste', 'select-all', 'clear-selection', 'layout', 'fit', 'reset-zoom', 'export']);
    expect(items.find((i) => i.id === 'clear-selection').disabled).toBe(true);
    run(items, 'add-node', ctx);
    expect(el.calls[0][0]).toBe('addNodeAt');
    expect(el.calls[0][2]).toMatchObject({ at: { x: 120, y: 80 }, anchor: 'header' });
  });
});

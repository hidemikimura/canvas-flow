import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installDom, makeCanvas } from './helpers/editor-stub.js';
import { NodeEditor } from '../src/core/editor.js';

/**
 * A → B → C / A → E / D → E / E → F、さらに C ⇢ D（goto）
 * focusPreview() は「このノードを選んだら何が強調されるか」を、選択を変えずに返す。
 */
const NODES = ['A', 'B', 'C', 'D', 'E', 'F'];
const EDGES = [
  ['AB', 'A', 'B'],
  ['BC', 'B', 'C'],
  ['AE', 'A', 'E'],
  ['DE', 'D', 'E'],
  ['EF', 'E', 'F'],
];

let editor;
const sorted = (a) => [...a].sort().join(',');

beforeAll(() => installDom());

beforeEach(() => {
  editor = new NodeEditor(makeCanvas(), { focusMode: 'connected', focusDirection: 'lineage' });
  editor.load({
    nodes: NODES.map((id, i) => ({ id, x: i * 250, y: 0, title: id, input: true, output: true })),
    edges: EDGES.map(([id, source, target]) => ({ id, source, sourcePort: 'out', target, targetPort: 'in' })),
  });
});

afterEach(() => {
  editor.destroy();
});

describe('focusPreview', () => {
  it('選択していないノードでも強調対象を返す', () => {
    expect(editor.selection.nodes.size).toBe(0);
    const r = editor.focusPreview('B');
    expect(sorted(r.nodes)).toBe('A,B,C');
    expect(sorted(r.edges)).toBe('AB,BC');
    expect(r.mode).toBe('connected');
    expect(r.direction).toBe('lineage');
  });

  it('選択も強調表示の設定も変えない', () => {
    editor.select({ nodes: ['E'] });
    const before = editor.focusSet();
    const beforeNodes = sorted(before.nodes);
    editor.focusPreview('B', { mode: 'neighbors', direction: 'downstream', depth: 1 });
    expect([...editor.selection.nodes]).toEqual(['E']);
    expect(editor.focusMode).toBe('connected');
    expect(editor.options.focusDirection).toBe('lineage');
    expect(sorted(editor.focusSet().nodes)).toBe(beforeNodes);
  });

  it('実際に選択したときの focusSet と一致する', () => {
    const preview = editor.focusPreview('E');
    editor.select({ nodes: ['E'] });
    const actual = editor.focusSet();
    expect(sorted(preview.nodes)).toBe(sorted(actual.nodes));
    expect(sorted(preview.edges)).toBe(sorted(actual.edges));
  });

  it('複数ノードを起点にできる（配列・ノードオブジェクトの両方）', () => {
    const byIds = editor.focusPreview(['B', 'D']);
    expect(sorted(byIds.nodes)).toBe('A,B,C,D,E,F');
    const byNodes = editor.focusPreview([editor.graph.nodes.get('B'), editor.graph.nodes.get('D')]);
    expect(sorted(byNodes.nodes)).toBe(sorted(byIds.nodes));
  });

  it('向きを指定できる', () => {
    expect(sorted(editor.focusPreview('E', { direction: 'downstream' }).nodes)).toBe('E,F');
    expect(sorted(editor.focusPreview('E', { direction: 'upstream' }).nodes)).toBe('A,D,E');
    expect(sorted(editor.focusPreview('E', { direction: 'both' }).nodes)).toBe('A,B,C,D,E,F');
    expect(sorted(editor.focusPreview('E', { direction: 'lineage' }).nodes)).toBe('A,D,E,F');
  });

  it('neighbors は depth の段数だけ辿る', () => {
    expect(sorted(editor.focusPreview('B', { mode: 'neighbors' }).nodes)).toBe('A,B,C');
    expect(sorted(editor.focusPreview('C', { mode: 'neighbors', depth: 1 }).nodes)).toBe('B,C');
    expect(sorted(editor.focusPreview('C', { mode: 'neighbors', depth: 2 }).nodes)).toBe('A,B,C');
  });

  it('省略した項目は現在の設定を使う', () => {
    editor.setFocusMode('neighbors', { depth: 1, direction: 'downstream' });
    const r = editor.focusPreview('A');
    expect(r.mode).toBe('neighbors');
    expect(r.direction).toBe('downstream');
    expect(sorted(r.nodes)).toBe('A,B,E');
  });

  it('focusMode が off でも connected として計算する', () => {
    editor.setFocusMode('off');
    const r = editor.focusPreview('B');
    expect(r.mode).toBe('connected');
    expect(sorted(r.nodes)).toBe('A,B,C');
  });

  it("mode: 'off' を明示したときだけ空を返す", () => {
    const r = editor.focusPreview('B', { mode: 'off' });
    expect(r).toEqual({ mode: 'off', direction: 'lineage', nodes: [], edges: [], links: [] });
  });

  it('goto も辿り、links に入る（links: false で除外）', () => {
    editor.graph.setGoto('C', 'D');
    const on = editor.focusPreview('A', { direction: 'downstream' });
    expect(sorted(on.nodes)).toBe('A,B,C,D,E,F');
    expect(on.links.length).toBe(1);
    const off = editor.focusPreview('A', { direction: 'downstream', links: false });
    expect(sorted(off.nodes)).toBe('A,B,C,E,F');
    expect(off.links).toEqual([]);
  });

  it('includeStart: false で起点を外せる', () => {
    const r = editor.focusPreview('B', { includeStart: false });
    expect(sorted(r.nodes)).toBe('A,C');
  });

  it('存在しない ID・空の指定は空の結果になる', () => {
    expect(editor.focusPreview('存在しない').nodes).toEqual([]);
    expect(editor.focusPreview([]).nodes).toEqual([]);
    expect(editor.focusPreview(null).nodes).toEqual([]);
    expect(sorted(editor.focusPreview(['B', '存在しない']).nodes)).toBe('A,B,C');
  });

  it('readOnly でも使える（問い合わせ専用なので）', () => {
    editor.setReadOnly?.(true) ?? (editor.options.readOnly = true);
    expect(sorted(editor.focusPreview('B').nodes)).toBe('A,B,C');
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installDom, makeCanvas } from './helpers/editor-stub.js';
import { NodeEditor } from '../src/core/editor.js';

/**
 * A → B → C / A → E / D → E / E → F
 * lineage で B を選ぶと A・B・C・E・F が強調され、D だけ薄くなる。
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

beforeAll(() => installDom());

beforeEach(() => {
  editor = new NodeEditor(makeCanvas(), { focusMode: 'connected' });
  editor.load({
    nodes: NODES.map((id, i) => ({ id, x: i * 250, y: 0, title: id, input: true, output: true })),
    edges: EDGES.map(([id, source, target]) => ({ id, source, sourcePort: 'out', target, targetPort: 'in' })),
  });
});

afterEach(() => {
  editor.destroy();
  editor = null;
});

const sel = () => ({
  nodes: [...editor.selection.nodes].sort(),
  edges: [...editor.selection.edges].sort(),
});

describe('selectFocused', () => {
  it('強調表示されている要素をそのまま選択する', () => {
    editor.select({ nodes: ['B'] });
    const focus = editor.focusSet();
    const result = editor.selectFocused();
    expect(result.nodes.sort()).toEqual([...focus.nodes].sort());
    expect(result.edges.sort()).toEqual([...focus.edges].sort());
    expect(sel()).toEqual({ nodes: ['A', 'B', 'C', 'E', 'F'], edges: ['AB', 'AE', 'BC', 'EF'] });
    // 別系統の D と D→E は選ばれない
    expect(editor.selection.nodes.has('D')).toBe(false);
    expect(editor.selection.edges.has('DE')).toBe(false);
  });

  it('選択が空なら何もせず null', () => {
    editor.clearSelection();
    expect(editor.selectFocused()).toBe(null);
    expect(sel()).toEqual({ nodes: [], edges: [] });
  });

  it('既定は置き換え、additive で追加になる', () => {
    editor.select({ nodes: ['D'] });
    editor.selectFocused();
    expect(sel().nodes).toEqual(['D', 'E', 'F']); // 置き換え（D の流れだけ）

    editor.select({ nodes: ['D'] });
    editor.selectFocused({ additive: true });
    expect(sel().nodes).toEqual(['D', 'E', 'F']);

    editor.select({ nodes: ['B'] });
    editor.selectFocused({ additive: true });
    expect(sel().nodes).toEqual(['A', 'B', 'C', 'E', 'F']);
    editor.select({ nodes: ['D'] }, { additive: true });
    editor.selectFocused({ additive: true });
    expect(sel().nodes).toEqual(NODES); // D の流れも足されて全部
  });

  it('強調表示が無効でも設定どおりに辿って選択する', () => {
    editor.setFocusMode('off');
    editor.select({ nodes: ['B'] });
    expect(editor.focusSet()).toBe(null);
    editor.selectFocused();
    expect(sel().nodes).toEqual(['A', 'B', 'C', 'E', 'F']);
  });

  it('depth / direction を渡すとその条件で辿り直す', () => {
    editor.select({ nodes: ['B'] });
    editor.selectFocused({ direction: 'downstream' });
    expect(sel()).toEqual({ nodes: ['B', 'C'], edges: ['BC'] });

    editor.select({ nodes: ['A'] });
    editor.selectFocused({ direction: 'both', depth: 1 });
    expect(sel().nodes).toEqual(['A', 'B', 'E']);
  });

  it("neighbors のときは focusDepth の範囲だけ選ぶ", () => {
    editor.setFocusMode('neighbors', { depth: 1, direction: 'downstream' });
    editor.select({ nodes: ['A'] });
    editor.selectFocused();
    expect(sel()).toEqual({ nodes: ['A', 'B', 'E'], edges: ['AB', 'AE'] });
  });

  it('focus:select イベントが発火する', () => {
    const seen = [];
    editor.on('focus:select', (d) => seen.push(d));
    editor.select({ nodes: ['B'] });
    editor.selectFocused();
    expect(seen.length).toBe(1);
    expect(seen[0].mode).toBe('connected');
    expect(seen[0].nodes.sort()).toEqual(['A', 'B', 'C', 'E', 'F']);
    expect(seen[0].edges.sort()).toEqual(['AB', 'AE', 'BC', 'EF']);
  });

  it('読み取り専用でも選択できる', () => {
    editor.options.readOnly = true;
    editor.select({ nodes: ['B'] });
    expect(editor.selectFocused().nodes.length).toBe(5);
  });

  it('選択した範囲をそのまま強調対象として固定する（押すたびに広がらない）', () => {
    editor.select({ nodes: ['B'] });
    editor.selectFocused();
    const first = sel();
    // 強調対象は選択と一致する（E の上流である D は増えない）
    expect([...editor.focusSet().nodes].sort()).toEqual(first.nodes);
    editor.selectFocused();
    expect(sel()).toEqual(first);
    // 別の選択に変えると通常の計算に戻る
    editor.select({ nodes: ['E'] });
    expect([...editor.focusSet().nodes].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('focus:change は固定後の範囲で 1 回だけ発火する', () => {
    editor.select({ nodes: ['B'] });
    const seen = [];
    editor.on('focus:change', (d) => seen.push([...d.nodes].sort().join('')));
    editor.selectFocused();
    expect(seen).toEqual(['ABCEF']);
  });

  it('固定した強調対象はグラフを変更すると作り直される', () => {
    editor.select({ nodes: ['B'] });
    editor.selectFocused();
    editor.graph.addEdge({ id: 'CD', source: 'C', sourcePort: 'out', target: 'D', targetPort: 'in' });
    expect([...editor.focusSet().nodes].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

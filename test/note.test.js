import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Graph, normalizeNote, rectsOverlap } from '../src/core/graph.js';
import { History } from '../src/core/history.js';
import { serialize, parse } from '../src/core/serializer.js';
import { installDom, makeCanvas } from './helpers/editor-stub.js';
import { NodeEditor } from '../src/core/editor.js';

function build() {
  const g = new Graph();
  g.addNode({ id: 'a', x: 0, y: 0, title: 'A', input: true, output: true });
  g.addNode({ id: 'b', x: 400, y: 0, title: 'B', input: true, output: true });
  g.addEdge({ id: 'ab', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' });
  return g;
}

describe('normalizeNote', () => {
  it('文字列とオブジェクトを受け付け、空や不正は null', () => {
    expect(normalizeNote('要確認')).toEqual({ text: '要確認' });
    expect(normalizeNote('  余白は落とす  ')).toEqual({ text: '余白は落とす' });
    expect(normalizeNote({ text: '暫定', color: 'amber' })).toEqual({ text: '暫定', color: 'amber' });
    expect(normalizeNote({ text: '  ' })).toBe(null);
    expect(normalizeNote('')).toBe(null);
    expect(normalizeNote(null)).toBe(null);
    expect(normalizeNote(42)).toBe(null);
    expect(normalizeNote({ color: 'red' })).toBe(null);
  });
});

describe('メモ（note）', () => {
  it('ノードとコネクタの両方に付けられる', () => {
    const g = build();
    g.setNote('a', '要確認');
    g.setNote('ab', { text: '暫定の経路', color: 'amber' });
    expect(g.noteOf('a')).toEqual({ text: '要確認' });
    expect(g.noteOf('ab')).toEqual({ text: '暫定の経路', color: 'amber' });
    expect(g.notes()).toEqual([
      { kind: 'node', id: 'a', note: { text: '要確認' } },
      { kind: 'edge', id: 'ab', note: { text: '暫定の経路', color: 'amber' } },
    ]);
  });

  it('オブジェクトを渡しても引ける（ノードとコネクタを見分ける）', () => {
    const g = build();
    const edge = g.getEdge('ab');
    g.setNote(edge, 'コネクタ側');
    g.setNote(g.getNode('a'), 'ノード側');
    expect(g.noteOf(edge)).toEqual({ text: 'コネクタ側' });
    expect(g.noteOf(g.getNode('a'))).toEqual({ text: 'ノード側' });
  });

  it('null や空文字で削除できる。Undo で戻る', () => {
    const g = build();
    const history = new History(g);
    g.setNote('a', 'メモ');
    expect(g.noteOf('a')).toEqual({ text: 'メモ' });
    g.setNote('a', null);
    expect(g.noteOf('a')).toBe(null);
    expect(g.getNode('a').note).toBeUndefined();
    history.undo();
    expect(g.noteOf('a')).toEqual({ text: 'メモ' });
    history.undo();
    expect(g.noteOf('a')).toBe(null);
  });

  it('存在しない対象には何もしない', () => {
    const g = build();
    expect(g.setNote('missing', 'x')).toBe(null);
    expect(g.noteOf('missing')).toBe(null);
    expect(g.noteOf(null)).toBe(null);
  });

  it('JSON にそのまま残る', () => {
    const g = build();
    g.setNote('a', { text: '要確認', color: 'red' });
    g.setNote('ab', 'あとで直す');
    const out = serialize(g);
    expect(out.nodes.find((n) => n.id === 'a').note).toEqual({ text: '要確認', color: 'red' });
    expect(out.edges[0].note).toEqual({ text: 'あとで直す' });

    const g2 = new Graph();
    g2.load(parse(JSON.stringify(out)).data);
    expect(g2.noteOf('a')).toEqual({ text: '要確認', color: 'red' });
    expect(g2.noteOf('ab')).toEqual({ text: 'あとで直す' });
  });

  it('解釈できないメモは警告付きで落とす', () => {
    const parsed = parse({ nodes: [{ id: 'a', x: 0, y: 0, note: 42 }], edges: [] });
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings.length).toBe(1);
    expect(parsed.data.nodes[0].note).toBeUndefined();
  });
});

describe('placeNear（バッジの配置）', () => {
  it('空いている候補を順に探す', () => {
    const g = build();
    const anchor = g.nodeRect('a');
    const first = g.placeNear(anchor, { w: 60, h: 18 }, { ignore: ['a'] });
    // 周りに何も無ければ最初の候補（右上）
    expect(first.placement).toBe('top-right');
    expect(first.free).toBe(true);
  });

  it('ノードと重なる候補は飛ばす', () => {
    const g = build();
    // a の右上を塞ぐようにノードを置く
    g.addNode({ id: 'blocker', x: 150, y: -40, title: 'blocker' });
    const box = g.placeNear(g.nodeRect('a'), { w: 100, h: 18 }, { ignore: ['a'] });
    expect(box.placement).not.toBe('top-right');
    expect(box.free).toBe(true);
    expect(rectsOverlap(box, g.nodeRect('blocker'))).toBe(false);
  });

  it('avoid に渡した矩形とも重ねない', () => {
    const g = build();
    const anchor = g.nodeRect('a');
    const first = g.placeNear(anchor, { w: 60, h: 18 }, { ignore: ['a'] });
    const second = g.placeNear(anchor, { w: 60, h: 18 }, { ignore: ['a'], avoid: [first] });
    expect(second.placement).not.toBe(first.placement);
    expect(rectsOverlap(first, second)).toBe(false);
  });

  it('全部ふさがっていたら最後の候補を返す（free: false）', () => {
    const g = build();
    const anchor = g.nodeRect('a');
    // 全候補を塞ぐ大きな矩形
    const wall = { x: -500, y: -500, w: 1500, h: 1500 };
    const box = g.placeNear(anchor, { w: 60, h: 18 }, { ignore: ['a'], avoid: [wall] });
    expect(box.free).toBe(false);
    expect(box.placement).toBe('inside-top-right');
  });

  it('placements で順番を指定できる', () => {
    const g = build();
    const box = g.placeNear(g.nodeRect('a'), { w: 60, h: 18 }, { ignore: ['a'], placements: ['bottom', 'top'] });
    expect(box.placement).toBe('bottom');
  });
});

describe('描画後のバッジ位置とヒットテスト', () => {
  let editor;
  beforeAll(() => installDom());
  beforeEach(() => {
    editor = new NodeEditor(makeCanvas(), { graph: build() });
    editor.resize(1000, 800); // 表示範囲を作ってから描く（既定は 0 サイズ）
    editor.graph.setNote('a', '要確認');
    editor.graph.setNote('ab', 'あとで直す');
    editor.render();
  });
  afterEach(() => editor.destroy());

  it('描画するとバッジの矩形が記録される', () => {
    const boxes = editor.noteBoxes();
    expect(boxes.map((b) => `${b.kind}:${b.id}`).sort()).toEqual(['edge:ab', 'node:a']);
    expect(boxes.every((b) => b.rect.w > 0 && b.rect.h > 0)).toBe(true);
  });

  it('バッジの上を hitTest すると note が付いてくる', () => {
    const box = editor.noteBoxes().find((b) => b.kind === 'node');
    const hit = editor.hitTest(box.rect.x + box.rect.w / 2, box.rect.y + box.rect.h / 2);
    expect(hit.type).toBe('node');
    expect(hit.note.id).toBe('a');
    expect(hit.note.note.text).toBe('要確認');
    // 少し離れた場所では付かない
    const away = editor.hitTest(box.rect.x - 500, box.rect.y - 500);
    expect(away.note).toBeUndefined();
  });

  it('notes: false ならバッジを描かず判定もしない', () => {
    editor.options.notes = false;
    editor.render();
    expect(editor.noteBoxes()).toEqual([]);
    expect(editor.noteAt(0, 0)).toBe(null);
  });

  it('編集用の API は readOnly では効かない', () => {
    editor.options.readOnly = true;
    expect(editor.setNote('a', '変更')).toBe(null);
    expect(editor.noteOf('a')).toEqual({ text: '要確認' });
  });
});

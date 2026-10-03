# 実装レシピ

よくある組み込みの書き方。コードは要点だけなので、プロジェクトの流儀（TS / JS、状態管理）に合わせて直すこと。

## 目次

1. React
2. Vue 3
3. Svelte
4. Next.js / Nuxt（SSR のあるフレームワーク）
5. 保存と読み込み（debounce・往復変換）
6. ドメインデータからノードを組み立てる
7. 選択したノードを横のパネルで編集する
8. パレットからドラッグ＆ドロップで追加する
9. 接続の制限
10. 右クリックメニューを足す・置き換える
11. インライン編集を自前の UI にする
12. 読み取り専用のビューア
13. ノードの上に情報を重ねる（overlayRenderer）
14. グループをデータから作る

## 1. React

カスタム要素には ref でプロパティを渡し、イベントは `addEventListener` で受けるのが確実（React のバージョンによって、JSX 属性がプロパティになるか HTML 属性になるかが違うため）。

```tsx
import { useEffect, useRef } from 'react';
import '@hidemikimura/canvas-flow';
import type { CanvasFlowEditor, CanvasFlowData } from '@hidemikimura/canvas-flow';

type Props = { initial: CanvasFlowData; onChange?: (data: CanvasFlowData) => void; readOnly?: boolean };

export function FlowEditor({ initial, onChange, readOnly = false }: Props) {
  const ref = useRef<CanvasFlowEditor>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current!;
    el.nodeTypes = { process: { style: { headerFill: '#ede9fe' } } };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current?.(el.toJSON()), 400);
    };
    const init = () => el.load(initial);
    if (el.editor) init();                      // すでに ready 済み
    else el.addEventListener('ready', init, { once: true });
    el.addEventListener('graph-change', handleChange);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('ready', init);
      el.removeEventListener('graph-change', handleChange);
    };
    // initial は最初の 1 回だけ読む（毎回 load すると Undo 履歴と選択が消える）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.readOnly = readOnly;
  }, [readOnly]);

  return <canvas-flow-editor ref={ref} style={{ display: 'block', height: '100%' }} />;
}
```

TypeScript で JSX に `<canvas-flow-editor>` を書くと「存在しない要素」と言われる場合は、宣言を足す:

```ts
// src/canvas-flow.d.ts
import type { CanvasFlowEditor } from '@hidemikimura/canvas-flow';
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'canvas-flow-editor': React.DetailedHTMLProps<React.HTMLAttributes<CanvasFlowEditor>, CanvasFlowEditor> & {
        'read-only'?: boolean; 'edge-type'?: string; 'focus-mode'?: string;
      };
    }
  }
}
```

（React 18 以前はグローバル `JSX` 名前空間に足す。プロジェクトの React の型に合わせること。）

グラフの内容を React の state に毎回コピーしないこと。正はエディタの中にあり、保存時や必要なときに `el.toJSON()` で取り出す。

## 2. Vue 3

`vite.config` でカスタム要素として扱わせる:

```js
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'canvas-flow-editor' } } })
```

```vue
<script setup>
import '@hidemikimura/canvas-flow';
import { ref, onMounted } from 'vue';
const props = defineProps({ initial: Object });
const emit = defineEmits(['change']);
const el = ref(null);
let timer;
onMounted(() => {
  const init = () => el.value.load(props.initial);
  el.value.editor ? init() : el.value.addEventListener('ready', init, { once: true });
});
function onGraphChange() {
  clearTimeout(timer);
  timer = setTimeout(() => emit('change', el.value.toJSON()), 400);
}
</script>

<template>
  <canvas-flow-editor ref="el" style="display:block;height:100%" @graph-change="onGraphChange" />
</template>
```

オブジェクトを渡すときは `:theme.prop="theme"` のように `.prop` を付けるとプロパティとして渡る。グラフデータを `reactive` / `ref` に入れて深く監視しないこと（エディタが中身を書き換えるため、Proxy 越しだと遅くなり、二重管理にもなる）。

## 3. Svelte

```svelte
<script>
  import '@hidemikimura/canvas-flow';
  import { onMount } from 'svelte';
  export let initial;
  let el;
  onMount(() => {
    const init = () => el.load(initial);
    el.editor ? init() : el.addEventListener('ready', init, { once: true });
  });
</script>
<canvas-flow-editor bind:this={el} style="display:block;height:600px" on:graph-change={() => save(el.toJSON())} />
```

## 4. Next.js / Nuxt（SSR のあるフレームワーク）

サーバー側では import できない（Custom Elements と Canvas が無い）。クライアントでだけ読み込む。

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
export default function FlowEditorClient() {
  const [ready, setReady] = useState(false);
  useEffect(() => { import('@hidemikimura/canvas-flow').then(() => setReady(true)); }, []);
  return ready ? <canvas-flow-editor style={{ display: 'block', height: 600 }} /> : null;
}
```

または `next/dynamic(() => import('./FlowEditor'), { ssr: false })`。Nuxt は `<ClientOnly>` で囲み、プラグインを `.client.ts` にする。

## 5. 保存と読み込み

```js
// 読み込み: 外部から来るデータは検証つきで
const r = el.importJSON(await api.get('/flows/1'), { mode: 'replace', fitView: true });
if (!r.ok) showError(r.errors.join('\n'));
else if (r.warnings.length) console.warn('読み込めなかった部分', r.warnings);

// 保存: 変更のたびに debounce して送る
let timer;
el.addEventListener('graph-change', () => {
  clearTimeout(timer);
  timer = setTimeout(() => api.put('/flows/1', el.toJSON()), 500);
});
```

- `toJSON()` は表示位置（viewport）も含む。保存したくなければ `el.editor.exportData({ includeViewport: false })`。
- アプリ独自の保存形式があるなら、「canvas-flow JSON → ドメイン」の変換関数を書き、保存時に通す。ノードの `data` にドメインの id や種別を入れておくと逆変換が楽。
- 「未保存の変更あり」表示は `history-change` か `graph-change` で立て、保存成功で下ろす。

## 6. ドメインデータからノードを組み立てる

例: チャットボットのシナリオ（各ステップに選択肢があり、選択肢ごとに次のステップへ進む）。

```js
function scenarioToGraph(scenario) {
  const nodes = scenario.steps.map((step, i) => ({
    id: step.id,
    type: step.kind,                     // nodeTypes で色分け
    title: step.title,
    x: 0, y: 0,                          // 後で autoLayout に任せる
    input: true,                         // ヘッダ左で受ける
    items: step.choices.map((c) => ({
      id: c.id, label: c.label,
      output: { max: 1 },                // 選択肢ごとに 1 本だけ出せる
    })),
    data: { stepId: step.id },
  }));
  const edges = scenario.steps.flatMap((step) =>
    step.choices.filter((c) => c.next).map((c) => ({
      source: step.id, sourcePort: `item:${c.id}:out`,
      target: c.next, targetPort: 'in',
    })),
  );
  return { nodes, edges };
}

el.load(scenarioToGraph(scenario));
el.autoLayout();                          // 左 → 右に並べ直す（Undo 可）
```

逆変換は `el.toJSON().edges` を `sourcePort` から項目 id を取り出して（`parsePortKey(e.sourcePort).itemId`）選択肢の `next` に戻す。作った JSON は skill 同梱の `scripts/validate-graph.mjs` で確かめる。

## 7. 選択したノードを横のパネルで編集する

```js
el.addEventListener('selection-change', (e) => {
  const [id] = e.detail.nodes;
  panel.show(id ? el.editor.graph.getNode(id) : null);
});
el.addEventListener('node-change', (e) => panel.refreshIf(e.detail.id)); // キャンバス側で編集されたとき

// パネルからの更新（Undo 可）
el.updateNode(id, { title: newTitle, data: { ...node.data, prompt } });
el.updateItem(id, itemId, { label: newLabel });
el.editor.graph.addItem(id, { id: crypto.randomUUID(), label: '新しい選択肢', output: { max: 1 } });
```

パネルに表示するのは取得したノードのコピー（`structuredClone`）にし、元のオブジェクトを直接書き換えない。

## 8. パレットからドラッグ＆ドロップで追加する

```js
paletteItem.draggable = true;
paletteItem.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-node-kind', 'process'));
el.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('application/x-node-kind')) e.preventDefault();
});
el.addEventListener('drop', (e) => {
  const kind = e.dataTransfer.getData('application/x-node-kind');
  if (!kind) return;
  e.preventDefault();
  el.addNodeAt(specFor(kind), { client: { clientX: e.clientX, clientY: e.clientY }, anchor: 'header' });
});
```

複数ノードのテンプレートなら `el.insertJSON(template, { client: {...}, anchor: 'origin' })`。`.json` ファイルのドロップは要素が自分で処理するので、独自の MIME 型を使って区別すること。

## 9. 接続の制限

まずデータで表現できないか考える（理由: 操作中のハイライトや拒否表示が自動で付く）。

- 本数の上限: `output: { max: 1 }` / `input: 1`、全体の既定は `max-inputs` / `max-outputs` 属性。
- そもそもつながせない: そのポートを付けない（`input` / `output` を省略）。
- 満杯なら付け替え: `on-full="replace"`。
- 拒否されたときの通知: `connect-rejected` イベント。

型の相性などデータで表せない規則は、追加後に取り消す:

```js
el.addEventListener('edge-add', (e) => {
  const edge = e.detail;
  if (!isAllowed(edge)) queueMicrotask(() => el.removeEdge(edge.id));
});
```

この方法は一瞬追加されて消えるのと、Undo の履歴に残るのが欠点。プログラムから `addEdge` するときは事前に `graph.connectError(...)` と自前の判定で確かめる。

## 10. 右クリックメニューを足す・置き換える

```js
el.contextMenuItems = (ctx) => [
  ...ctx.defaultItems,                       // 既定の項目を残す
  { type: 'separator' },
  ctx.node && { id: 'open', label: '詳細を開く', run: () => openDetail(ctx.node.id) },
].filter(Boolean);
```

`ctx` は `{ type, node, item, edge, port, group, x, y, screen, client, selection, el, editor, graph, defaultItems }`。項目は `{ id, label, shortcut?, disabled?, danger?, hidden?, run(ctx) }`。メニューごと自前にするなら `context-menu` イベントで `e.preventDefault()` して `e.detail.client` の位置に出す。

## 11. インライン編集を自前の UI にする

```js
el.addEventListener('item-edit', (e) => {
  e.preventDefault();                        // 内蔵の入力欄を出さない
  openDialog(e.detail.node, e.detail.item);
});
```

`node-edit`（`{ node }`）/ `group-edit`（`{ group }`）/ `note-edit` も同じ形。入力欄をキャンバス上の位置に重ねたいときは、コアのイベント `el.editor.on('item:edit', ({ node, item, screenRect }) => ...)` の `screenRect`（キャンバス基準の px）を使う。

## 12. 読み取り専用のビューア

```html
<canvas-flow-editor read-only focus-mode="connected" context-menu="false"></canvas-flow-editor>
```

```js
el.toolbar = false;                           // 属性の "false" では消えない
el.addEventListener('ready', () => { el.load(data); el.fitView(); });
el.addEventListener('node-click', (e) => showDetail(e.detail.node));
```

`focus-mode` を付けると、クリックしたノードの前後の流れが強調され、他は薄くなる。

## 13. ノードの上に情報を重ねる（overlayRenderer）

```js
el.editor.overlayRenderer = (ctx, api) => {
  if (api.lod) return;                       // 縮小表示では省く
  for (const node of api.nodes) {            // 表示範囲内のノードだけ
    const rate = stats[node.id];
    if (rate == null) continue;
    const r = api.graph.nodeRect(node);
    ctx.fillStyle = '#3b82f6';
    api.roundRect(r.x + 8, r.y + r.h - 6, (r.w - 16) * rate, 4, 2);
    ctx.fill();
  }
};
```

ワールド座標で描く。画面上の大きさを一定にしたいものは `api.zoom` で割る。値が変わったら `el.editor.requestRender()`。ノードの描画自体を差し替えるなら `nodeRenderer`（`true` を返すと既定の描画を省略）。

## 14. グループをデータから作る

```js
el.load({ nodes, edges });                    // まずノードを置く
for (const section of sections) {
  el.groupNodes(section.nodeIds, { label: section.name, select: false });  // メンバーを囲む枠を作る
}
el.editor.history.clear();                    // 初期状態を Undo の起点にする
```

座標が決まっているなら JSON の `groups` に直接書いてもよい（`{ id, label, x, y, width, height }`、ノード側に `group: id`）。その場合、枠の上端 24px はラベル帯なのでノードはその下に置く。`autoLayout()` をかけるとノードだけ動いて枠は動かないので、レイアウト後にグループを作るか `el.fitGroup(id)` で合わせる。

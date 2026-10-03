---
name: canvas-flow
description: >-
  @hidemikimura/canvas-flow（Canvas 2D のノードエディタ。Web Component `<canvas-flow-editor>` とフレームワーク非依存の
  `NodeEditor`）を使ってアプリを作る・改修するときの手引き。ノード／項目／ポート／コネクタ（edge）、子ノード（childs）、
  グループ（ラベル付きの枠）、メモ（note）、goto、JSON 保存・読み込み、イベント、テーマ、右クリックメニュー、
  React / Vue / Svelte / 素の HTML への組み込みを扱う。プロジェクトの package.json や import に `canvas-flow` /
  `@hidemikimura/canvas-flow` / `canvas-flow-editor` / `NodeEditor` が出てきたら必ず使うこと。
  「ノードエディタ」「フロー図エディタ」「シナリオ／チャットボットのフロー編集画面」「ワークフローを線でつなぐ UI」
  「ノードを JSON から生成して表示」など、このライブラリで実装しそうな依頼でも、ライブラリ名が出ていなくても使う。
---

# canvas-flow を使うための手引き

canvas-flow は 10,000 ノード規模でも軽い Canvas 2D のノードエディタです。この skill は**ライブラリを利用する側**のコードを書くためのもので、ライブラリ本体を改修するためのものではありません。

学習データにほぼ載っていないライブラリなので、推測で API を書くと高確率で外します。**書く前に下の「確かめ方」で実物を確認**し、この手引きと食い違ったら実物（型定義）を正としてください。

## 確かめ方（最初にやること）

1. バージョンを見る: `node_modules/@hidemikimura/canvas-flow/package.json` の `version`。
   機能によって追加されたバージョンが違います（例: グループと `group-on-drop` は 0.8.0 から）。
2. 使いたい API が本当にあるか、型定義を grep する。型定義が最も信頼できる一次情報です。
   - コア: `node_modules/@hidemikimura/canvas-flow/types/core.d.ts`（`NodeEditor` / `Graph` / データ型 / イベント名と payload）
   - Web Component: `node_modules/@hidemikimura/canvas-flow/types/lit.d.ts`（`CanvasFlowEditor` と `CanvasFlowEditorEventMap`）
3. 詳しい説明が要るときは同梱の `README.md` と `docs/api.html`（パッケージに含まれる）。

## どちらで組み込むか

| 使い方 | import | 向いている場面 |
| --- | --- | --- |
| Web Component `<canvas-flow-editor>` | `import '@hidemikimura/canvas-flow'`（要素が登録される副作用 import） | ほとんどの場合。ツールバー・ミニマップ・インライン編集・右クリックメニュー・リサイズ追従・ファイルのドロップが最初から付く |
| コア `NodeEditor` | `import { NodeEditor } from '@hidemikimura/canvas-flow/core'` | UI を全部自前で作りたい、lit を入れたくない。`<canvas>` を渡し、サイズ変更やインライン編集はホスト側で行う |

`lit` は peerDependency です。Web Component を使うなら `npm i @hidemikimura/canvas-flow lit`。パッケージ名はスコープ付き（`canvas-flow` 単体の npm パッケージは別物）なので間違えないこと。

### 最小構成（Web Component）

```html
<canvas-flow-editor id="editor" style="display:block; height: 600px"></canvas-flow-editor>
<script type="module">
  import '@hidemikimura/canvas-flow';

  const el = document.getElementById('editor');
  el.addEventListener('ready', () => {          // el.editor はここから使える
    el.load({
      nodes: [
        { id: 'a', title: 'Source', x: 40, y: 40, output: true,
          items: [{ id: 'v', label: 'value', value: '10', output: true }] },
        { id: 'b', title: 'Sink', x: 360, y: 120, input: true,
          items: [{ id: 'in', label: 'in', input: true }] },
      ],
      edges: [{ source: 'a', sourcePort: 'item:v:out', target: 'b', targetPort: 'item:in:in' }],
    });
  });
  el.addEventListener('graph-change', () => save(el.toJSON()));
</script>
```

バンドラ（Vite / webpack など）を使わずにブラウザで直接読み込む場合、`dist/lit.js` は `lit` を素のパッケージ名で import しているので、import map が要ります（CDN の `https://cdn.jsdelivr.net/npm/@hidemikimura/canvas-flow/+esm` を使うなら不要）。

```html
<script type="importmap">
{ "imports": {
  "lit": "./node_modules/lit/index.js",
  "lit/": "./node_modules/lit/",
  "lit-html": "./node_modules/lit-html/lit-html.js",
  "lit-html/": "./node_modules/lit-html/",
  "lit-element/": "./node_modules/lit-element/",
  "@lit/reactive-element": "./node_modules/@lit/reactive-element/reactive-element.js",
  "@lit/reactive-element/": "./node_modules/@lit/reactive-element/"
} }
</script>
<script type="module" src="./main.js"></script>  <!-- main.js で ./node_modules/@hidemikimura/canvas-flow/dist/index.js を import -->
```

`fetch` で JSON を読むなら file:// ではなく HTTP で配信すること（`npx serve` / `python3 -m http.server` など）。

React / Vue / Svelte / Next.js への組み込み、保存・読み込み、インスペクタ、パレットなどの定番の実装は `references/recipes.md` を読んでください。

## データモデルの要点

細部と全フィールドは `references/data-model.md`。ここでは間違えやすいところだけ。

- **ノード**は `{ id, title, x, y, width?, type?, input?, output?, items?, childs?, group?, goto?, note?, style?, data? }`。高さは指定できず、項目数と子ノードから自動で決まる。
- **ポートは項目（行）ごと**に付く。ヘッダにも 1 組付けられる。`input` / `output` の値は `true`（上限なし）/ 数値（最大本数）/ `{ max, visible }` / `false`（なし）。
- **ポートキー**の書式は固定: ヘッダは `'in'` / `'out'`、項目は `'item:<項目id>:in'` / `'item:<項目id>:out'`。`portKey(itemId, 'out')` で作れる。
- **コネクタ（edge）は必ず「出力ポート → 入力ポート」**: `{ source, sourcePort: '...:out', target, targetPort: '...:in' }`。
- 子ノードは `childs`（`children` ではない）。位置と幅は親が決めるので子の `x` / `y` / `width` は無視される。
- アプリ固有の値はノード・項目・コネクタの `data` に入れる。JSON にそのまま保存される。
- 保存形式は `{ format: 'canvas-flow', version: 1, nodes, edges, groups?, viewport? }`。`toJSON()` / `exportData()` の戻り値をそのまま保存し、`load()` / `importJSON()` に戻せば復元できる。

## つまずきやすい点（理由つき）

- **`el.editor` は `ready` イベントまで `null`**。要素がまだ描画されていないため。`ready` を待つか、`el.editor` の有無を確かめてから触る。フレームワークでは `ready` のリスナーを要素の生成直後に付けること（付ける前に発火済みのことがあるので、`el.editor` があれば即実行する分岐も書く）。
- **`data` と `theme` はプロパティ**（HTML 属性では渡せない）。`el.data = {...}` / `el.theme = {...}`。`nodeTypes` も JS オブジェクトで渡す。属性で渡せるのは `read-only` や `edge-type` などの単純な値だけ。
- **`toolbar` / `minimap` は属性に `"false"` と書いても消えない**（普通の HTML 真偽属性なので、付いていれば true）。消すときは `el.toolbar = false` / `el.minimap = false` とプロパティで渡す。`notes` / `context-menu` / `edge-delete-icon` / `group-on-drop` は逆に `"false"` 文字列で無効になる。
- **高さが必要**。要素は親の 100% の高さになり、最低 200px。親に高さが無いと潰れる。`display:block` と明示的な高さを与える。
- **ノードのオブジェクトを直接書き換えない**（`node.x = 100` など）。空間インデックス・Undo・再描画が追従しない。必ず `updateNode` / `updateItem` / `graph.moveNodes` などの API を使う。
- **`addEdge` は失敗しても例外を投げず `null` を返す**（ポートが無い・上限超過・重複・同じノード同士など）。理由は `el.editor.graph.connectError(source, sourcePort, target, targetPort)` で分かる。JSON の読み込みでも同じ判定で黙って落ちる（`importJSON` の戻り値の `warnings` に出る）。
- **`addNode` は既存と同じ id だと例外**。外部データを追加で取り込むなら `importJSON(data, { mode: 'merge' })` / `insertJSON()` を使うと id を自動で付け替えてくれる。
- **`load()` と `importJSON(mode: 'replace')` は Undo 履歴を消す**。初期表示には向いているが、ユーザー操作の途中で呼ぶと Undo できなくなる。
- **複数の変更を 1 回の Undo にまとめる**には `el.editor.graph.batch(() => { ... })`。
- **保存のきっかけ**: `graph-change` はドラッグ中にも毎フレーム発火するので、保存処理は debounce する（300〜500ms 程度）。ユーザーの確定操作だけ拾いたいなら `history-change` も使える。
- **イベント名**: コア（`editor.on`）はコロン区切り `node:click`、Web Component（`addEventListener`）はハイフン区切り `node-click`。中身は `event.detail`。
- **Lit 版で名前が違うメソッド**: DOM の予約名と衝突するため `removeChild` → `detachChild`、`notes()` → `notesList()`。
- **キーボードショートカット**は、その要素を最後にクリックしていて、入力欄にフォーカスが無いときだけ効く。アプリ側のショートカットと衝突させないこと。
- **読み取り専用**（`read-only` 属性 / `readOnly: true`）では編集系メソッドが何もせず `null` / `false` / 空配列を返す。クリックなどのイベントは出る。
- **SSR では動かない**（Canvas と Custom Elements が必要）。Next.js / Nuxt ではクライアント側でだけ import する。

## API の探し方

用途別のメソッド・イベント一覧は `references/api.md` にあります。よく使うものだけ挙げます。

```js
const ed = el.editor;          // NodeEditor（コア）
const g = ed.graph;            // Graph（モデル）

g.addNode({...}); g.updateNode(id, patch); g.removeNode(id);
g.addEdge({...}); g.connect(src, sp, dst, dp); g.removeEdge(id);
g.updateItem(nodeId, itemId, patch); g.addItem(nodeId, item, index?); g.removeItem(nodeId, itemId);
el.addNodeAt(spec, { at: {x, y} }); el.addNodeAtPointer(spec); el.addNodeAtCenter(spec);
el.toJSON(); el.load(data); el.importJSON(data, { mode: 'merge' }); el.insertJSON(template, { at });
ed.select({ nodes: [...] }); ed.selection.nodes /* Set */; el.focusNode(id);
el.autoLayout(); el.fitView(); el.undo(); el.redo();
```

ノード・コネクタの見た目を変えるときは、テーマ（`el.theme`）→ 種別ごとのスタイル（`el.nodeTypes = { process: { style: {...} } }`）→ 個別（`node.style`）の順に、なるべく上の段で済ませる。描画そのものを変えたいときだけ `nodeRenderer` / `edgeRenderer` / `overlayRenderer` を使う（`references/recipes.md`）。

## 生成した JSON を確かめる

ノード・コネクタの JSON をコードやデータ変換で作ったときは、同梱のスクリプトで検証できます。読み込み時に黙って落ちるコネクタ（存在しないポート、出力 → 入力の向き違い、上限超過、重複）を理由つきで一覧にします。

```bash
node <この skill のディレクトリ>/scripts/validate-graph.mjs path/to/graph.json
```

プロジェクトに `@hidemikimura/canvas-flow` がインストールされている必要があります（カレントディレクトリから探します。別の場所なら `--lib <パッケージのディレクトリ>`）。終了コードは問題なしで 0、エラーや落ちるコネクタがあれば 1。

## 作業の進め方

1. 「確かめ方」でバージョンと型定義を確認する。
2. 組み込み方（Web Component かコアか）を決める。迷ったら Web Component。
3. アプリのドメインデータとノード JSON の対応を決める（何をノードに、何を項目に、何をコネクタに、アプリ固有の値は `data` に）。変換関数は「ドメイン → canvas-flow JSON」「canvas-flow JSON → ドメイン」の往復で書くと、保存形式をアプリ側で持てる。
4. 実装したら、生成する JSON を `validate-graph.mjs` で確かめる。可能ならブラウザで表示して、コネクタが全部描かれているかを見る。

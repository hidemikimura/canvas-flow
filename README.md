# canvas-flow

Canvas 2D ベースの高速ノードエディタライブラリです。
フレームワーク非依存のコア（`NodeEditor`）と、それを包む Lit Web Component（`<canvas-flow-editor>`）で構成されています。

- 10,000 ノード規模でも軽量（空間インデックスで表示範囲のみ描画・ヒットテスト、遠景は簡易描画）
- ノード内に項目（行）を持ち、項目ごとに入力／出力ポートを付けてコネクタで接続できる
- ポートごとに接続数の上限を設定できる（出力側: 開始できるコネクタ数、入力側: 終了できるコネクタ数）。満杯時は拒否／付け替えを選べる
- ポート（端子）の表示／非表示をノード単位・項目単位・ポート単位で設定できる
- 選択・範囲選択・ドラッグ移動・一括移動・複製・コピー＆ペースト・削除
- 移動単位の指定（例: 16px 刻み）。ドラッグ・矢印キー・ノード追加の位置が指定単位に揃う
- コネクタのホバー／選択時に中央へ削除アイコンを表示し、クリックで削除
- 右クリックメニュー（対象ごとに項目を出し分け。項目の差し替え・追加や、独自メニューへの置き換えも可）
- コネクタを使わない ID 指定の遷移（`goto`）。ノード・項目に遷移先ノード ID を書くだけで、強調表示・自動整列でもつながりとして扱われる
- コネクタの描画方法を曲線（ベジェ）／直線／直角（階段状）から選べる。全体の既定とコネクタ単位の両方で指定可
- 選択したノードと同じ流れにある要素だけを強調し、他を薄く表示（`focus-mode`）。強調されている要素はまとめて選択できる
- ノードの中に子ノードを入れられる（`childs`）。何段でも入れ子にでき、位置と幅は親が自動計算する
- 自動整列（階層レイアウト）: コネクタが左から右へ流れ、他のノードの上を横切らないように並べ直す
- Undo / Redo（ドラッグやリサイズは 1 操作にまとめて記録）
- ノードの幅リサイズ（右下グリップ）
- タッチ対応（1 本指ドラッグ、2 本指ピンチズーム＋パン）
- JSON インポート／エクスポート（ファイルの読み書き、ドラッグ＆ドロップ、置き換え／追加、検証、システムクリップボード経由のコピー＆ペースト）
- 無限スクロール、ホイールズーム、縮尺リセット、全体表示
- ノード検索と該当ノードへのセンタリング（アニメーション）
- ダブルクリックでタイトル・項目のインライン編集
- ミニマップ（ドラッグで表示範囲を移動）
- テーマ／ノード種別／ノード単位／コネクタ単位での見た目変更、描画関数の差し替え

ドキュメントサイト: **https://canvas-flow.io**（[デモ](https://canvas-flow.io/demo) / [API 仕様書](https://canvas-flow.io/api)）
ブラウザで触れるデモは [`docs/demo.html`](docs/demo.html) です（CDN から読み込むだけの 1 ファイル。ビルド不要）。
API の詳細は同梱の仕様書 [`docs/api.html`](docs/api.html) を参照してください（パッケージにも含まれているので、`node_modules/@hidemikimura/canvas-flow/docs/api.html` をブラウザで開くだけで読めます）。

## インストール

```bash
npm install @hidemikimura/canvas-flow lit
```

npm には既存の `canvasflow` パッケージがあり、ハイフンを無視した同名判定で `canvas-flow` を取得できないため、
スコープ付きの `@hidemikimura/canvas-flow` で公開しています。カスタム要素名 `<canvas-flow-editor>` と
JSON の `format` フィールド（`"canvas-flow"`）は従来どおりで、パッケージ名だけが異なります。
長い場合は import エイリアス（例: Vite の `resolve.alias` で `canvas-flow` → `@hidemikimura/canvas-flow`）を張ると短く書けます。

`lit` は peerDependency（optional）です。Web Component 版 `<canvas-flow-editor>` を使う場合だけ必要で、
コアのみ（`@hidemikimura/canvas-flow/core`）を使う場合はインストール不要です。

| import | 内容 | lit |
| --- | --- | --- |
| `@hidemikimura/canvas-flow` | コア + Web Component（読み込むと `<canvas-flow-editor>` が登録される） | 必要 |
| `@hidemikimura/canvas-flow/core` | `NodeEditor` などコアのみ（フレームワーク非依存） | 不要 |
| `@hidemikimura/canvas-flow/lit` | Web Component のみ | 必要 |

ES Modules 形式（`"type": "module"`）で配布しています。Node.js は 18 以上、ブラウザは Canvas 2D と
`ResizeObserver` / `PointerEvent` が使える環境（Chrome / Edge / Firefox / Safari の現行版）が対象です。

CDN から直接読む場合:

```html
<script type="module">
  import 'https://cdn.jsdelivr.net/npm/@hidemikimura/canvas-flow/+esm';
</script>
```

## TypeScript

手書きの型定義（`types/*.d.ts`）を同梱しています。`@types/...` のインストールや設定は不要で、
import すればそのまま型が付きます。

```ts
import { NodeEditor, type Node, type EdgeType } from '@hidemikimura/canvas-flow/core';
import '@hidemikimura/canvas-flow/lit';

const editor = new NodeEditor(canvas, { moveSnap: 16, theme: { edge: { type: 'step' } } });
const node: Node = editor.graph.addNode({ x: 0, y: 0, title: 'Source', output: true });
```

型付けの要点は次のとおりです。

- **イベント名から `detail` の型が決まります**。`editor.on('item:click', (d) => d.item.label)` の `d` は補完が効き、
  存在しないイベント名や間違ったプロパティ名はコンパイルエラーになります
- **`hitTest()` は判別可能ユニオン**（`{type:'item', node, item}` など）なので、`switch (hit.type)` で安全に分岐できます
- **`edgeGeometry()` は `type` で絞り込めます**。`g.type === 'bezier'` のときだけ制御点 `c1x` などが見えます
- **`<canvas-flow-editor>` は `HTMLElementTagNameMap` に登録済み**です。`document.querySelector('canvas-flow-editor')` が
  `CanvasFlowEditor` 型になり、`addEventListener('node-click', …)` の `e.detail` にも型が付きます
- テーマは深い部分指定（`DeepPartial`）で、キー名を打ち間違えるとエラーになります

`@hidemikimura/canvas-flow/core` の型は `lit` に依存しないので、コアだけ使う場合は lit を入れなくても型チェックが通ります。

型定義そのものの検証は `npm run test:types`（`tsc --noEmit`）で行っています。
`test/types/usage.ts` が公開 API を一通り呼び、間違った使い方が `@ts-expect-error` で
「ちゃんとエラーになること」まで確かめています。

## 開発（このリポジトリで作業する場合）

```bash
npm install          # 依存関係（lit, vite, vitest）
npm run dev          # デモ (index.html) を http://localhost:5173 で起動
                     #   /demo/analytics.html … 計測値を重ねる分析ビューの試作
npm test             # コアのユニットテスト
npm run test:types   # 型定義の検証（tsc --noEmit）
npm run build        # dist/ にライブラリをビルド（ESM）
```

## 使い方（Web Component）

```html
<canvas-flow-editor id="editor" style="width:100%;height:600px"></canvas-flow-editor>
<script type="module">
  import '@hidemikimura/canvas-flow'; // または import './src/index.js'

  const el = document.getElementById('editor');
  el.addEventListener('ready', () => {
    el.nodeTypes = {
      input: { style: { headerFill: '#dbeafe' } },
    };
    el.load({
      nodes: [
        {
          id: 'a', type: 'input', title: 'Source', x: 40, y: 40, output: true,
          items: [{ id: 'v', label: 'value', value: '10', output: true }],
        },
        {
          id: 'b', title: 'Sink', x: 360, y: 120, input: true,
          items: [{ id: 'in', label: 'in', input: true }],
        },
      ],
      edges: [{ source: 'a', sourcePort: 'item:v:out', target: 'b', targetPort: 'item:in:in' }],
    });
  });

  el.addEventListener('selection-change', (e) => console.log(e.detail));
  el.addEventListener('graph-change', () => console.log(el.toJSON()));
</script>
```

### 属性 / プロパティ

| 名前 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `data` | `{nodes, edges, viewport?}` | – | 設定すると `load()` される |
| `theme` | object | – | テーマの部分上書き（後述） |
| `node-types` / `nodeTypes` | `{ [type]: { style } }` | `{}` | ノード種別ごとの既定スタイル |
| `minimap` | boolean | `true` | ミニマップ表示 |
| `minimap-width` / `minimap-height` | number | 200 / 140 | ミニマップサイズ (px) |
| `toolbar` | boolean | `true` | 検索・ズーム・複製・削除のツールバー表示 |
| `wheel-mode` | `'zoom' \| 'pan'` | `'zoom'` | ホイールの既定動作 |
| `drag-mode` | `'pan' \| 'select'` | `'pan'` | 空白を左ドラッグしたときの動作（Shift で反転） |
| `read-only` | boolean | `false` | 編集操作を無効化 |
| `import-mode` | `'replace' \| 'merge'` | `'replace'` | ツールバー／ドロップでの読み込み方法 |
| `export-filename` | string | `canvas-flow.json` | 「書き出し」ボタンのファイル名 |
| `max-inputs` / `max-outputs` | number | 無制限 | ポート側で上限を指定しないときの既定の接続数上限 |
| `on-full` | `'reject' \| 'replace'` | `'reject'` | 満杯のポートへ接続したときの挙動 |
| `edge-delete-icon` | `"false"` で無効 | 有効 | ホバー／選択中のコネクタ中央に削除アイコンを表示 |
| `move-snap` | number | 0（無効） | ノードの移動単位（px）。ドラッグ・矢印キー・ノード追加・JSON 追加の位置がこの単位に揃う |
| `edge-type` | `'bezier' \| 'straight' \| 'step'` | `'bezier'` | コネクタの描画方法の既定（曲線 / 直線 / 直角の階段状）。コネクタ単位は `edge.type` |
| `focus-mode` | `'off' \| 'connected' \| 'neighbors'` | `'off'` | 選択ノードと同じ流れにある要素を強調し、他を薄く描く |
| `context-menu` | boolean | `true` | 内蔵の右クリックメニュー（`"false"` で無効。`read-only` では出ない） |

コア `NodeEditor` のオプションにはさらに `historyLimit`（既定 200）、`minNodeWidth`（既定 100）、`keyboardScope`（キーボード操作を受け付ける範囲の要素）、`rules`（`{ maxInputs, maxOutputs, onFull }`）、`edgeDeleteIcon`（既定 true）、`wheelGestureGap`（既定 250ms。この間隔以内のホイールイベントは同じ操作として扱う）があります。

### メソッド

`addNode(node)`, `addNodeAt(spec, options?)`, `addNodeAtPointer(spec, options?)`, `addNodeAtCenter(spec, options?)`, `getPointer()`,
`addEdge(edge)`, `removeNode(id)`, `removeEdge(id)`, `updateNode(id, patch)`, `updateItem(nodeId, itemId, patch)`,
`duplicateSelection(offset?)`, `deleteSelection()`, `deleteSelectedEdges(options?)`, `autoLayout(options?)`, `setMoveSnap(step)`, `snapNodes(ids?)`, `setPortVisible(nodeId, portKey, visible)`, `setPortsVisible(nodeId, visible, itemId?)`,
`undo()`, `redo()`, `canUndo`, `canRedo`,
`zoomIn()`, `zoomOut()`, `resetZoom()`, `fitView()`,
`search(query)`, `focusNode(id, {zoom?, animate?})`,
`exportData(options?)`, `exportJSON(options?)`, `downloadJSON(filename?, options?)`,
`importJSON(input, options?)`, `insertJSON(input, options?)`, `insertJSONAtPointer(input, options?)`, `importFromFile(file, options?)`, `openImportDialog(options?)`, `toJSON()`, `load(data)`

より細かい操作は `el.editor`（`NodeEditor` インスタンス）から行えます。

#### 位置を指定してノードを追加

`addNode()` は `x`, `y` をそのまま使いますが、マウス位置や画面中央に置きたいときは次を使います（いずれも Undo 可、追加したノードを選択）。

```js
el.addNodeAtPointer(spec);                     // 最後に観測したマウス位置。canvas の外なら画面中央
el.addNodeAtCenter(spec);                      // 表示中の画面中央
el.addNodeAt(spec, { at: { x, y } });          // ワールド座標を指定
el.addNodeAt(spec, { client: { clientX, clientY } }); // マウスイベントの clientX/Y をそのまま渡す

// 例: 右クリックメニューやショートカットから
document.addEventListener('keydown', (e) => {
  if (e.key === 'n') el.addNodeAtPointer({ title: '新規', input: true, output: true, items: [] });
});
el.addEventListener('canvas-dblclick', (e) => {
  el.addNodeAt({ title: '新規' }, { at: { x: e.detail.x, y: e.detail.y }, anchor: 'header' });
});

el.getPointer(); // → { world: {x, y}, screen: {x, y}, inside: boolean } | null
```

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `at` / `client` | ポインタ位置 | 追加位置。ワールド座標かクライアント座標 |
| `anchor` | `'center'` | 位置に合わせるノードの基準点。`'center'` / `'top-left'` / `'header'`（ヘッダの中央） |
| `select` | `true` | 追加後に選択する |
| `snap` | `false` | `theme.grid.size` に吸着する |
| `avoidOverlap` | `false` | 既存ノードと重なる場合は右下へずらす |

#### 移動単位（グリッド吸着）

`move-snap` 属性（コアでは `moveSnap` オプション / `setMoveSnap(step)`）にピクセル数を指定すると、ノードの位置がその単位にしか置けなくなります。

- ドラッグ移動: クリックしたノードの左上が単位に揃う位置へ吸着し、他の選択ノードは相対位置を保ったまま追従します
- 矢印キー: 1 押下で 1 単位（Shift で 10 単位）動きます。まだ単位に乗っていないノードは、進む方向の次の目盛りが 1 歩目になります
- `addNodeAt` / `addNodeAtPointer` / `insertJSON`: 追加位置が既定で単位に揃います（`snap: false` で無効化）
- 既にずれているノードは `snapNodes(ids?)` で揃えられます（省略時は選択中、選択が無ければ全ノード。Undo 可）

```html
<canvas-flow-editor move-snap="16"></canvas-flow-editor>
```
```js
el.moveSnap = 32;            // theme.grid.size と同じ値にすると背景グリッドに揃う
el.editor.snapValue(37);     // → 32
el.snapNodes();              // 選択中ノードを目盛りへ
```

#### コネクタの描画方法（曲線 / 直線 / 直角）

コネクタの形は 3 種類から選べます。全体の既定は `edge-type` 属性（コアでは `theme.edge.type` または `setEdgeType(type)`）、コネクタ単位は `edge.type` で指定します（`edge.type` が優先）。

| 値 | 形 |
| --- | --- |
| `'bezier'`（既定） | 三次ベジェ曲線。曲がり具合は `theme.edge.curvature` |
| `'straight'` | 2 点を直線で結ぶ |
| `'step'` | 90 度にだけ曲がる階段状の折れ線。前方にある相手へは中央で 1 回折れ、後方の相手へは `theme.edge.stepOffset`（既定 24px）だけ突き出してから上下の中間を通って戻る |

```html
<canvas-flow-editor edge-type="step"></canvas-flow-editor>
```
```js
el.edgeType = 'straight';                    // 全体の既定を変える（既存コネクタも edge.type が無ければ切り替わる）
el.setEdgeType('step', ['e1', 'e2']);        // 指定コネクタだけ（edge.type を更新。Undo 可）
el.setSelectedEdgeType('bezier');            // 選択中のコネクタだけ（選択が無ければ全体の既定）
el.editor.graph.addEdge({ ..., type: 'step' }); // 追加時に直接指定。JSON にもそのまま保存される
```

ドラッグ中の仮コネクタ、ヒットテスト、削除アイコンの位置（形状の中点）、簡易表示（LOD）もすべて選んだ形に従います。
`'line'` → `'straight'`、`'orthogonal'` → `'step'` などの別名も受け付けます（`normalizeEdgeType`）。
`edgeRenderer` で自前描画する場合、`geom` には `type` と折れ線の頂点列 `points`（bezier は制御点 `c1x, c1y, c2x, c2y` も）が入ります。

#### つながりの強調表示（他を薄くする）

ノードを選択すると、そのノードと**同じ流れにある要素**だけをはっきり描き、それ以外を薄くします。
大きなグラフで「この処理はどこから来てどこへ流れるのか」を追うときに使います。既定は無効です。

```html
<canvas-flow-editor focus-mode="connected"></canvas-flow-editor>
```
```js
el.focusMode = 'connected';                                  // 同じ流れ全部（既定）
el.setFocusMode('neighbors', { depth: 2 });                  // 2 段まで
el.setFocusMode('connected', { direction: 'downstream' });   // 進める先だけ
el.setFocusMode('connected', { direction: 'upstream' });     // 元をたどるだけ
el.setFocusMode('connected', { direction: 'both' });         // 向きを問わず繋がっている全部
el.focusMode = 'off';                                        // 解除
```

| モード | 強調する範囲 |
| --- | --- |
| `'off'`（既定） | 無効。通常どおり全部を描く |
| `'connected'` | 辿れるところまですべて |
| `'neighbors'` | `focusDepth` 段まで（既定 1） |

| `focusDirection` | 辿る向き |
| --- | --- |
| `'lineage'`（既定） | 起点の祖先（上流）と子孫（下流）だけ＝起点を通る道筋 |
| `'downstream'` | 出力ポートから進める先だけ |
| `'upstream'` | 入力ポートへ入ってくる側だけ |
| `'both'` | 向きを問わず繋がっているもの全部 |

既定の `'lineage'` は「その要素を通る道筋」を選びます。起点まで遡れるノード（祖先）と、起点から進めるノード（子孫）だけが対象で、**祖先から分かれた別の枝や、子孫へ合流してくる別の枝は入りません**。

```
A → B → C
A → E、D → E、E → F

B を選択 → A, B, C を強調（A から分かれた E・F と、合流してくる D は薄いまま）
E を選択 → A, D, E, F を強調（A から分かれた B・C は薄いまま）
A を選択 → A, B, C, E, F を強調（合流してくる D は薄いまま）
```

これは `goto`（ID 指定の遷移）でも同じです。`A → B → C` に加えて `A` が `goto` で `D` を指しているとき、C を選んでも D は強調されません（A を選べば子孫として強調されます）。前後の枝も含めて見たいときは `'both'` を使ってください。

選択が空のときは自動的に解除され、全部が通常表示に戻ります。

薄さと強調の見た目は `theme.focus` で変えられます。

```js
el.theme = {
  focus: {
    dimOpacity: 0.12,      // 薄くする側の不透明度
    dimOpacityLod: 0.25,   // 簡易表示（縮小）中は線が細いので少し濃く
    edgeStroke: '#3b82f6', // 繋がっているコネクタの色（null で通常どおり）
    edgeWidth: 3,          // 同じく太さ（null で通常どおり）
  },
};
```

関連する API もあります。

```js
el.editor.focusSet();          // → { nodes: Set, edges: Set } | null（無効・未選択なら null）
el.selectFocused();            // 強調表示されている要素をそのまま選択（下記）
el.selectConnected();          // 繋がっている要素を選択に加える（まとめて移動・削除したいとき）
el.editor.graph.connectedTo(['n1'], { depth: 1, direction: 'lineage' });  // 純粋な探索だけ（この API の既定は 'both'）
```

強調対象が変わると `focus-change`（`{ mode, direction, nodes, edges }`）が発火します。

##### 強調表示されている要素をまとめて選択する

薄く表示されていない側（強調されているノードとコネクタ）をそのまま選択状態にできます。ツールバーの「強調を選択」ボタン、**Ctrl/Cmd + Shift + A**、または `selectFocused()` で実行できます。選んだ流れをまとめて移動・複製・削除したいときに使ってください。

```js
el.selectFocused();                                   // 強調されている要素で選択を置き換える
el.selectFocused({ additive: true });                 // いまの選択に加える
el.selectFocused({ direction: 'downstream' });        // 向きや depth を指定して辿り直す
```

強調表示が無効（`focus-mode="off"`）のときは `focusDirection` / `focusDepth` の設定どおりに繋がりを辿って選択します。選択ノードが無いときは何もせず `null` を返します。選択後は `focus-select`（`{ mode, nodes, edges }`）が発火します。読み取り専用（`read-only`）でも選択は操作なので使えます。

選択したあとは、その範囲がそのまま強調対象として固定されます（次に選択やグラフを変えるまで）。固定しないと「選択が増えた分だけ強調範囲も広がる」ため、ボタンを押すたびに範囲が育ってしまうためです。

#### ノードの中の子ノード（`childs`）

ノードに `childs` を持たせると、その中に子ノードが入ります。子ノードは親の項目の下に上から順に縦に積まれ、位置（`x` / `y`）と幅は親が自動計算します。何段でも入れ子にできます。

```js
el.addNode({
  id: 'n0',
  title: '親ノード',
  x: 100, y: 50,
  input: true, output: true,
  items: [{ id: 'p0', label: 'value', input: true, output: true }],
  childs: [
    {
      id: 'n1',
      title: '子ノード',
      input: true, output: true,
      items: [{ id: 'p1', label: 'value', input: true, output: true }],
      childs: [{ id: 'n2', title: '孫ノード', input: true, output: true }],  // 入れ子は何段でも
    },
  ],
});
```

子ノードの扱いは次のとおりです。

- **自動配置**: 親の項目の下に縦に並ぶ。`x` / `y` / `width` を指定しても無視される（親の幅から `theme.node.childIndent` の 2 倍だけ狭くなる）
- **親の高さ**: 子ブロックの分だけ親が自動的に高くなる。孫まで含めて計算される
- **移動**: 子だけを動かすことはできない。子をドラッグすると一番外側の親ごと動く
- **ポート**: 子もヘッダポートと項目ポートを持ち、外のノードとも自由に接続できる。端子の丸は一番外側の親の左右の縁に並ぶ
- **削除・複製**: 親を削除すると子孫もまとめて消える。複製は部分木ごとコピーされる
- **幅リサイズ**: 子ノードは親に追従するのでリサイズできない

親子関係はあとから変更できます（いずれも Undo 可）。

```js
el.addChild('n0', { title: '子ノード' });      // 末尾に追加（第 3 引数で挿入位置を指定）
el.detachChild('n1', { x: 400, y: 200 });      // 親から出して独立したノードに戻す
el.setParent('n1', 'n0', 0);                   // 親を付け替える（先頭に挿入）
el.setParent('n1', null);                      // 独立させる
el.childrenOf('n0');                           // 子ノードの配列（表示順）
el.rootNodeOf('n2');                           // 一番外側の親（自分が子でなければ自分自身）
```

コアの `Graph` には `childrenOf` / `isChild` / `parentOf` / `rootOf` / `depthOf` / `descendantIds` / `addChild` / `removeChild` / `setParent` / `rootNodes` があります（Web Component では DOM の予約名を避けて `removeChild` → `detachChild`）。自分の子孫を親にするような循環は `setParent` が `false` を返して拒否します。

インデントと間隔はテーマで変えられます。

```js
el.theme = { node: { childIndent: 16, childGap: 10 } };   // editor.setTheme(...) でも同じ
```

#### コネクタを使わない遷移（`goto`）

チャットシナリオのように「この選択肢を選んだらこのノードへ」という遷移を、コネクタを引かずにノード ID で指定できます。ノードにも項目にも `goto` を書けます。

```js
el.addNode({
  id: 'menu', title: 'メニュー', x: 300, y: 0, input: true,
  items: [
    { id: 'm1', label: '料金を知りたい', goto: 'price' },                        // ID だけ
    { id: 'm2', label: '使い方を知りたい', goto: { to: 'howto', label: '使い方' } }, // ラベル付き
    { id: 'm3', label: 'その他', goto: ['faq', 'agent'] },                       // 複数
  ],
  goto: 'survey',   // ノード本体に書くと「この画面を出したあと進む先」
});
```

コネクタ（`edges`）と混ぜて使えます。`goto` は次のように扱われます。

- **強調表示**: `connectedTo()` がコネクタと同じ向きのつながりとして辿るので、`focus-mode` でも `goto` 先のノードが強調されます（`connectedTo(ids, { links: false })` で除外できます）
- **自動整列**: `autoLayout()` も層の計算に使うので、遷移先が右に並びます（`autoLayout({ links: false })` で除外）
- **描画**: 普段は何も描かず、そのノードを選択したとき・強調表示で辿られたときだけ点線の矢印で表示します（`theme.goto` で色・破線・矢印の大きさ・ラベルの見た目を変更可）
- **JSON**: そのまま保存・復元されます。`insertJSON` / `importData({mode:'merge'})` で ID が付け替わるときは `goto` の遷移先も一緒に付け替わります
- 存在しない ID を指していてもエラーにはならず、`exists: false` として無視されます（作成途中や外部シナリオへの参照を許すため）

```js
el.setGoto('menu', 'price', { itemId: 'm1' });   // 設定（Undo 可）。itemId 省略でノード本体
el.setGoto('menu', null, { itemId: 'm1' });      // 解除
el.gotoLinks('menu');    // → [{ key, from, itemId, to, label, exists }, ...]（省略で全件）
el.gotoSources('price'); // → price を指しているリンク（どこから来るか）
el.editor.graph.gotoTargets('menu');  // → 遷移先のノード配列
```

強調表示の対象には `goto` のキーも入るので、`focus-change` の `detail.links` で「どの遷移が辿られたか」も分かります。

#### 右クリックメニュー

右クリックすると、対象（ノード／項目／コネクタ／空白）に応じたメニューが出ます。ブラウザ既定のメニューは常に抑制されます。未選択のものを右クリックした場合はそれを選択してからメニューを出し、選択中のノードを右クリックしたときは複数選択を保ったままなので、まとめて複製・削除できます。`read-only` のときと `context-menu="false"` のときは出ません（イベントだけ発火します）。

既定の項目は次のとおりです。

| 対象 | 項目 |
| --- | --- |
| ノード・項目 | 複製 / 削除 / つながりを外す / 子ノードを追加 / 強調されている要素を選択 / つながっている要素を選択 / コピー / このノードを中心に |
| 子ノード | この子ノードを複製 / この子ノードを削除 / 子ノードを親から出す（ほかはノードと同じ） |
| コネクタ | このコネクタを削除 / 曲線・直線・直角にする / 両端のノードを選択 |
| 空白 | ここにノードを追加 / 貼り付け / すべて選択 / 選択を解除 / 整列 / 全体表示 / 縮尺をリセット / JSON を書き出し |

項目は `contextMenuItems` で差し替え・追加できます。関数を渡すと対象ごとに組み立てられ、`ctx.defaultItems` に既定の項目が入っています。

```js
el.contextMenuItems = (ctx) => [
  ...ctx.defaultItems.filter((i) => i.id !== 'export'),   // 既定から外す
  { type: 'separator' },
  { id: 'log', label: 'ID をログ出力', shortcut: 'Ctrl+L', run: (c) => console.log(c.node?.id) },
];

el.contextMenuItems = [{ id: 'only', label: '固定の項目', run: () => {} }];  // 配列なら常に同じメニュー
```

項目は `{ id, label, shortcut?, title?, disabled?, danger?, hidden?, run(ctx) }`、区切り線は `{ type: 'separator' }` です（先頭・末尾・連続した区切り線は自動で削られます）。`ctx` は `context-menu` イベントの `detail`（`type`, `node`, `item`, `edge`, `port`, ワールド座標の `x` / `y`, `screen`, `client`, `selection`）に `el` / `editor` / `graph` / `defaultItems` を足したものです。

メニュー自体をアプリ側で描きたい場合は、`context-menu` イベントで `preventDefault()` すると内蔵メニューが出なくなります。

```js
el.addEventListener('context-menu', (e) => {
  e.preventDefault();                       // 内蔵メニューを出さない
  myMenu.open(e.detail.client.x, e.detail.client.y, e.detail);
});
```

キーボードは ↑ ↓ で移動、Enter で実行、Escape で閉じます。メニューの外をクリックするか、ズーム・パンしても閉じます。項目を実行すると `context-menu-select`（`{ id, item, target }`）が発火します。見た目は `part="context-menu"` で上書きできます。

#### 選択範囲内のコネクタだけを削除

範囲選択したあと、ノードは残してコネクタだけを外したいときに使います。ツールバーの「コネクタ削除」ボタン、Shift + Delete、または `deleteSelectedEdges(options)` で実行でき、1 回の Undo で戻ります。

```js
el.deleteSelectedEdges();                        // 既定: scope 'between'
el.deleteSelectedEdges({ scope: 'attached' });   // 選択ノードに繋がる全コネクタ（範囲外へ出るものも）
el.deleteSelectedEdges({ scope: 'selected' });   // 選択中のコネクタだけ
el.editor.selectedEdgeIds({ scope });            // 削除せずに対象 ID を確認
```

| `scope` | 対象 |
| --- | --- |
| `'between'`（既定） | 選択中のコネクタ + 両端とも選択中ノードに繋がるコネクタ（範囲選択の内側） |
| `'attached'` | 選択中のコネクタ + 選択中ノードに繋がるすべてのコネクタ |
| `'selected'` | 選択中のコネクタのみ |

### イベント（`CustomEvent`、内容は `detail`）

`ready`, `selection-change`, `viewport-change`, `graph-change`,
`node-add`, `node-remove`, `node-change`, `nodes-move`, `nodes-move-end`, `node-resize-end`,
`edge-add`, `edge-remove`, `edge-change`, `history-change`（`{canUndo, canRedo}`）,
`import`（`{mode, nodes, edges, warnings}`）, `export`（`{data, selectionOnly}`）, `import-error`（`{errors}`）,
`connect-rejected`（`{node, port, reason}` 満杯のポートからコネクタを引こうとした）,
`edge-delete-icon`（`{edge}` 削除アイコンのクリックでコネクタを削除した）, `edges-delete`（`{ids, scope}` 選択範囲内のコネクタだけを削除した）, `insert`（`{at, anchor, nodes, edges}` JSON を指定位置に追加した）, `layout`（`{nodes}` 自動整列を適用した）, `edge-type-change`（`{type, edges}` コネクタの描画方法を変えた。`edges` が null なら全体の既定）,
`focus-change`（`{mode, direction, nodes, edges}` 強調表示の対象が変わった）,
`node-click` / `item-click` / `edge-click` / `canvas-click`（クリック。後述）,
`canvas-dblclick`（空白ダブルクリック、ワールド座標）, `edge-dblclick`, `connect-cancel`,
`node-edit` / `item-edit`（`preventDefault()` すると内蔵のインライン編集を抑止し、独自 UI を出せる）, `render`（描画統計）

#### クリックイベント

ポインタを押してからドラッグせずに離したときに発火します（ドラッグ移動・範囲選択・コネクタ作成では発火しません）。
`detail` にはワールド座標 `x`, `y`、canvas 基準の `screen: {x, y}`、`button`、`shiftKey` / `ctrlKey` / `metaKey` / `altKey`、`pointerType`、`originalEvent` が含まれます。

| イベント | 追加の detail | 発火条件 |
| --- | --- | --- |
| `node-click` | `node`, `item`（項目上なら）, `header`（ヘッダ上なら true）, `port`（ポート上ならキー） | ノードのどこかをクリック |
| `item-click` | `node`, `item` | ノード内の項目をクリック（続けて `node-click` も発火） |
| `edge-click` | `edge` | コネクタをクリック |
| `canvas-click` | – | 空白をクリック |

```js
el.addEventListener('item-click', (e) => {
  const { node, item, shiftKey } = e.detail;
  openInspector(node.id, item.id);
});
el.addEventListener('node-click', (e) => {
  if (e.detail.header) console.log('header clicked', e.detail.node.title);
});
```

選択の変更はクリックより前に行われるので、`node-click` の時点で `el.editor.selection` は更新済みです。読み取り専用モードでも発火します。

### スロット

- 既定スロット: キャンバスの上に重ねる任意要素
- `toolbar`: ツールバーの末尾に追加するボタンなど

## 使い方（コアのみ・フレームワーク非依存）

```js
import { NodeEditor } from '@hidemikimura/canvas-flow/core';

const canvas = document.querySelector('canvas');
const editor = new NodeEditor(canvas, { minimapCanvas: document.querySelector('canvas.minimap') });
editor.resize(800, 600);
editor.resizeMinimap(200, 140);
editor.graph.addNode({ id: 'a', title: 'A', x: 0, y: 0, output: true });
editor.on('selection:change', console.log);
```

サイズ変更時は `editor.resize(width, height)` を呼んでください（Lit 版は ResizeObserver で自動）。
インライン編集は `editor.on('item:edit' | 'node:edit', ({ node, item, screenRect }) => …)` を受けてホスト側で入力欄を出します。

## データモデル

```js
// ノード
{
  id: 'n1',
  type: 'process',          // 任意。nodeTypes のスタイルを適用
  title: 'タイトル',
  x: 0, y: 0,
  width: 200,               // 任意。既定は theme.node.width
  input: true,              // ヘッダ左に入力ポート（上限なし）
  output: { max: 3 },       // ヘッダ右に出力ポート。ここから開始できるコネクタは 3 本まで
  items: [                  // 項目（行）。高さは項目数から自動計算
    { id: 'p0', label: 'value', value: '10', input: 1, output: true }, // 入力は 1 本まで
    { id: 'p1', label: '料金を見る', goto: { to: 'n9', label: '→ 料金' } }, // 項目ごとの goto も可
  ],
  childs: [                 // 任意。子ノード（位置と幅は親が自動計算）
    { id: 'n2', title: '子ノード', input: true, output: true, items: [] },
  ],
  goto: 'n9',               // 任意。コネクタを使わない遷移先（ID 指定）
  style: { headerFill: '#fee' }, // 任意。theme.node.* の上書き
  data: {},                 // 任意データ
}

// コネクタ（エッジ）。常に「出力ポート → 入力ポート」
{
  id: 'e1',
  source: 'n1', sourcePort: 'item:p0:out',   // ヘッダポートは 'out'
  target: 'n2', targetPort: 'item:p1:in',    // ヘッダポートは 'in'
  style: { stroke: '#f00' },                 // 任意。theme.edge.* の上書き
  type: 'step',                              // 任意。描画方法 'bezier' | 'straight' | 'step'（省略時は全体の既定）
}
```

ポートキーは `portKey(itemId, 'in' | 'out')` で生成できます（`itemId` を省略するとヘッダポート）。

### ポートの接続数上限

`input` / `output` には次のいずれかを指定します。

| 値 | 意味 |
| --- | --- |
| `false` / 省略 | ポート無し |
| `true` | ポート有り。上限は `rules.maxInputs` / `rules.maxOutputs`（既定: 無制限） |
| 数値 `n` | 最大 `n` 本 |
| `{ max: n, visible: false }` | 最大 `n` 本（`max` 省略で既定上限）。`visible: false` で端子の丸を表示しない |

`output` 側の上限は「そのポートから開始できるコネクタ数」、`input` 側は「そのポートに終了できるコネクタ数」です。
上限に達したポートは橙色（`theme.port.fullFill`）で表示され、そこから新しいコネクタを引こうとすると `connect-rejected` イベントが出ます。

満杯のポートへ接続しようとしたときの挙動は `rules.onFull`（属性 `on-full`）で選べます。

- `'reject'`（既定）: 接続できない。ドラッグ中もハイライトされない
- `'replace'`: そのポートの最も古いコネクタを外して付け替える（1 回の Undo で戻る）

```js
const g = el.editor.graph;
g.portCapacity('n1', 'item:p0:in');        // → { count: 1, max: 1, full: true }
g.connectError('a', 'out', 'b', 'in');      // → null | 'same-node' | 'invalid-port' | 'missing-port' | 'duplicate' | 'source-full' | 'target-full'
g.connect('a', 'out', 'b', 'in');           // rules.onFull に従って接続（付け替え含む）
g.connect('a', 'out', 'b', 'in', { replace: true }); // このときだけ付け替え
el.editor.setRules({ maxInputs: 1 });       // 既定上限を変更
```

`addEdge()` は常に拒否モードで判定します（上限を超えるコネクタは追加されず `null`）。JSON 読み込みでも同じ判定が働きます。

### ポートの表示 / 非表示

ポートを「無くす」には `input` / `output` を `false`（または省略）にします。この場合は接続もできません。
ポートを残したまま端子の丸だけを隠したいときは、次の 3 段階で指定できます。

| 指定場所 | 書き方 | 効果 |
| --- | --- | --- |
| ポート単位 | `input: { visible: false }` / `output: { max: 2, visible: false }` | そのポートだけ隠す |
| 項目単位 | `items: [{ id, label, input: true, showPorts: false }]` | その項目の入力・出力ポートを隠す |
| ノード単位 | `{ id, title, showPorts: false, ... }` | ヘッダと全項目のポートを隠す |

非表示のポートは描画されず、マウス操作の対象にもなりません（そこからコネクタを引いたり、そこへ繋いだりはできない）。
一方で存在はしているので、既存のコネクタはノードの縁に接続された状態で描かれ、`addEdge()` / `connect()` / JSON 読み込みからの接続も有効です。
表示専用の接続を作りたいとき、あるいは端子を見せずにすっきり表示したいときに使えます。

```js
el.setPortVisible('n1', 'out', false);            // ヘッダ出力ポートだけ隠す（Undo 可）
el.setPortVisible('n1', 'item:p0:in', true);      // 項目 p0 の入力ポートを表示
el.setPortsVisible('n1', false);                  // ノードの全ポートを隠す
el.setPortsVisible('n1', true, 'p0');             // 項目 p0 のポートを表示に戻す
el.editor.graph.portVisible('n1', 'out');         // → boolean
el.editor.graph.nodePorts(node, { visibleOnly: true }); // 表示中のポートだけ
```

`visible` / `showPorts` は JSON にそのまま保存・復元されます。

## 操作

| 操作 | 動作 |
| --- | --- |
| ノードをクリック | 選択（Shift / Ctrl / Cmd で追加・トグル） |
| ノードをドラッグ | 選択中ノードをまとめて移動 |
| ポートをドラッグして別ポートへ | コネクタ作成（出力 → 入力のみ。接続数上限を超える先には繋げない） |
| ノード右下のグリップをドラッグ | 幅のリサイズ（最小幅は `minNodeWidth`、既定 100） |
| 2 本指（タッチ） | ピンチでズーム、同時にパン |
| コネクタをクリック | 選択 |
| コネクタ中央の × アイコンをクリック | そのコネクタを削除（ホバー中・選択中に表示。Undo 可） |
| ツールバー「整列」 | 自動整列。2 つ以上選択していればその範囲だけ、なければ全体（Undo 可） |
| 空白を左ドラッグ | パン（`drag-mode="select"` なら範囲選択）。Shift で反転 |
| 中ボタン / Space + ドラッグ | パン |
| ホイール | ズーム（Shift + ホイールでパン。`wheel-mode="pan"` なら逆）。パンはトラックパッドの動かした方向そのまま。慣性スクロール中は途中で Shift を離しても最初の動作（ズーム / パン）を維持 |
| ダブルクリック（ヘッダ / 項目） | タイトル / 項目のインライン編集 |
| Delete / Backspace | 選択中のノード・コネクタを削除 |
| Shift + Delete / ツールバー「コネクタ削除」 | 選択範囲内のコネクタだけを削除（ノードは残す。Undo 可） |
| Ctrl/Cmd + D | 複製（範囲内のコネクタも複製） |
| Ctrl/Cmd + C / V | コピー / 貼り付け（カーソル位置） |
| Ctrl/Cmd + A | 全選択 |
| Ctrl/Cmd + Shift + A / ツールバー「強調を選択」 | 強調表示されている要素をまとめて選択（`selectFocused`） |
| 右クリック | 対象に応じたメニューを表示（↑ ↓ で移動、Enter で実行、Escape で閉じる） |
| Ctrl/Cmd + Z / Ctrl/Cmd + Shift + Z（または Ctrl/Cmd + Y） | Undo / Redo |
| Ctrl/Cmd + 0 / + / − | 縮尺リセット / 拡大 / 縮小 |
| N（デモのみ） | マウス位置にノードを追加（`addNodeAtPointer` の例） |
| 矢印キー（Shift で 10 倍） | 選択ノードを微移動（1px、`move-snap` 設定時はその単位） |
| Escape | 操作キャンセル / 選択解除 |
| ミニマップをクリック・ドラッグ | 表示範囲を移動 |

## JSON インポート / エクスポート

### ファイル形式

```json
{
  "format": "canvas-flow",
  "version": 1,
  "nodes": [ { "id": "a", "title": "A", "x": 0, "y": 0, "items": [], "childs": [] } ],
  "edges": [ { "id": "e1", "source": "a", "sourcePort": "out", "target": "b", "targetPort": "in" } ],
  "viewport": { "tx": 0, "ty": 0, "zoom": 1 }
}
```

`format` / `version` / `viewport` は省略可能で、プレーンな `{nodes, edges}` も読み込めます。
`goto`（ID 指定の遷移）もノード・項目の値としてそのまま保存されます。子ノードは `nodes` の中に `childs` として入れ子で出力されます（トップレベルの `nodes` には親を持たないノードだけが並びます）。子ノードの `x` / `y` / `width` は親が決めるため出力されず、読み込み時に指定されていても無視されます。

### 使い方

```js
// エクスポート
const json = el.exportJSON();                               // 全体（viewport 含む）を整形 JSON で
const part = el.exportJSON({ selectionOnly: true });        // 選択中のノードと、その間のコネクタだけ
el.downloadJSON('my-graph.json');                           // ファイルとしてダウンロード
JSON.stringify(el.editor);                                  // toJSON() 経由でも同じ形式

// インポート
const r = el.importJSON(jsonOrObject);                      // import-mode に従う（既定 replace）
el.importJSON(json, { mode: 'merge', at: { x: 100, y: 100 } }); // 既存に追加。左上を指定位置に置く
el.importJSON(json, { mode: 'replace', fitView: true });
await el.importFromFile(file);                              // <input type=file> の File など
await el.openImportDialog();                                // ファイル選択ダイアログ

if (!r.ok) console.error(r.errors);                         // 構文エラー・構造エラー
else console.warn(r.warnings);                              // 除外した壊れたコネクタなど
```

- `replace` は内容を置き換え、`viewport` があれば復元します（Undo 履歴は破棄）
- `merge` は既存グラフに追加します。既存と衝突する ID は自動で付け替え、コネクタの参照も追従します。1 回の Undo で取り消せます。`at` と `anchor`（`'top-left'` 既定 / `'center'` / `'origin'`）で配置位置を指定できます

### 複数ノード・コネクタの JSON を指定位置に追加（テンプレート挿入）

部品としてまとめた JSON（複数のノードと、その間のコネクタ）を、指定した位置に追加します。JSON 内のノード座標は「追加位置からの相対位置」として扱われるので、テンプレート側は (0, 0) を基準に書いておけば、どこに追加しても同じ形で配置されます。既存の内容は残り、ID が衝突すれば自動で付け替え、1 回の Undo で戻ります。

```js
const template = {
  nodes: [
    { id: 'src', title: 'Source', x: 0,   y: 0,  output: true, items: [{ id: 'v', label: 'value', output: true }] },
    { id: 'dst', title: 'Sink',   x: 300, y: 80, input: true,  items: [{ id: 'i', label: 'in', input: true }] },
  ],
  edges: [{ source: 'src', sourcePort: 'item:v:out', target: 'dst', targetPort: 'item:i:in' }],
};

el.insertJSON(template, { at: { x: 500, y: 200 } });   // Source が (500,200)、Sink が (800,280) に置かれる
el.insertJSONAtPointer(template);                      // マウス位置に追加（canvas 外なら画面中央）
el.insertJSON(template, { client: { clientX: e.clientX, clientY: e.clientY } }); // マウスイベントから
el.insertJSON(template, { at, anchor: 'top-left' });   // ノード群の左上を at に合わせる
el.insertJSON(template, { at, anchor: 'center' });     // ノード群の中心を at に合わせる
```

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `at` / `client` | ポインタ位置 | 追加位置（ワールド座標 / クライアント座標） |
| `anchor` | `'origin'` | `'origin'`: JSON の座標を追加位置からの相対位置として扱う / `'top-left'`: ノード群の左上を合わせる / `'center'`: ノード群の中心を合わせる |
| `select` | `true` | 追加した要素を選択する |
| `snap` | `false` | 追加位置を `theme.grid.size` に吸着 |

戻り値は `importJSON` と同じ（`{ ok, nodes, edges, warnings }` または `{ ok: false, errors }`）で、成功時は `insert` イベント（`{ at, anchor, nodes, edges }`）が発火します。
- 読み込み時に検証を行い、存在しないノード／ポートを指すコネクタは警告付きで除外します。未対応の `format` / `version` はエラーになります
- ツールバーの「読み込み」「書き出し」ボタン、および `.json` ファイルのドラッグ＆ドロップ（`import-mode` に従う。`merge` のときはドロップ位置に配置）に対応しています
- Ctrl/Cmd + C はシステムのクリップボードにも選択部分の JSON を書き込み、Ctrl/Cmd + V は JSON テキストを受け付けます。別タブのエディタやテキストエディタとの間でノードをやり取りできます

## 自動整列

ツールバーの「整列」ボタン、または `el.autoLayout(options)` で階層レイアウトを適用します。
コネクタは常に「出力 → 入力」なので、出力側が左、入力側が右になるように層を作り、左から右へ並べます。

- 2 つ以上のノードを選択していればその範囲だけを対象にし、外側のノードは動かしません。選択が無ければ全ノードが対象です
- 層をまたぐコネクタには途中の層で場所を確保する（ダミーノード）ため、コネクタが他のノードの上を横切りません
- 層内の順序はバリセンタ法で交差を減らし、縦位置は隣接ノードの重心に寄せつつ重ならないように決めます
- サイクルがあるグラフでも動きます（DFS で逆向きのコネクタを見つけて一時的に反転）
- 連結していない部分（連結成分）は縦に積み、どこにも繋がっていないノードは最後にグリッドで並べます
- 1 回の Undo で整列前に戻ります。整列後は全体表示（選択範囲のみのときはその範囲へスクロール）します

```js
el.autoLayout();                                   // 選択 or 全体
el.autoLayout({ nodeIds: ['a', 'b', 'c'] });       // 対象を明示
el.autoLayout({ layerGap: 160, nodeGap: 24, fit: false });

// 位置だけ計算して自分で使う（ノードは動かさない）
import { layeredLayout } from '@hidemikimura/canvas-flow';
const positions = layeredLayout(el.editor.graph, el.editor.graph.nodes.keys()); // Map<id, {x, y}>
```

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `layerGap` | 120 | 層と層の横の間隔 |
| `nodeGap` | 40 | 同じ層のノード間の縦の間隔 |
| `componentGap` | 80 | 連結成分の間隔 |
| `dummyHeight` | 24 | 通過するコネクタ 1 本が確保する高さ |
| `iterations` | 8 | 順序付け・座標調整の反復回数 |
| `origin` | 対象の元の左上 | 整列後の左上の位置 |
| `fit` / `animate` | true / true | 整列後に表示を合わせる（`autoLayout` のみ） |

10,000 ノード・13,000 コネクタの全体整列で約 1 秒です（ヘッドレス Chromium）。

## Undo / Redo

`Graph` は取り消し可能な操作を `'op'` イベントとして発火し、`History`（`editor.history`）がそれを記録します。

- `Graph.batch()` の中の操作、および `history.begin()` 〜 `history.end()` の間の操作は 1 つの履歴項目になります（ドラッグ移動・リサイズは内部でこれを使用）
- 同じノード群の連続移動、同じノードの連続更新は 1 項目に併合されます
- `load()` / `clear()` で履歴は破棄されます。上限は `historyLimit`（既定 200）
- 独自の複合操作を 1 回の Undo にしたい場合は `editor.graph.batch(() => { ... })` で囲んでください

```js
editor.graph.batch(() => {
  const n = editor.graph.addNode({ title: 'A' });
  editor.graph.addNode({ title: 'B', x: 300 });
});
editor.undo(); // A と B がまとめて消える
```

## 見た目の変更

### テーマ

`theme` プロパティ（または `editor.setTheme(patch)`）で部分的に上書きします。キーは `src/core/theme.js` の `defaultTheme` を参照してください。

```js
el.theme = {
  background: '#0f172a',
  node: { fill: '#1e293b', headerFill: '#334155', titleColor: '#f1f5f9' },
  edge: { stroke: '#64748b' },
};
```

`node.headerHeight` / `node.itemHeight` / `node.padding` / `node.width` / `edge.curvature` / `edge.type` / `edge.stepOffset` はレイアウトにも反映されます。
強調表示の見た目は `focus`（`dimOpacity`, `dimOpacityLod`, `edgeStroke`, `edgeWidth`）です。
削除アイコンの見た目は `edge.deleteIcon`（`radius`, `fill`, `stroke`, `color`, `hoverFill`, `hoverColor`。半径は画面ピクセル）で変えられます。

### ノード種別・個別スタイル

優先順位は `node.style` > `nodeTypes[node.type].style` > `theme.node` です。コネクタは `edge.style` > `theme.edge`。

### 描画関数の差し替え

```js
el.editor.nodeRenderer = (ctx, node, rect, api) => {
  if (node.type !== 'circle') return false; // false / undefined で既定描画にフォールバック
  ctx.beginPath();
  ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.h / 2, 0, Math.PI * 2);
  ctx.fillStyle = api.selected ? api.style.selectedStroke : api.style.fill;
  ctx.fill();
  return true; // 既定描画を省略
};
el.editor.edgeRenderer = (ctx, edge, geom, api) => { /* 同様 */ };
```

`api` には `selected`, `hover`, `style`, `lod`, `zoom`, `theme`, `graph`, `roundRect()`, `fitText()` が入っています。

### 追加描画（オーバーレイ）

`overlayRenderer` はノードとコネクタを描いたあとに 1 回だけ呼ばれます。ノードの上に重ねたいもの（分析用のバーやバッジ、注釈）はここで描きます。既定描画を置き換える `nodeRenderer` と違い、簡易表示（LOD）の一括描画も維持されます。

```js
el.editor.overlayRenderer = (ctx, api) => {
  if (api.lod) return;                              // 縮小時は出さない
  for (const node of api.nodes) {                   // 表示範囲内のノードだけ渡される
    const r = api.graph.nodeRect(node);
    ctx.fillStyle = '#3b82f6';
    api.roundRect(r.x + 8, r.y + r.h - 6, (r.w - 16) * 0.42, 4, 2);  // 例: 下端に割合バー
    ctx.fill();
  }
};
el.editor.overlayRenderer = null;                   // 解除
```

ワールド座標系のまま呼ばれるので、画面上で一定の大きさにしたいものは `api.zoom` で割ります。`api` は `{ visible, lod, zoom, nodes, edges, theme, graph, roundRect(), fitText() }` です。

計測値をノードに重ねる例として、シナリオ分析ビューの試作を [`demo/analytics.html`](demo/analytics.html)（`npm run dev` で `/demo/analytics.html`）に置いています。項目行の下端に選択率のバー、ヘッダに離脱率のバー、ノードのヒートマップ、コネクタの太さ＝遷移数、ホバーで詳細を出す HTML の吹き出し、という構成です。

## パフォーマンスの仕組み

- ノード・コネクタは均一グリッドの空間インデックス（`SpatialIndex`）に登録し、描画・ヒットテスト・範囲選択は表示範囲のセルだけを見る
- 描画は `requestAnimationFrame` で 1 フレームにまとめる
- 拡大率が `theme.lodZoom`（既定 0.3 = 30%）以下になったら文字・ポート・影を省き、全ノード・全コネクタを 1 パスでまとめて描く（10,000 ノード全表示で十数 ms）。しきい値はテーマで変更可（例: `el.theme = { lodZoom: 0.2 }`）
- ミニマップのノード描画はオフスクリーンにキャッシュし、グラフ変更時のみ間引いて再描画
- テキストの省略（…）結果はキャッシュ

ヘッドレス Chromium での計測（10,000 ノード / 13,200 コネクタ、1400×900）: 100% 表示で 1 フレーム約 1〜2 ms、全体表示（5%）で約 14 ms。

## ディレクトリ

```
src/
  core/
    editor.js         NodeEditor（コア本体、コマンド・検索・ビュー操作）
    graph.js          Graph（ノード・エッジのモデル、ポート位置、複製、直列化）
    interaction.js    ポインタ・ホイール・キーボード・タッチ操作
    history.js        Undo / Redo
    serializer.js     JSON フォーマットの出力・検証・ID 付け替え、ファイル読み書きヘルパー
    layout.js         階層レイアウト（自動整列）
    renderer.js       Canvas 2D 描画（LOD、カスタム描画フック）
    minimap.js        ミニマップ
    spatial-index.js  空間インデックス
    viewport.js       パン・ズーム
    theme.js          既定テーマ
    emitter.js        イベントエミッタ
  lit/
    canvas-flow-editor.js  <canvas-flow-editor> Web Component
  index.js
demo/main.js          10,000 ノードのデモ
test/                 コアのユニットテスト（graph, history, serializer, limits, layout, port-visibility, edge-type）
docs/index.html       ドキュメントサイトの紹介ページ
docs/api.html         API 仕様書（パッケージに同梱）
docs/demo.html        CDN から読み込む 1 ファイルのデモ（パッケージに同梱）
docs/404.html         見つからない URL に返すページ
docs/_headers         レスポンスヘッダの設定
docs/_redirects       短縮 URL の設定（/demo, /api）
docs/vendor/          docs:build で生成するフォールバック（Git 管理外）
vite.docs.config.js   docs/vendor/canvas-flow.js を作るビルド設定
types/
  core.d.ts           コアの型定義（NodeEditor, Graph, データモデル, イベント）
  lit.d.ts            <canvas-flow-editor> の型定義
  index.d.ts          両方をまとめたエントリ
tsconfig.json         型定義の検証専用の設定
wrangler.toml         Cloudflare Workers の設定（静的アセット = docs）
```

公開されるパッケージには `dist/`（ビルド済み ESM + ソースマップ）、`src/`（元のソース）、
`types/`（型定義）、`docs/` の 3 ページ、`README.md`、`CHANGELOG.md`、`LICENSE` が含まれます。

## ドキュメントサイト（Cloudflare Workers）

`docs/` をそのまま静的サイトとして公開できます。中身は紹介ページ `index.html`、デモ `demo.html`、
API 仕様書 `api.html`、`404.html` と、CDN に届かないとき用のフォールバック `vendor/canvas-flow.js`
（`npm run docs:build` が `lit` まで含めた 1 ファイルとして生成。Git 管理外）です。
`demo.html` は jsDelivr →`vendor/` → リポジトリの `src/` の順に読み込み先を試すので、npm 公開前でもデモが動きます。

配信は Cloudflare Workers の静的アセット機能を使います。`wrangler.toml` の `[assets] directory = "./docs"` が
公開するディレクトリで、Worker のスクリプトは無し（アセットのみ）です。
Cloudflare は「Start new projects with Workers.」として新規プロジェクトを Workers に寄せており、
ダッシュボードから Pages プロジェクトを新規作成する入口は現在ありません。

まずローカルで確認します。

```bash
npm run docs:build     # docs/vendor/canvas-flow.js を生成
npm run docs:preview   # docs/ をそのまま配信して表示を確認
```

### 方法 A: wrangler で直接アップロード

```bash
npx wrangler login     # 初回のみ（ブラウザで認証）
npm run deploy:docs    # docs:build → wrangler deploy
```

公開 URL は `https://canvas-flow.<アカウントのサブドメイン>.workers.dev`、独自ドメインは https://canvas-flow.io です。

### 方法 B: Git 連携（push で自動デプロイ）

Cloudflare ダッシュボードの Workers & Pages → Create application → Workers の「リポジトリをインポート」から
このリポジトリを選び、次のように設定します。

| 項目 | 値 |
| --- | --- |
| プロジェクト名 | `canvas-flow` |
| 本番ブランチ | `main` |
| ビルドコマンド | `npm run docs:build` |
| デプロイコマンド | `npx wrangler deploy` |
| ルートディレクトリ | 空欄のまま |

公開するディレクトリはダッシュボードではなく `wrangler.toml` の `[assets] directory` で決まります。
以後 `main` への push ごとに本番デプロイ、それ以外のブランチはプレビューデプロイになります。
独自ドメインを使う場合はプロジェクトの Settings → Domains & Routes から追加してください。

`docs/_headers`（セキュリティヘッダ）と `docs/_redirects` は Workers の静的アセットでもそのまま解釈されます。
存在しない URL には `docs/404.html` を返します（`not_found_handling = "404-page"`）。

URL の正規化は Workers の既定（`html_handling = "auto-trailing-slash"`）に任せています。`/demo.html` は `/demo` へ
307 で正規化され、`/demo` がそのファイルを返します。**したがって `_redirects` に `/demo → /demo.html` を書いてはいけません**
（正規化と往復して無限リダイレクトになります）。HTML ファイル内のリンクは `demo.html` のような相対パスのままにしてあり、
ローカルでファイルを直接開いたときや npm パッケージに同梱された状態でも辿れるようにしています（公開サイトでは 307 が 1 回入ります）。
`_headers` で同じヘッダ名を複数のルールに書くと値がカンマで連結されるため、`Cache-Control` は `/vendor/*` にだけ指定しています。

### つまずいたときは

- `npm error Missing script: "docs:build"` → `package.json` や `vite.docs.config.js` がまだ push されていません。
  Cloudflare はリモートのリポジトリを clone してビルドします
- `Missing entry-point to Worker script or to assets directory` → `wrangler.toml` の `[assets] directory` が
  読めていません。`pages_build_output_dir`（Pages 用の設定）が残っていると Pages プロジェクト扱いになり、このエラーになります
- ビルドコマンドに `npm ci` を重ねる必要はありません。Cloudflare が先に `npm clean-install` を実行します
- ビルド環境の npm は install スクリプトを既定でブロックするため、`package.json` に
  `"allowScripts": { "esbuild": true }` を入れて esbuild（Vite が使う）のインストールを許可しています
- どうしても `*.pages.dev` で公開したい場合は、Pages 自体はまだ使えるので CLI から作れます。
  `npx wrangler pages project create canvas-flow --production-branch main` のあと
  `npx wrangler pages deploy docs`（この場合 `wrangler.toml` の `[assets]` は使われません）

## リリース手順（メンテナ向け）

1. 変更内容を `CHANGELOG.md` の `Unreleased` に追記し、リリース時に `## [X.Y.Z] - YYYY-MM-DD` の節へ移してリンクも更新する
2. `npm run release:check`（テスト → 型定義の検証 → ビルド → `npm pack --dry-run` で同梱ファイルを確認）
3. `npm version patch | minor | major`（`package.json` の更新と `vX.Y.Z` タグの作成。先にバージョンを手で上げてある場合は `git tag vX.Y.Z`）
4. `docs/api.html`・`docs/index.html`・`docs/demo.html` に書いてあるバージョン表記も合わせる
5. `npm publish`（`prepublishOnly` でテスト、`prepack` でビルドが走る。スコープ付きだが `publishConfig.access: "public"` を設定済みなので `npm publish` だけで公開される。うまくいかないときは `npm publish --access public`）
6. `git push && git push --tags`
7. `npm run deploy:docs`（ドキュメントサイトを更新。GitHub に push すれば Cloudflare 側のビルドでも反映される）

`files` に列挙したものだけが公開されます。新しく配布したいファイルを足したときは
`npm pack --dry-run` で中身を確認してください。

## ライセンス

MIT © Hidemi Kimura — 詳細は [LICENSE](LICENSE) を参照してください。

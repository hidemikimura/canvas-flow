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
- コネクタの描画方法を曲線（ベジェ）／直線／直角（階段状）から選べる。全体の既定とコネクタ単位の両方で指定可
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

## 開発（このリポジトリで作業する場合）

```bash
npm install          # 依存関係（lit, vite, vitest）
npm run dev          # デモ (index.html) を http://localhost:5173 で起動
npm test             # コアのユニットテスト
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
  ],
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
  "nodes": [ { "id": "a", "title": "A", "x": 0, "y": 0, "items": [] } ],
  "edges": [ { "id": "e1", "source": "a", "sourcePort": "out", "target": "b", "targetPort": "in" } ],
  "viewport": { "tx": 0, "ty": 0, "zoom": 1 }
}
```

`format` / `version` / `viewport` は省略可能で、プレーンな `{nodes, edges}` も読み込めます。

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
docs/api.html         API 仕様書（パッケージに同梱）
```

公開されるパッケージには `dist/`（ビルド済み ESM + ソースマップ）、`src/`（元のソース）、
`docs/api.html`、`README.md`、`CHANGELOG.md`、`LICENSE` が含まれます。

## リリース手順（メンテナ向け）

1. 変更内容を `CHANGELOG.md` の `Unreleased` に追記する
2. `npm run release:check`（テスト → ビルド → `npm pack --dry-run` で同梱ファイルを確認）
3. `npm version patch | minor | major`（`package.json` の更新と `vX.Y.Z` タグの作成）
4. `npm publish`（`prepublishOnly` でテスト、`prepack` でビルドが走る。スコープ付きだが `publishConfig.access: "public"` を設定済みなので、初回も `npm publish` だけで公開される。うまくいかないときは `npm publish --access public`）
5. `git push && git push --tags`

`files` に列挙したものだけが公開されます。新しく配布したいファイルを足したときは
`npm pack --dry-run` で中身を確認してください。

## ライセンス

MIT © Hidemi Kimura — 詳細は [LICENSE](LICENSE) を参照してください。

# API 早見表

`el` は `<canvas-flow-editor>` 要素、`ed = el.editor`（`NodeEditor`）、`g = ed.graph`（`Graph`）。
シグネチャの正は `types/core.d.ts` / `types/lit.d.ts`。ここに無いものは型定義を grep してください。
「Undo 可」の操作はユーザーの Undo で戻せます（`load` / `clear` / `importJSON` の replace を除く）。

## 目次

- Web Component の属性・プロパティ
- モデル操作（Graph）
- 位置を指定して追加
- 選択・表示
- 編集コマンド
- 子ノード・グループ・メモ・goto
- JSON 入出力
- 見た目
- イベント
- コアだけで使う場合

## Web Component の属性・プロパティ

| 属性 / プロパティ | 既定 | 説明 |
| --- | --- | --- |
| `data`（プロパティのみ） | – | 代入すると `load()` される |
| `theme`（プロパティのみ） | – | テーマの部分上書き |
| `nodeTypes` / `node-types` | `{}` | `{ [type]: { style } }` |
| `minimap` / `minimap-width` / `minimap-height` | true / 200 / 140 | ミニマップ |
| `toolbar` | true | 内蔵ツールバー（検索・ズーム・Undo・複製・削除・整列・読み込み・書き出し）。`el.toolbar = false` で消える。`slot="toolbar"` でボタンを足せる |
| `read-only` | false | 編集不可 |
| `wheel-mode` | `zoom` | `zoom` / `pan` |
| `drag-mode` | `pan` | 空白ドラッグ: `pan` / `select`（Shift で反転） |
| `import-mode` | `replace` | ツールバー・ファイルドロップでの読み込み方法（`replace` / `merge`） |
| `export-filename` | `canvas-flow.json` | 書き出しボタンのファイル名 |
| `max-inputs` / `max-outputs` / `on-full` | 無制限 / `reject` | 既定の接続上限と、満杯時に `reject`（拒否）か `replace`（古い方を外す） |
| `move-snap` | 0 | 移動の刻み（px） |
| `edge-type` | `bezier` | `bezier` / `straight` / `step` |
| `focus-mode` | `off` | 選択ノードと同じ流れを強調: `off` / `connected` / `neighbors` |
| `context-menu` | true | `"false"` で内蔵の右クリックメニューを出さない |
| `notes` | true | `"false"` でメモのバッジを描かない |
| `edge-delete-icon` | true | `"false"` でコネクタ中央の × を出さない |
| `group-on-drop` | true | `"false"` で置いた位置によるグループの出入りを止める |
| `contextMenuItems`（プロパティ） | null | 右クリックメニューの差し替え（配列 or `(ctx) => 配列`） |

真偽の属性は 2 種類あるので注意:
- `minimap` / `toolbar` / `read-only` は普通の HTML の真偽属性。**属性があれば値に関係なく true**（`toolbar="false"` でも表示される）。消すには JS で `el.toolbar = false` / `el.minimap = false` を代入する（フレームワークではプロパティとして渡す）。
- `context-menu` / `notes` / `edge-delete-icon` / `group-on-drop` は既定 true で、`"false"`（または `"0"`）を書くと false になる。

## モデル操作（Graph）

| メソッド | 説明 |
| --- | --- |
| `g.addNode(spec) → Node` | 追加（id 重複は例外）。`childs` もまとめて追加 |
| `g.getNode(id)` / `g.nodes`（Map） | 取得 / 全件 |
| `g.updateNode(id, patch)` | 部分更新（`title`, `x`, `y`, `width`, `items`, `style`, `data` …）。Undo 可 |
| `g.updateItem(nodeId, itemId, patch)` / `g.addItem(nodeId, item, index?)` / `g.removeItem(nodeId, itemId)` | 項目。削除時はその項目のコネクタも消える |
| `g.moveNodes(ids, dx, dy)` | 相対移動 |
| `g.removeNode(id)` / `g.removeNodes(ids)` | 接続コネクタ・子孫ごと削除 |
| `g.addEdge(spec) → Edge \| null` | 検証して追加（上限超過は常に拒否） |
| `g.connect(src, sp, dst, dp, { replace? })` | `rules.onFull` に従って接続（満杯なら付け替え） |
| `g.connectError(src, sp, dst, dp)` / `g.canConnect(...)` | 接続できない理由 / 可否 |
| `g.updateEdge(id, patch)` / `g.removeEdge(id)` / `g.getEdge(id)` / `g.edges`（Map） | コネクタ |
| `g.edgesOf(nodeId)` | ノードにつながるコネクタ |
| `g.portCapacity(nodeId, key) → { count, max, full }` | ポートの残り |
| `g.connectedTo(ids, { direction, depth })` | つながっているノード・コネクタ（`'downstream'` / `'upstream'` / `'lineage'` / `'both'`） |
| `g.nodeRect(id)` / `g.bounds()` | 矩形（高さ込み）/ 全体の外接矩形 |
| `g.batch(fn)` | 複数変更を 1 回の Undo・1 回の `change` にまとめる |
| `g.toJSON()` / `g.load(data)` / `g.clear()` | 直列化・置き換え・全消去 |

Web Component には `addNode` / `addEdge` / `removeNode` / `removeEdge` / `updateNode` / `updateItem` の委譲もある（中身は `g` と同じ）。

## 位置を指定して追加

```js
el.addNodeAt(spec, { at: { x, y } });                         // ワールド座標
el.addNodeAt(spec, { client: { clientX, clientY } });         // マウスイベントの座標のまま
el.addNodeAtPointer(spec);                                    // 最後のマウス位置（外なら画面中央）
el.addNodeAtCenter(spec, { avoidOverlap: true });             // 画面中央、重なれば右下へずらす
el.insertJSON(template, { at, anchor: 'origin' });            // 複数ノード＋コネクタを相対座標のまま追加（id 自動付け替え）
```

`addNodeAt` のオプション: `anchor`（`'center'` 既定 / `'top-left'` / `'header'`）、`select`（既定 true）、`snap`、`avoidOverlap`。追加後のノードが返る。ワールド座標への変換は `ed.clientToWorld(clientX, clientY)`。

## 選択・表示

| メソッド | 説明 |
| --- | --- |
| `ed.selection.nodes` / `.edges` / `.groups` | 選択中の id（Set。読み取り用） |
| `ed.selectedNodes` | 選択中の Node 配列 |
| `ed.select({ nodes, edges, groups }, { additive })` / `ed.clearSelection()` / `ed.selectAll()` | 選択を変える |
| `el.focusNode(id, { zoom, animate })` | ノードを画面中央へ |
| `el.fitView()` / `el.zoomIn()` / `el.zoomOut()` / `el.resetZoom()` | ビュー |
| `el.search(query)` | タイトル・項目・id の部分一致（文字列 / RegExp / 関数） |
| `el.setFocusMode(mode, { direction })` | 強調表示 |
| `ed.hitTest(wx, wy)` | その位置にあるもの（`{ type: 'node' \| 'item' \| 'port' \| 'edge' \| 'group' \| 'none', ... }`） |

## 編集コマンド

`el.undo()` / `el.redo()` / `el.canUndo` / `el.canRedo`、`el.duplicateSelection()`、`el.deleteSelection()`、`el.deleteSelectedEdges({ scope })`、`el.autoLayout(options?)`（2 つ以上選択していればその範囲、なければ全体。移動したノード id を返す）、`ed.copySelection()` / `ed.paste(at?)`、`el.setEdgeType(type, edgeIds?)`、`el.setPortVisible(nodeId, key, visible)` / `el.setPortsVisible(nodeId, visible, itemId?)`、`el.snapNodes()`。

## 子ノード・グループ・メモ・goto

| 機能 | メソッド |
| --- | --- |
| 子ノード | `el.addChild(parentId, spec, index?)` / `el.detachChild(id, { x, y })` / `el.setParent(id, parentId \| null, index?)` / `el.childrenOf(id)` / `el.rootNodeOf(id)` |
| グループ | `el.addGroup(spec)` / `el.updateGroup(id, patch)` / `el.removeGroup(id, { withMembers })` / `el.groupNodes(ids, { label })` / `el.groupSelection()` / `el.ungroup(ids?)` / `el.fitGroup(id)` / `el.setNodeGroup(ids, groupId \| null)` / `el.groupOf(id)` / `el.groupMembers(id)` |
| メモ | `el.setNote(target, value \| null)` / `el.noteOf(target)` / `el.notesList()` / `el.editNote(target)` |
| goto | `el.setGoto(nodeId, value \| null, { itemId })` / `el.gotoLinks(nodeId?)` / `el.gotoSources(nodeId)` |

## JSON 入出力

| メソッド | 説明 |
| --- | --- |
| `el.toJSON()` / `ed.exportData({ selectionOnly, includeViewport })` | 保存用オブジェクト |
| `el.exportJSON({ pretty, selectionOnly })` / `el.downloadJSON(filename)` | 文字列 / ファイル保存 |
| `el.load(data)` | 置き換え（検証なし、Undo 履歴を消す） |
| `el.importJSON(input, { mode, at, anchor, fitView })` | 検証つきで読み込み。`{ ok, nodes, edges, groups, warnings }` か `{ ok: false, errors }` |
| `el.importFromFile(file)` / `el.openImportDialog()` | ファイルから |

コアの関数 `validate(data)` / `parse(input)` / `serialize(graph)` も `@hidemikimura/canvas-flow/core` から使える。

## 見た目

- `el.theme = { node: {...}, edge: {...}, port: {...}, group: {...}, note: {...}, background, grid }`（部分上書き。全キーは `defaultTheme`）
- `el.nodeTypes = { [type]: { style: { headerFill, fill, stroke, titleColor, ... } } }`
- 個別: `node.style` / `edge.style` / `group.style`
- `ed.nodeRenderer = (ctx, node, rect, api) => boolean` / `ed.edgeRenderer` / `ed.overlayRenderer = (ctx, api) => void`

## イベント

Web Component は `el.addEventListener('名前', e => e.detail)`、コアは `ed.on('名前', detail => ...)`（`on` は解除関数を返す）。

| Web Component | コア | detail |
| --- | --- | --- |
| `ready` | – | `{ editor }` |
| `graph-change` | `graph:change` | なし（モデルが変わるたび。ドラッグ中も） |
| `history-change` | `history:change` | `{ canUndo, canRedo }` |
| `selection-change` | `selection:change` | `{ nodes, edges, groups }`（id 配列） |
| `node-add` / `node-remove` / `node-change` | `node:add` / … | `Node` |
| `edge-add` / `edge-remove` / `edge-change` | `edge:add` / … | `Edge` |
| `nodes-move` / `nodes-move-end` | `nodes:move` / `nodes:move:end` | `{ ids, dx, dy }`（end はドラッグ終了時に 1 回） |
| `node-click` / `item-click` / `edge-click` / `canvas-click` / `group-click` | `node:click` / … | `{ node, item, header, port, x, y, shiftKey, ... }` など |
| `canvas-dblclick` / `edge-dblclick` | `canvas:dblclick` / `edge:dblclick` | `{ x, y, group? }` / `{ edge, at }` |
| `node-edit` / `item-edit` / `note-edit` / `group-edit` | `node:edit` / … | ダブルクリックでの編集開始。Web Component 側は `preventDefault()` で内蔵の入力欄を止めて自前の UI を出せる |
| `connect-rejected` | `connect:rejected` | `{ node, port, reason }`（満杯のポートから引こうとした） |
| `context-menu` / `context-menu-select` | `context:menu` | 右クリック。`preventDefault()` で内蔵メニューを止める |
| `import` / `import-error` / `export` / `insert` | 同名 | 読み込み・書き出し |
| `viewport-change` | `viewport:change` | `{ tx, ty, zoom }` |

## コアだけで使う場合

```js
import { NodeEditor } from '@hidemikimura/canvas-flow/core';
const ed = new NodeEditor(canvas, { minimapCanvas, readOnly: false, theme: {...}, nodeTypes: {...}, keyboardScope: container });
new ResizeObserver(() => { const r = container.getBoundingClientRect(); ed.resize(r.width, r.height); }).observe(container);
ed.load(data);
ed.on('node:edit', ({ node, screenRect }) => openInput(screenRect, node.title)); // インライン編集はホストが出す
// 後始末
ed.destroy();
```

コアにはツールバー・インライン編集・右クリックメニューの描画が無い（`context:menu` イベントだけ出る）。`resize()` を呼ばないとサイズ 0 のまま描かれない。

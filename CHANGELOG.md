# 変更履歴

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に沿って書き、
バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

### 追加
- **ノード・コネクタのメモ（`note`）**: `node.note` / `edge.note` に `'要確認'` または `{text, color}` を書くと、ノードの外側（コネクタは中点の近く）に色分けしたバッジで出る。ノードの大きさは変わらず、置き場所は他のノードやバッジと重ならない位置が自動で選ばれる。長いメモは 1 行に省略してホバーで全文を吹き出し表示、縮小時（LOD）は色の丸だけに縮退。バッジのダブルクリックで編集、右クリックメニューに「メモを追加 / 編集 / 削除」。API: `setNote(target, value)` / `noteOf(target)` / `notes()` / `noteAt(x, y)` / `noteBoxes()`、Lit は `setNote` / `noteOf` / `notesList()` / `editNote(target)` と属性 `notes="false"`、イベント `note:hover` / `note:edit`（Lit: `note-hover` / `note-edit`）。テーマ `theme.note`
- **バッジの配置ヘルパー `graph.placeNear(anchor, size, options)`**: 小さな矩形を、ノードや既に置いた矩形と重ならない位置に置く。候補（`top-right` / `top-left` / `bottom-right` / `bottom-left` / `top` / `bottom` / `left` / `right` / `inside-top-right` / `center`）を順に試し、`{x, y, w, h, placement, free}` を返す。メモの配置に使っているものをそのまま公開しているので、`overlayRenderer` で独自のバッジを出すときにも使える。`normalizeNote(value)` / `rectsOverlap(a, b)` も公開

## [0.5.0] - 2026-09-18

### 変更
- **強調表示の `'lineage'`（既定）の意味を変更**: 「起点の祖先（上流）と子孫（下流）だけ＝起点を通る道筋」になり、祖先から分かれた別の枝や子孫へ合流してくる別の枝は入らなくなった。`A → B → C` に加えて `A → D`（コネクタでも `goto` でも）があるとき、C を選んでも D は強調されない。従来どおり前後の枝まで含めたいときは `direction: 'both'`

## [0.4.0] - 2026-09-18

### 追加
- **コネクタを使わない ID 指定の遷移（`goto`）**: ノードと項目に `goto`（`'n1'` / `['n1','n2']` / `{to:'n1', label:'戻る'}`）を書くと、コネクタを引かずに遷移を表せる。`connectedTo()` がコネクタと同じ向きのつながりとして辿るので **`focus-mode` の強調表示にも入り**（`{ links: false }` で除外）、`autoLayout()` も層の計算に使う。描画は普段なしで、選択時・強調表示で辿られたときだけ点線の矢印（`theme.goto`）。API: `setGoto(node, value, { itemId })` / `gotoLinks(node?)` / `gotoSources(node)` / `gotoTargets(node)` / `gotoAnchor(link)` と `normalizeGoto(value)`。JSON はそのまま保存・復元し、merge で ID が付け替わるときは遷移先も追従する

### 変更
- `connectedTo()` の戻り値に `links`（辿った goto のキー）が増え、既定で goto も辿るようになった（`{ links: false }` で従来どおりコネクタだけ）
- `focus:change`（Lit: `focus-change`）の detail に `links` が増えた

## [0.3.0] - 2026-09-17

### 追加
- **右クリックメニュー**: 対象（ノード／項目／子ノード／コネクタ／空白）ごとに項目を出し分ける内蔵メニュー。未選択のものは右クリックで選択され、選択中なら複数選択を保つ。コアは `context:menu` イベント（`{ type, node, item, edge, port, x, y, screen, client, selection, originalEvent }`）を発火し、描画は Lit 版が担当する。項目は `contextMenuItems`（配列 or `(ctx) => 項目[]`、`ctx.defaultItems` に既定の項目）で差し替え・追加でき、`context-menu` イベントを `preventDefault()` すれば自前のメニューに置き換えられる。`closeContextMenu()` / `openContextMenuAt(x, y)`、実行時に `context-menu-select`、属性 `context-menu="false"` で無効、`read-only` では出さない。既定項目を組み立てる `defaultContextMenuItems(ctx)` も公開
- ノード・コネクタを描いたあとに呼ばれる追加描画 `overlayRenderer`（`(ctx, { visible, lod, zoom, nodes, edges, theme, graph, roundRect, fitText })`）。ノードの上にバーやバッジを重ねられる。`nodeRenderer` と違い既定描画・LOD の一括描画をそのまま使う
- シナリオ分析ビューの試作 `demo/analytics.html`（項目行の選択率バー、ヘッダの離脱率バー、ノードのヒートマップ、コネクタの太さ＝遷移数、ホバーで詳細を出す HTML の吹き出し）
- 強調表示されている要素をまとめて選択する `selectFocused(options?)`（`{ additive?, depth?, direction? }`）。ツールバーの「強調を選択」ボタンと Ctrl/Cmd + Shift + A からも実行できる。強調表示が無効のときは `focusDirection` / `focusDepth` の設定どおりに辿って選択する。選択後に `focus:select`（Lit: `focus-select`、`{ mode, nodes, edges }`）が発火。選択した範囲はそのまま強調対象として固定される（次の選択・グラフ変更まで）ため、繰り返し押しても範囲が広がらない

### 変更
- 右クリックでブラウザ既定のメニューを抑制するだけだった挙動を変え、`context:menu` イベントを発火するようになった（未選択のノード・コネクタを右クリックすると選択される）
- `Ctrl/Cmd + Shift + A` を「強調表示されている要素をまとめて選択」に割り当てた（`Ctrl/Cmd + A` の全選択は従来どおり）

## [0.2.0] - 2026-09-17

### 追加
- **ノードの中の子ノード（`childs`）**: ノードに `childs` を持たせると、その中に子ノードが入る。親の項目の下に縦に自動配置され（位置と幅は親が計算）、入れ子は何段でも可。子も外のノードと自由に接続でき、端子は一番外側の親の左右の縁に並ぶ。親を消すと子孫ごと消え、複製は部分木ごと。API: `addChild(parentId, child, index?)` / `removeChild(id, {x, y})`（Web Component 版は DOM の予約名を避けて `detachChild`）/ `setParent(id, parentId | null, index?)` / `childrenOf` / `rootNodeOf`、`Graph` の `isChild` / `parentOf` / `rootOf` / `depthOf` / `descendantIds` / `rootNodes` / `relayoutChildren`。テーマ `node.childIndent`（10）/ `node.childGap`（6）
- **つながりの強調表示（`focus-mode`）**: 選択ノードと同じ流れにある要素だけをはっきり描き、他を薄くする。`setFocusMode(mode, { depth, direction })` / `focusMode` / `focusSet()` / `selectConnected()`、`graph.connectedTo(ids, { depth, direction, includeStart })`。向きは `lineage`（既定・同じ流れ全部）/ `downstream` / `upstream` / `both`。属性 `focus-mode`、イベント `focus:change`（Lit: `focus-change`）。テーマ `focus.dimOpacity` / `dimOpacityLod` / `edgeStroke` / `edgeWidth`
- **TypeScript 型定義 `types/*.d.ts`**: イベント名から `detail` の型が決まるイベントマップ、`hitTest` / `edgeGeometry` は判別可能ユニオン、`HTMLElementTagNameMap` 拡張でカスタム要素も型付き。`package.json` の `types` と `exports` の `types` 条件、`npm run test:types`（`tsc --noEmit`）を追加
- CDN 版デモ `docs/demo.html`（1 ファイル完結。jsDelivr → 同梱 vendor → リポジトリの src の順にフォールバック）
- ドキュメントサイト `docs/`（紹介ページ `docs/index.html`、`404.html`、`_headers` / `_redirects`）。Cloudflare Workers の静的アセットで https://canvas-flow.io に配信。`npm run docs:build` / `docs:preview` / `deploy:docs`

### 変更
- `Graph#nodeHeight` が子ノードの分を含むようになった（子を持たないノードの結果は従来どおり）
- `Graph#moveNodes` は渡された ID を一番外側の親に置き換えて動かす（子ノード単独では動かせない）
- `Graph#removeNode` / `removeNodes` は子孫ノードもまとめて削除する
- `Graph#toJSON` / `serialize()` はトップレベルに親を持たないノードだけを並べ、子は `childs` に入れ子で出力する（子の `x` / `y` / `width` は出力しない）
- `Graph#nodeWidth` / `nodeHeight` / `nodeRect` はノードオブジェクトに加えて ID も受け取れる

## [0.1.0] - 2026-09-17

初回リリース。

### 追加
- Canvas 2D 描画のノードエディタコア `NodeEditor`（フレームワーク非依存）と Lit Web Component `<canvas-flow-editor>`
- 空間インデックスによる表示範囲のみの描画・ヒットテスト、縮小時の簡易表示（LOD, `theme.lodZoom` 既定 0.3）
- 選択 / 範囲選択 / ドラッグ移動 / 一括移動 / 複製 / コピー＆ペースト / 削除
- ノード内項目と項目ごとの入出力ポート、ポートごとの接続数上限（`reject` / `replace`）、ポートの表示・非表示
- コネクタの作成・削除（ホバー／選択時の削除アイコン）、選択範囲内のコネクタのみ削除
- コネクタの描画方法の切り替え（`bezier` / `straight` / `step`）
- Undo / Redo、ノード幅リサイズ、タッチのピンチズーム
- 無限スクロール、ホイールズーム、縮尺リセット・全体表示、検索とセンタリング、ミニマップ
- JSON インポート／エクスポート、JSON を指定位置に追加（テンプレート挿入）
- 自動整列（階層レイアウト）
- ノードの移動単位（グリッド吸着）
- テーマ・ノード種別・個別スタイル・描画関数の差し替え
- クリック系イベント（`node:click` / `item:click` / `edge:click` / `canvas:click`）
- API 仕様書 `docs/api.html`

[Unreleased]: https://github.com/hidemikimura/canvas-flow/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/hidemikimura/canvas-flow/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/hidemikimura/canvas-flow/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/hidemikimura/canvas-flow/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/hidemikimura/canvas-flow/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hidemikimura/canvas-flow/releases/tag/v0.1.0

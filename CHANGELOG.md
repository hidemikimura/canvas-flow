# 変更履歴

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に沿って書き、
バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

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

[Unreleased]: https://github.com/hidemikimura/canvas-flow/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/hidemikimura/canvas-flow/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hidemikimura/canvas-flow/releases/tag/v0.1.0

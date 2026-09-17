# 変更履歴

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に沿って書き、
バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

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

[Unreleased]: https://github.com/hidemikimura/canvas-flow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hidemikimura/canvas-flow/releases/tag/v0.1.0

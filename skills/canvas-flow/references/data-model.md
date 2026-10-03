# データモデルと JSON 形式

型の正式な定義は `types/core.d.ts` の `Node` / `NodeItem` / `Edge` / `Group` / `CanvasFlowData`。

## 目次

- ファイル形式
- ノード（Node）
- 項目（NodeItem）
- ポート（PortSpec とポートキー）
- コネクタ（Edge）
- 子ノード（childs）
- グループ（Group）
- メモ（note）と goto
- 大きさと座標
- 読み込み時の検証

## ファイル形式

```json
{
  "format": "canvas-flow",
  "version": 1,
  "nodes": [],
  "edges": [],
  "groups": [],
  "viewport": { "tx": 0, "ty": 0, "zoom": 1 }
}
```

`format` / `version` / `groups` / `viewport` は省略可能で、`{ nodes, edges }` だけでも読み込めます。`format` が `"canvas-flow"` 以外、`version` が対応より新しいとエラーになります。

## ノード（Node）

```js
{
  id: 'n1',                 // 一意。省略すると自動生成（addNode）
  title: '料金案内',         // ヘッダの文字
  x: 0, y: 0,               // 左上のワールド座標（px）
  width: 220,               // 省略時は theme.node.width（200）
  type: 'process',          // 任意。nodeTypes のスタイルを当てる鍵
  input: true,              // ヘッダ左の入力ポート
  output: { max: 3 },       // ヘッダ右の出力ポート（ここから出せるコネクタは 3 本まで）
  showPorts: false,         // 任意。このノードの全ポートの丸を隠す（接続は残る）
  items: [ /* NodeItem */ ],
  childs: [ /* 子ノード */ ],
  group: 'g1',              // 任意。所属グループの id（親を持たないノードのみ）
  goto: 'n9',               // 任意。コネクタを使わない遷移先
  note: { text: '要確認', color: 'amber' },  // 任意。外側に出るメモのバッジ
  style: { headerFill: '#fee' },             // 任意。theme.node.* の上書き
  data: { anything: true }, // 任意。アプリ固有の値（JSON にそのまま残る）
}
```

`parent` は子ノードに自動で入る読み取り専用の値です。入力で渡しても無視されます。

## 項目（NodeItem）

ノードの中の 1 行。ポートは行ごとに付きます。

```js
{ id: 'p0', label: 'value', value: '10', input: 1, output: true, showPorts: true, goto: 'n3', data: {} }
```

- `label` は左寄せ、`value` は右寄せで表示。`value` があればダブルクリックで `value` を、無ければ `label` を編集する（Web Component の内蔵インライン編集）。
- `id` はノード内で一意。省略すると自動生成されるが、コネクタのポートキーに使うので**コネクタを持つ項目には id を明示する**。

## ポート（PortSpec とポートキー）

`input` / `output` に書く値:

| 値 | 意味 |
| --- | --- |
| 省略 / `false` | ポートなし（接続できない） |
| `true` | ポートあり。上限は `rules.maxInputs` / `maxOutputs`（既定 無制限） |
| 数値 `n` | 最大 `n` 本 |
| `{ max: n, visible: false }` | 最大 `n` 本、端子の丸を表示しない（既存の接続やプログラムからの接続は有効） |

`output` の上限は「そのポートから出せる本数」、`input` は「そのポートに入れる本数」。

ポートキー:

| 場所 | 入力 | 出力 |
| --- | --- | --- |
| ヘッダ | `'in'` | `'out'` |
| 項目 `p0` | `'item:p0:in'` | `'item:p0:out'` |

`import { portKey, parsePortKey } from '@hidemikimura/canvas-flow'` で生成・分解できます。ポートが描かれる位置は左（入力）右（出力）の縁で、行の高さの中央です。

## コネクタ（Edge）

```js
{
  id: 'e1',                 // 省略すると自動生成
  source: 'n1', sourcePort: 'item:p0:out',  // 必ず出力ポート
  target: 'n2', targetPort: 'in',           // 必ず入力ポート
  type: 'step',             // 任意。'bezier' | 'straight' | 'step'（省略時は全体の既定）
  note: 'この経路は暫定',     // 任意
  style: { stroke: '#f00' },// 任意。theme.edge.* の上書き
  data: {},                 // 任意
}
```

追加できない条件（`connectError` の理由）: `same-node`（同じノード同士）/ `invalid-port`（向きが出力→入力でない、書式違い）/ `missing-port`（そのポートが無い）/ `duplicate`（同じ組がすでにある）/ `source-full` / `target-full`（上限超過）。
`g.addEdge()` に入力→出力の向きで渡すと自動で入れ替えますが、**JSON の読み込み（`importJSON` / `parse` / `validate`）では逆向きのコネクタは「存在しないポート」として捨てられます**。データは必ず出力→入力で書くこと。

## 子ノード（childs）

```js
{ id: 'parent', title: '親', x: 0, y: 0, items: [...],
  childs: [ { id: 'c1', title: '子', input: true, output: true, childs: [ /* 孫も可 */ ] } ] }
```

- 子は親の項目の下に縦に並ぶ。`x` / `y` / `width` は親が決める（書いても無視）。
- 子のポートの丸は一番外側の親の左右の縁に並ぶ。子も外のノードと自由に接続できる。
- 子だけをドラッグで動かすことはできない（掴むと親ごと動く）。親を消すと子孫も消える。
- JSON では子は `childs` に入れ子で出力され、トップレベルの `nodes` には親を持たないノードだけが並ぶ。コネクタは入れ子に関係なく `edges` に平らに並ぶ。
- 後から変える: `el.addChild(parentId, spec, index?)` / `el.detachChild(id, {x, y})` / `el.setParent(id, parentId | null, index?)`。

## グループ（Group）

ノードの背面に描く、左上にラベルの付いた枠（React Flow の LabeledGroupNode 相当）。0.7.0 より後のバージョンで追加。

```json
{ "groups": [ { "id": "g1", "label": "前処理", "x": 0, "y": 0, "width": 560, "height": 160, "style": {}, "data": {} } ],
  "nodes": [ { "id": "a", "title": "受付", "x": 24, "y": 48, "group": "g1" } ] }
```

- メンバーはノードの `group` で決まる。枠を動かすとメンバーごと動く。
- グループは自動では大きくならない。データから作るときは、メンバーが収まる大きさを計算するか、読み込み後に `el.fitGroup(id)` を呼ぶ。上端に約 24px のラベル帯があるので、ノードはそれより下に置く。
- 入れ子のグループは無い。グループに入れるのは親を持たないノードだけ。
- ユーザーがノードをドラッグで置くと、置いた位置のグループに自動で出入りする（`group-on-drop="false"` で無効）。

## メモ（note）と goto

- `note`: `'要確認'` または `{ text, color? }`。color は `gray` / `blue` / `amber` / `red` / `green` / `purple` か CSS の色。ノードの外側（コネクタは中点付近）にバッジで出る。ノードの大きさは変わらない。
- `goto`: コネクタを引かずに遷移先を表す。`'n1'` / `['n1', 'n2']` / `{ to: 'n1', label: '戻る' }` / その配列。ノードにも項目にも書ける。普段は描かれず、選択時や強調表示時に点線で出る。強調表示（`focus-mode`）と自動整列（`autoLayout`）はコネクタと同じつながりとして扱う。

## 大きさと座標

- ノードの高さ = `headerHeight(30) + 項目数 × itemHeight(26) + padding(8)`（項目が 0 なら padding なし）+ 子ノードの分。値はテーマ `node.*` で変わる。
- 座標はワールド座標（拡大率 1 のときの px）。データから並べるなら、横に 280〜320px、縦にノードの高さ + 40px 程度の間隔を空けると重ならない。位置を考えずに並べて `el.autoLayout()` に任せる手もある（コネクタが左 → 右に流れる階層レイアウト。Undo 可）。

## 読み込み時の検証

`importJSON` / `parse` / `validate` は次を行います。

- エラー（読み込み中止）: ルートがオブジェクトでない、`nodes` / `edges` / `groups` が配列でない、ノード id やグループ id の重複、未対応の format / version。
- 警告（その部分だけ捨てて続行）: 存在しないノード・ポートを指すコネクタ、解釈できない `note` / `goto` / `group`、配列でない `items` / `childs`。
- 数値でない `x` / `y` は 0 に、不正な `width` は削除。項目 id の重複は付け替え。

`load()` は検証を省きます（速いが、壊れたコネクタは黙って捨て、ノード id の重複では例外になる）。外部から来るデータには `importJSON()` を使い、戻り値の `ok` / `errors` / `warnings` を確認すること。

/**
 * canvas-flow — フレームワーク非依存コアの型定義。
 *
 *   import { NodeEditor } from '@hidemikimura/canvas-flow/core';
 */

/* ============================================================
 * 基本的な形
 * ============================================================ */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 入れ子のオブジェクトも部分指定できるようにする（テーマの上書き等） */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/* ============================================================
 * ポート（端子）
 * ============================================================ */

export type PortDir = 'in' | 'out';

/**
 * ポートキー。ヘッダは `'in'` / `'out'`、項目は `'item:<itemId>:in'` / `'item:<itemId>:out'`。
 * `portKey()` で生成できる。任意の文字列も受け付ける（JSON 由来の値をそのまま渡せるように）。
 */
export type PortKey =
  | 'in'
  | 'out'
  | `item:${string}:in`
  | `item:${string}:out`
  | (string & {});

/**
 * ポートの定義。
 *  - `false` / 省略 … ポートなし
 *  - `true` … 本数無制限
 *  - 数値 … 接続できる本数の上限
 *  - オブジェクト … `max`（上限）と `visible`（端子の丸を描くか）
 */
export type PortSpec = boolean | number | { max?: number; visible?: boolean };

/** `normalizePortSpec()` の戻り値 */
export interface NormalizedPortSpec {
  max: number;
  visible: boolean;
}

/** `graph.nodePorts()` が返すポート情報（座標はワールド座標） */
export interface PortInfo {
  key: PortKey;
  dir: PortDir;
  /** ヘッダポートなら null */
  itemId: string | null;
  x: number;
  y: number;
  visible: boolean;
}

/** `graph.portCapacity()` の戻り値 */
export interface PortCapacity {
  count: number;
  max: number;
  full: boolean;
}

/** `graph.connectError()` が返す理由 */
export type ConnectErrorReason =
  | 'same-node'
  | 'invalid-port'
  | 'missing-port'
  | 'duplicate'
  | 'source-full'
  | 'target-full';

/* ============================================================
 * ノードとコネクタ
 * ============================================================ */

/**
 * `goto`（コネクタを使わない ID 指定の遷移）に書ける値。
 * `'n1'` / `['n1','n2']` / `{to:'n1', label:'戻る'}` / その配列。
 */
export type GotoTarget = string | { to: string; label?: string };
export type GotoSpec = GotoTarget | GotoTarget[];

/** `gotoLinks()` / `gotoSources()` が返す 1 本の遷移 */
export interface GotoLink {
  /** 安定した識別子（`goto:<from>:<itemId|->:<index>`） */
  key: string;
  /** 出発ノードの id */
  from: string;
  /** 項目に書かれている場合はその項目 id（ノード本体なら null） */
  itemId: string | null;
  /** 遷移先ノードの id */
  to: string;
  label: string | null;
  /** 遷移先ノードが存在するか */
  exists: boolean;
}

/** ノード内の項目（行） */
export interface NodeItem {
  id: string;
  label?: string;
  value?: string | number;
  /** 入力ポート（このポートで終了できるコネクタ数） */
  input?: PortSpec;
  /** 出力ポート（このポートから開始できるコネクタ数） */
  output?: PortSpec;
  /** false でこの項目のポートをまとめて非表示 */
  showPorts?: boolean;
  /** コネクタを使わない ID 指定の遷移先（この項目が選ばれたときに進むノード） */
  goto?: GotoSpec;
  data?: unknown;
}

export interface Node {
  id: string;
  x: number;
  y: number;
  title?: string;
  /** `registerNodeType()` で登録した種別 */
  type?: string;
  /** 省略時は `theme.node.width` */
  width?: number;
  input?: PortSpec;
  output?: PortSpec;
  /** false でこのノードのポートをまとめて非表示 */
  showPorts?: boolean;
  items?: NodeItem[];
  /**
   * 子ノード。親の項目の下に縦に並び、位置と幅は親が自動計算する
   * （子の `x` / `y` / `width` は無視される）。JSON の入出力にも使う。
   */
  childs?: ChildNodeInput[];
  /** 親ノードの id（子ノードにのみ入る。読み取り専用。`setParent()` で変更する） */
  parent?: string;
  /** コネクタを使わない ID 指定の遷移先 */
  goto?: GotoSpec;
  /** `theme.node.*` の上書き */
  style?: Partial<NodeStyle>;
  data?: unknown;
}

/** `addNode()` に渡す値。id は省略すると自動生成される */
export type NodeInput = Omit<Node, 'id'> & { id?: string };

/**
 * 子ノードに渡す値。位置と幅は親が自動計算するので x / y / width は不要
 * （渡しても無視される）。
 */
export type ChildNodeInput = Omit<NodeInput, 'x' | 'y' | 'width'> & {
  x?: number;
  y?: number;
  width?: number;
};

export type EdgeType = 'bezier' | 'straight' | 'step';

/** コネクタ（接続線）。常に「出力ポート → 入力ポート」 */
export interface Edge {
  id: string;
  source: string;
  sourcePort: PortKey;
  target: string;
  targetPort: PortKey;
  /** 描画方法。省略時は全体の既定（`theme.edge.type`） */
  type?: EdgeType;
  /** `theme.edge.*` の上書き */
  style?: Partial<EdgeStyle>;
  data?: unknown;
}

/** `addEdge()` / `connect()` に渡す値 */
export type EdgeInput = Omit<Edge, 'id'> & { id?: string };

/* ============================================================
 * コネクタの形状
 * ============================================================ */

interface EdgeGeometryCommon {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 折れ線の頂点列（bezier では始点・制御点 2 つ・終点の 4 点） */
  points: Point[];
}

export interface BezierEdgeGeometry extends EdgeGeometryCommon {
  type: 'bezier';
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
}

export interface PolylineEdgeGeometry extends EdgeGeometryCommon {
  type: 'straight' | 'step';
}

export type EdgeGeometry = BezierEdgeGeometry | PolylineEdgeGeometry;

/* ============================================================
 * テーマ
 * ============================================================ */

export interface GridStyle {
  color: string;
  size: number;
  majorEvery: number;
  majorColor: string;
}

export interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  headerFill: string;
  headerHeight: number;
  titleColor: string;
  textColor: string;
  itemHeight: number;
  itemSeparator: string;
  padding: number;
  width: number;
  /** 子ノードを親の左右からどれだけ内側に置くか */
  childIndent: number;
  /** 子ノードどうしの縦の間隔 */
  childGap: number;
  selectedStroke: string;
  selectedStrokeWidth: number;
  hoverStroke: string;
  shadow: string | null;
}

/** goto（ID 指定の遷移）の点線 */
export interface GotoStyle {
  stroke: string;
  strokeWidth: number;
  dash: number[];
  arrow: number;
  labelColor: string;
  labelFont: string;
  labelBg: string;
}

export interface PortStyle {
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  hoverFill: string;
  connectedFill: string;
  /** 上限に達したポートの色 */
  fullFill: string;
}

export interface DeleteIconStyle {
  /** 画面ピクセル単位（ズームに影響されない） */
  radius: number;
  fill: string;
  stroke: string;
  color: string;
  hoverFill: string;
  hoverColor: string;
}

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  selectedStroke: string;
  selectedStrokeWidth: number;
  hoverStroke: string;
  pendingStroke: string;
  /** 描画方法の既定 */
  type: EdgeType;
  /** bezier の曲がり具合 */
  curvature: number;
  /** step のとき水平に突き出す最小長さ */
  stepOffset: number;
  deleteIcon: DeleteIconStyle;
}

export interface FocusStyle {
  /** 薄くする側の不透明度 */
  dimOpacity: number;
  /** 簡易表示（LOD）中に薄くする側の不透明度 */
  dimOpacityLod: number;
  /** 繋がっているコネクタの色（null で通常どおり） */
  edgeStroke: string | null;
  /** 繋がっているコネクタの太さ（null で通常どおり） */
  edgeWidth: number | null;
}

export interface MinimapStyle {
  background: string;
  border: string;
  node: string;
  selectedNode: string;
  viewportFill: string;
  viewportStroke: string;
}

export interface Theme {
  background: string;
  grid: GridStyle;
  font: string;
  titleFont: string;
  node: NodeStyle;
  port: PortStyle;
  edge: EdgeStyle;
  goto: GotoStyle;
  focus: FocusStyle;
  selectionBox: { fill: string; stroke: string };
  minimap: MinimapStyle;
  /** この拡大率以下で簡易描画（LOD）に切り替わる */
  lodZoom: number;
}

export type ThemePatch = DeepPartial<Theme>;

export const defaultTheme: Theme;
export function mergeTheme(base: Theme, patch?: ThemePatch | null): Theme;

/* ============================================================
 * 接続ルールとレイアウト値
 * ============================================================ */

export interface ConnectRules {
  /** ポート側で上限を指定しないときの既定（入力側） */
  maxInputs: number;
  /** ポート側で上限を指定しないときの既定（出力側） */
  maxOutputs: number;
  /** 上限に達したポートへ接続したときの挙動 */
  onFull: 'reject' | 'replace';
}

/** 座標計算に使うレイアウト値（テーマから同期される） */
export interface GraphLayout {
  headerHeight: number;
  itemHeight: number;
  padding: number;
  defaultWidth: number;
  curvature: number;
  edgeType: EdgeType;
  stepOffset: number;
  /** 子ノードの左右インデント */
  childIndent: number;
  /** 子ノード同士の縦の間隔 */
  childGap: number;
}

/* ============================================================
 * JSON
 * ============================================================ */

export interface ViewportSnapshot {
  tx: number;
  ty: number;
  zoom: number;
}

/** `{nodes, edges}` だけのプレーンな形も受け付ける */
export interface CanvasFlowData {
  format?: string;
  version?: number;
  nodes: Node[];
  edges: Edge[];
  viewport?: ViewportSnapshot | null;
}

export type CanvasFlowInput = CanvasFlowData | { nodes?: Node[]; edges?: Edge[] } | string;

export interface ValidateResult {
  ok: boolean;
  data: CanvasFlowData | null;
  errors: string[];
  warnings: string[];
}

export interface ImportResult {
  ok: boolean;
  mode: 'replace' | 'merge';
  nodes: Node[];
  edges: Edge[];
  warnings: string[];
  errors?: string[];
}

export const FORMAT: 'canvas-flow';
export const FORMAT_VERSION: 1;

export function serialize(
  graph: Graph,
  options?: { nodeIds?: readonly string[] | null; viewport?: ViewportSnapshot | null },
): CanvasFlowData;
export function parse(input: string | object): ValidateResult;
export function validate(data: unknown): ValidateResult;
export function remapForMerge(
  data: CanvasFlowData,
  graph: Graph,
  options?: { offset?: Point; forceNewIds?: boolean },
): { nodes: Node[]; edges: Edge[]; idMap: Map<string, string> };
export function downloadText(text: string, filename: string, type?: string): void;
export function pickTextFile(accept?: string): Promise<string | null>;

/* ============================================================
 * ユーティリティ
 * ============================================================ */

export function uid(prefix?: string): string;
export function portKey(itemId: string | null | undefined, dir: PortDir): PortKey;
export function parsePortKey(key: string): { itemId: string | null; dir: PortDir } | null;
/** `goto` の値を `[{to, label?}]` に正規化する */
export function normalizeGoto(value: GotoSpec | null | undefined): Array<{ to: string; label?: string }>;

export function normalizePortSpec(spec: PortSpec | undefined, defaultMax?: number): NormalizedPortSpec | null;
export function withPortVisible(spec: PortSpec | undefined, visible: boolean): PortSpec;

export const EDGE_TYPES: readonly ['bezier', 'straight', 'step'];
/** 'line' → 'straight'、'orthogonal' / 'smoothstep' → 'step'。不明な値は 'bezier' */
export function normalizeEdgeType(type: string | undefined | null): EdgeType;
export function edgeGeometryFor(
  type: EdgeType,
  a: Point,
  b: Point,
  layout?: Partial<Pick<GraphLayout, 'curvature' | 'stepOffset'>>,
  dir?: 1 | -1,
): EdgeGeometry;
/** 形状上の点（bezier は媒介変数、折れ線は道のり比） */
export function geometryPoint(g: EdgeGeometry, t?: number): Point;
/** 形状を折れ線で近似する（ヒットテスト用） */
export function geometryPolyline(g: EdgeGeometry, segments?: number): Point[];

/* ============================================================
 * Emitter
 * ============================================================ */

export type Unsubscribe = () => void;

export class Emitter<Events = Record<string, unknown>> {
  on<K extends keyof Events & string>(type: K, fn: (payload: Events[K]) => void): Unsubscribe;
  off<K extends keyof Events & string>(type: K, fn: (payload: Events[K]) => void): void;
  emit<K extends keyof Events & string>(type: K, payload?: Events[K]): void;
}

/* ============================================================
 * Viewport / SpatialIndex / Minimap / Renderer / History
 * ============================================================ */

export class Viewport {
  constructor(options?: { minZoom?: number; maxZoom?: number });
  tx: number;
  ty: number;
  zoom: number;
  width: number;
  height: number;
  minZoom: number;
  maxZoom: number;
  setSize(width: number, height: number): void;
  toWorld(sx: number, sy: number): Point;
  toScreen(wx: number, wy: number): Point;
  visibleRect(margin?: number): Rect;
  panBy(dx: number, dy: number): void;
  clampZoom(z: number): number;
  zoomAt(sx: number, sy: number, factor: number): void;
  setZoomAt(sx: number, sy: number, nextZoom: number): void;
  centerOn(wx: number, wy: number, zoom?: number): void;
  reset(): void;
  fitRect(rect: Rect, padding?: number): void;
  snapshot(): ViewportSnapshot;
  restore(s: ViewportSnapshot): void;
}

/** 均一グリッドの空間インデックス */
export class SpatialIndex {
  constructor(cellSize?: number);
  insert(id: string, rect: Rect): void;
  remove(id: string): void;
  update(id: string, rect: Rect): void;
  getRect(id: string): Rect | undefined;
  query(rect: Rect): string[];
  queryPoint(x: number, y: number): string[];
  clear(): void;
}

export interface RenderStats {
  nodes: number;
  edges: number;
  ms: number;
}

/** 右クリック（`context:menu` / `context-menu`）の内容 */
export interface ContextMenuDetail {
  /** 右クリックした対象の種類（`hitTest` と同じ） */
  type: 'none' | 'node' | 'item' | 'port' | 'resize' | 'edge' | 'edge-delete';
  node: Node | null;
  item: NodeItem | null;
  edge: Edge | null;
  port: PortInfo | null;
  /** ワールド座標 */
  x: number;
  y: number;
  /** canvas 基準のスクリーン座標 */
  screen: Point;
  /** ビューポート基準（clientX / clientY） */
  client: Point;
  /** メニューを出す直前の選択 */
  selection: { nodes: string[]; edges: string[] };
  originalEvent: MouseEvent;
}

/** 描画関数の差し替え（`nodeRenderer` / `edgeRenderer`）に渡される補助オブジェクト */
export interface RenderApi<Style> {
  selected: boolean;
  hover: boolean;
  style: Style;
  /** 簡易描画中か */
  lod: boolean;
  zoom: number;
  theme: Theme;
  graph: Graph;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fitText(text: string, w: number, font?: string): string;
}

/** true を返すと既定の描画を省略する */
export type NodeRenderer = (
  ctx: CanvasRenderingContext2D,
  node: Node,
  rect: Rect,
  api: RenderApi<NodeStyle>,
) => boolean | void;

/** true を返すと既定の描画を省略する */
export type EdgeRenderer = (
  ctx: CanvasRenderingContext2D,
  edge: Edge,
  geometry: EdgeGeometry,
  api: RenderApi<EdgeStyle>,
) => boolean | void;

/** `overlayRenderer` に渡される情報 */
export interface OverlayInfo {
  /** いま描画している範囲（ワールド座標） */
  visible: Rect;
  /** 簡易描画（LOD）中か */
  lod: boolean;
  zoom: number;
  /** 描画対象のノード（子ノードも含む） */
  nodes: Node[];
  edges: Edge[];
  theme: Theme;
  graph: Graph;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fitText(text: string, w: number, font?: string): string;
}

/**
 * ノード・エッジを描いたあとに呼ばれる追加描画。ワールド座標系で呼ばれるので、
 * 画面上で一定の大きさにしたいものは `zoom` で割る。
 */
export type OverlayRenderer = (ctx: CanvasRenderingContext2D, info: OverlayInfo) => void;

export class Renderer {
  constructor(canvas: HTMLCanvasElement, graph: Graph, viewport: Viewport, theme: Theme);
  renderNode: NodeRenderer | null;
  renderEdge: EdgeRenderer | null;
  renderOverlay: OverlayRenderer | null;
  resolveNodeStyle: (node: Node) => NodeStyle;
  resolveEdgeStyle: (edge: Edge) => EdgeStyle;
  stats: RenderStats;
  setTheme(theme: Theme): void;
}

export class Minimap {
  constructor(canvas: HTMLCanvasElement, editor: NodeEditor);
  resize(width: number, height: number, dpr?: number): void;
  invalidate(): void;
  toWorld(mx: number, my: number): Point;
  render(): void;
  destroy(): void;
}

export interface HistoryEvents {
  change: { canUndo: boolean; canRedo: boolean };
}

export class History extends Emitter<HistoryEvents> {
  constructor(graph: Graph, options?: { limit?: number });
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** 複数の操作を 1 項目にまとめる（`end()` と対にする） */
  begin(label?: string): void;
  end(): void;
  undo(): boolean;
  redo(): boolean;
  clear(): void;
  destroy(): void;
}

/** ポインタ・ホイール・キーボード・タッチ操作の受け付け */
export class Interaction {
  constructor(editor: NodeEditor);
  dragThreshold: number;
  pointerInside: boolean;
  destroy(): void;
}

/* ============================================================
 * 自動整列
 * ============================================================ */

export interface LayeredLayoutOptions {
  /** 層の横間隔 */
  layerGap?: number;
  /** 同じ層のノードの縦間隔 */
  nodeGap?: number;
  /** 連結成分どうしの縦間隔 */
  componentGap?: number;
  /** 層をまたぐコネクタ用のダミーノードの高さ */
  dummyHeight?: number;
  /** 順序付けの反復回数 */
  iterations?: number;
  /** 左上の基準位置。省略時は対象ノードの元の左上 */
  origin?: Point;
}

/** 階層レイアウトの座標を計算する（グラフは変更しない） */
export function layeredLayout(
  graph: Graph,
  nodeIds?: readonly string[] | null,
  options?: LayeredLayoutOptions,
): Map<string, Point>;

/* ============================================================
 * Graph
 * ============================================================ */

export interface GraphEvents {
  change: undefined;
  load: undefined;
  clear: undefined;
  op: unknown;
  'node:add': Node;
  'node:remove': Node;
  'node:change': Node;
  'nodes:move': { ids: string[]; dx: number; dy: number };
  'edge:add': Edge;
  'edge:remove': Edge;
  'edge:change': Edge;
}

export class Graph extends Emitter<GraphEvents> {
  constructor(options?: { layout?: Partial<GraphLayout>; rules?: Partial<ConnectRules>; cellSize?: number });

  readonly nodes: Map<string, Node>;
  readonly edges: Map<string, Edge>;
  readonly nodeIndex: SpatialIndex;
  readonly edgeIndex: SpatialIndex;
  layout: GraphLayout;
  rules: ConnectRules;
  /** true の間は 'op' を発火しない（履歴の適用中・読み込み中） */
  silentOps: boolean;

  setLayout(layout: Partial<GraphLayout>): void;

  /* 座標 */
  nodeWidth(nodeOrId: Node | string): number;
  /** ヘッダ＋項目＋子ノードの高さ */
  nodeHeight(nodeOrId: Node | string): number;
  nodeRect(nodeOrId: Node | string): Rect;
  /** 子ノードの幅（親の幅からインデントを引いた値） */
  nodeWidthOfChild(parent: Node | string): number;
  /** ポートを描く左右の X（子ノードは一番外側の親の縁） */
  portEdgeX(node: Node): { in: number; out: number };
  nodePorts(node: Node, options?: { visibleOnly?: boolean }): PortInfo[];
  portPosition(nodeOrId: Node | string, key: PortKey): Point | null;
  itemRect(node: Node, itemId: string): Rect | null;
  edgeType(edge: Pick<Edge, 'type'> | undefined | null): EdgeType;
  edgeGeometry(edge: Edge): EdgeGeometry | null;
  edgePoint(edge: Edge, t?: number): Point | null;
  edgeRect(edge: Edge): Rect | null;

  /* ノード */
  /** `input.childs` があれば子ノードもまとめて追加する */
  addNode(input: NodeInput, options?: { parent?: string | null; index?: number }): Node;
  getNode(id: string): Node | undefined;
  updateNode(id: string, patch: Partial<Node>): Node | null;
  /** 検証を省いてノードを戻す（履歴の復元用） */
  restoreNode(snapshot: Node): Node;
  updateItem(nodeId: string, itemId: string, patch: Partial<NodeItem>): Node | null;
  addItem(nodeId: string, item: NodeItem, index?: number): Node | null;
  removeItem(nodeId: string, itemId: string): Node | null;
  /** 選択の移動。子ノードの id を渡すと一番外側の親ごと動く */
  moveNodes(ids: readonly string[], dx: number, dy: number): void;
  /** 子孫ごと削除する */
  removeNode(id: string): boolean;
  removeNodes(ids: readonly string[]): void;
  /** 親を持たないノードだけ */
  rootNodes(): Node[];

  /* 子ノード */
  /** 子ノードを順番どおりに返す */
  childrenOf(nodeOrId: Node | string): Node[];
  /** 子ノードかどうか */
  isChild(nodeOrId: Node | string): boolean;
  parentOf(nodeOrId: Node | string): Node | null;
  /** 一番外側の親（自分が子でなければ自分自身） */
  rootOf(nodeOrId: Node | string): Node | null;
  /** 入れ子の深さ（親を持たないノードは 0） */
  depthOf(nodeOrId: Node | string): number;
  descendantIds(nodeOrId: Node | string, options?: { includeSelf?: boolean }): string[];
  /** 子ノードを追加する（index で挿入位置を指定） */
  addChild(parentId: string, child: ChildNodeInput, index?: number): Node | null;
  /** 子ノードを親から外して独立したノードに戻す */
  removeChild(id: string, position?: Point): Node | null;
  /** 親を付け替える（parentId に null を渡すと独立。循環は拒否して false） */
  setParent(id: string, parentId: string | null, index?: number): boolean;
  /** 子ノードの x / y / width を親から計算して書き戻す（通常は自動） */
  relayoutChildren(nodeOrId: Node | string, options?: { reindex?: boolean }): void;

  /* ポート */
  portSpec(nodeOrId: Node | string, key: PortKey): NormalizedPortSpec | null;
  portEdges(nodeId: string, key: PortKey): Edge[];
  portCapacity(nodeId: string, key: PortKey): PortCapacity | null;
  portVisible(nodeOrId: Node | string, key: PortKey): boolean;
  setPortVisible(nodeId: string, key: PortKey, visible: boolean): boolean;
  setPortsVisible(nodeId: string, visible: boolean, itemId?: string): boolean;

  /* コネクタ */
  connectError(
    source: string,
    sourcePort: PortKey,
    target: string,
    targetPort: PortKey,
    options?: { replace?: boolean },
  ): ConnectErrorReason | null;
  canConnect(
    source: string,
    sourcePort: PortKey,
    target: string,
    targetPort: PortKey,
    options?: { replace?: boolean },
  ): boolean;
  /** `rules.onFull` に従って接続する（満杯なら付け替え） */
  connect(
    source: string,
    sourcePort: PortKey,
    target: string,
    targetPort: PortKey,
    options?: { replace?: boolean } & Partial<Omit<EdgeInput, 'source' | 'sourcePort' | 'target' | 'targetPort'>>,
  ): Edge | null;
  /** 検証して追加（常に拒否モード）。追加できなければ null */
  addEdge(input: EdgeInput): Edge | null;
  restoreEdge(snapshot: Edge): Edge | null;
  getEdge(id: string): Edge | undefined;
  updateEdge(id: string, patch: Partial<Edge>): Edge | null;
  restoreEdgeState(snapshot: Edge): Edge | null;
  removeEdge(id: string): boolean;
  removeEdges(ids: readonly string[]): void;
  edgesOf(nodeId: string): Edge[];
  /** 起点から辿れるノード・コネクタ・goto を集める（強調表示・まとめ選択用） */
  connectedTo(
    startIds: Iterable<string>,
    options?: { depth?: number; direction?: FocusDirection; includeStart?: boolean; links?: boolean },
  ): { nodes: Set<string>; edges: Set<string>; links: Set<string> };

  /* goto（ID 指定の遷移） */
  /** ノード（と項目）に書かれた goto の一覧。引数を省略するとグラフ全体 */
  gotoLinks(nodeOrId?: Node | string): GotoLink[];
  /** このノードを goto で指しているリンク */
  gotoSources(nodeOrId: Node | string): GotoLink[];
  /** goto の遷移先ノード（存在するものだけ） */
  gotoTargets(nodeOrId: Node | string): Node[];
  /** goto を設定する（itemId を渡すとその項目に。null で解除） */
  setGoto(nodeOrId: Node | string, value: GotoSpec | null, options?: { itemId?: string }): Node | NodeItem | null;
  /** 点線を描くための始点・終点 */
  gotoAnchor(link: GotoLink): { a: Point; b: Point } | null;

  /* 問い合わせ */
  nodesInRect(rect: Rect): Node[];
  edgesInRect(rect: Rect): Edge[];
  nodesFullyInRect(rect: Rect): Node[];
  bounds(): Rect | null;
  reindexAll(): void;

  /* まとめ操作 */
  duplicateNodes(
    ids: readonly string[],
    offset?: Point,
  ): { nodes: Node[]; edges: Edge[]; idMap: Map<string, string> };
  /** 複数の変更を 1 回の 'change' と 1 つの Undo 項目にまとめる */
  batch<T>(fn: () => T): T;

  /** 子ノードは `childs` に入れ子で出力される */
  toJSON(): { nodes: Node[]; edges: Edge[] };
  load(data: { nodes?: Node[]; edges?: Edge[] }): void;
  clear(): void;
}

/* ============================================================
 * NodeEditor
 * ============================================================ */

export interface NodeTypeDef {
  style?: Partial<NodeStyle>;
}

export interface NodeEditorOptions {
  theme?: ThemePatch;
  /** 既存の Graph を使う（省略時は内部で生成） */
  graph?: Graph;
  nodeTypes?: Record<string, NodeTypeDef>;
  minimapCanvas?: HTMLCanvasElement;
  /** ホイールの既定動作 */
  wheelMode?: 'zoom' | 'pan';
  /** 空白をドラッグしたときの動作 */
  dragMode?: 'pan' | 'select';
  readOnly?: boolean;
  historyLimit?: number;
  minNodeWidth?: number;
  rules?: Partial<ConnectRules>;
  /** ホバー・選択中のコネクタに削除アイコンを出す（既定 true） */
  edgeDeleteIcon?: boolean;
  /** キーボード操作を受け付ける範囲の要素 */
  keyboardScope?: EventTarget;
  /** この間隔（ms）以内のホイールイベントは同じ操作として扱う */
  wheelGestureGap?: number;
  /** ノードの移動単位（px）。0 で無効 */
  moveSnap?: number;
  /** 選択ノードと繋がっている要素を強調し、他を薄く描く（既定 'off'） */
  focusMode?: FocusMode | boolean;
  /** 'neighbors' のときに何段まで辿るか（既定 1） */
  focusDepth?: number;
  /** 辿る向き（既定 'lineage' = 上流をたどってから流れる先すべて） */
  focusDirection?: FocusDirection;
}

export type HitTestResult =
  | { type: 'none' }
  | { type: 'node'; node: Node; header: boolean }
  | { type: 'item'; node: Node; item: NodeItem }
  | { type: 'port'; node: Node; port: PortInfo }
  | { type: 'resize'; node: Node }
  | { type: 'edge'; edge: Edge }
  | { type: 'edge-delete'; edge: Edge };

export interface PointerInfo {
  world: Point;
  screen: Point;
  /** canvas の内側にポインタがあるか */
  inside: boolean;
}

/** クリック系イベントに共通して入る情報 */
export interface ClickDetail {
  /** ワールド座標 */
  x: number;
  y: number;
  screen: Point;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  pointerType: string;
  originalEvent: PointerEvent;
}

export type EdgeDeleteScope = 'between' | 'attached' | 'selected';
/** 強調表示の範囲 */
export type FocusMode = 'off' | 'connected' | 'neighbors';
/**
 * 強調表示で辿る向き。
 *  - 'lineage'（既定）… 先に上流をたどり、そこから流れる先すべて（同じ流れにあるもの）。
 *    途中のノードへ合流しているだけの別系統は入らない
 *  - 'downstream' … 選択ノードから進める先だけ
 *  - 'upstream' … 選択ノードへ入ってくる側だけ
 *  - 'both' … 向きを問わず繋がっているもの全部
 */
export type FocusDirection = 'lineage' | 'downstream' | 'upstream' | 'both';
export interface FocusSet {
  /** 辿った goto のキー */
  links?: Set<string>;
  nodes: Set<string>;
  edges: Set<string>;
}
export type NodeAnchor = 'center' | 'top-left' | 'header';
export type InsertAnchor = 'origin' | 'top-left' | 'center';

export interface AddNodeAtOptions {
  /** ワールド座標。省略時はポインタ位置（canvas 外なら画面中央） */
  at?: Point;
  /** クライアント座標（`at` の代わりに使える） */
  client?: Point;
  /** 位置に合わせるノードの基準点 */
  anchor?: NodeAnchor;
  select?: boolean;
  /** 移動単位に吸着する（既定は `moveSnap > 0`） */
  snap?: boolean;
  /** 既存ノードと重なる場合は右下へずらす */
  avoidOverlap?: boolean;
}

export interface ImportDataOptions {
  mode?: 'replace' | 'merge';
  offset?: Point;
  at?: Point;
  anchor?: InsertAnchor;
  select?: boolean;
  restoreViewport?: boolean;
  fitView?: boolean;
}

export interface InsertJSONOptions {
  at?: Point;
  client?: Point;
  /** 'origin' は JSON の座標を追加位置からの相対位置として扱う */
  anchor?: InsertAnchor;
  select?: boolean;
  snap?: boolean;
}

export interface AutoLayoutOptions extends LayeredLayoutOptions {
  /** 対象ノード。省略時は選択範囲、選択が 2 個未満なら全体 */
  nodeIds?: readonly string[];
  fit?: boolean;
  animate?: boolean;
}

export type SearchQuery = string | RegExp | ((node: Node) => boolean);

export interface NodeEditorEvents {
  render: RenderStats;
  'selection:change': { nodes: string[]; edges: string[] };
  'viewport:change': ViewportSnapshot;
  'graph:change': undefined;
  'history:change': { canUndo: boolean; canRedo: boolean };
  'node:add': Node;
  'node:remove': Node;
  'node:change': Node;
  'nodes:move': { ids: string[]; dx: number; dy: number };
  'nodes:move:end': { ids: string[]; dx: number; dy: number; start: Array<{ id: string; x: number; y: number }> };
  'node:resize:end': { id: string; from: number; to: number };
  'edge:add': Edge;
  'edge:remove': Edge;
  'edge:change': Edge;
  'edge:delete-icon': { edge: Edge };
  'edges:delete': { ids: string[]; scope: EdgeDeleteScope };
  'edge-type:change': { type: EdgeType; edges: string[] | null };
  'focus:change': { mode: FocusMode; direction: FocusDirection; nodes: string[]; edges: string[]; links: string[] };
  'focus:select': { mode: FocusMode; nodes: string[]; edges: string[] };
  'context:menu': ContextMenuDetail;
  'node:edit': { node: Node; rect: Rect; screenRect: Rect };
  'item:edit': { node: Node; item: NodeItem; rect: Rect; screenRect: Rect };
  'canvas:dblclick': Point;
  'edge:dblclick': { edge: Edge; at: Point };
  'connect:cancel': { from: { node: string; port: PortKey } };
  'connect:rejected': { node: string; port: PortKey; reason: 'source-full' | 'target-full' };
  'node:click': ClickDetail & { node: Node; item: NodeItem | null; header: boolean; port: PortKey | null };
  'item:click': ClickDetail & { node: Node; item: NodeItem };
  'edge:click': ClickDetail & { edge: Edge };
  'canvas:click': ClickDetail;
  import: ImportResult;
  export: { data: CanvasFlowData; selectionOnly: boolean };
  insert: { at: Point; anchor: InsertAnchor; nodes: Node[]; edges: Edge[] };
  layout: { nodes: string[] };
}

/**
 * ノードエディタ本体。`<canvas>` を渡すと描画と操作を引き受ける。
 * 読み取り専用モード（`options.readOnly`）では編集系メソッドは何もせず
 * null / false / 空配列を返す。
 */
export class NodeEditor extends Emitter<NodeEditorEvents> {
  constructor(canvas: HTMLCanvasElement, options?: NodeEditorOptions);

  readonly canvas: HTMLCanvasElement;
  readonly graph: Graph;
  readonly viewport: Viewport;
  readonly renderer: Renderer;
  readonly history: History;
  readonly interaction: Interaction;
  readonly minimap: Minimap | null;
  readonly selection: { nodes: Set<string>; edges: Set<string> };
  readonly hover: { node: string | null; edge: string | null; port: PortKey | null; edgeDelete: string | null };
  theme: Theme;
  nodeTypes: Record<string, NodeTypeDef>;
  options: NodeEditorOptions;

  /* 見た目 */
  setTheme(patch: ThemePatch): void;
  setRules(rules: Partial<ConnectRules>): void;
  registerNodeType(type: string, def: NodeTypeDef): void;
  set nodeRenderer(fn: NodeRenderer | null);
  set edgeRenderer(fn: EdgeRenderer | null);
  /** ノード・エッジを描いたあとに呼ばれる追加描画（バッジや分析表示など） */
  get overlayRenderer(): OverlayRenderer | null;
  set overlayRenderer(fn: OverlayRenderer | null);

  /** コネクタの描画方法。`edgeIds` を渡すとそのコネクタだけ（Undo 可） */
  setEdgeType(type: EdgeType | string, edgeIds?: readonly string[]): void;
  get edgeType(): EdgeType;
  set edgeType(type: EdgeType | string);
  /** 選択中のコネクタだけ変更する（選択が無ければ全体の既定） */
  setSelectedEdgeType(type: EdgeType | string): void;

  /* 強調表示 */
  /** 'connected' は辿れる範囲すべて、'neighbors' は `focusDepth` 段まで。既定は 'lineage'（上流 → そこから流れる先） */
  setFocusMode(mode: FocusMode | boolean, options?: { depth?: number; direction?: FocusDirection }): void;
  get focusMode(): FocusMode;
  set focusMode(mode: FocusMode | boolean);
  /** 現在の強調対象。無効なとき・選択が空のときは null */
  focusSet(): FocusSet | null;
  /** goto を設定する（Undo 可。readOnly では null） */
  setGoto(nodeOrId: Node | string, value: GotoSpec | null, options?: { itemId?: string }): Node | NodeItem | null;
  gotoLinks(nodeOrId?: Node | string): GotoLink[];
  gotoSources(nodeOrId: Node | string): GotoLink[];
  /** 繋がっている要素を選択に加える */
  selectConnected(options?: { depth?: number; direction?: FocusDirection }): { nodes: string[]; edges: string[] } | null;
  /**
   * 強調表示されている要素（`focusSet()` の中身）をそのまま選択する。
   * 強調表示が off のときは `focusDirection` / `focusDepth` の設定どおりに辿って選択する。
   * 選択ノードが無ければ null。
   */
  selectFocused(options?: {
    additive?: boolean;
    depth?: number;
    direction?: FocusDirection;
  }): { nodes: string[]; edges: string[] } | null;

  /* 移動単位 */
  setMoveSnap(step: number): void;
  get moveSnap(): number;
  snapValue(v: number): number;
  snapPoint(p: Point): Point;
  /** ノードの左上を移動単位に揃える。戻り値は動かしたノード ID */
  snapNodes(ids?: readonly string[]): string[];

  /* サイズ・描画 */
  resize(width: number, height: number, dpr?: number): void;
  resizeMinimap(width: number, height: number, dpr?: number): void;
  requestRender(): void;
  render(): void;

  /* 座標・ヒットテスト */
  clientToWorld(clientX: number, clientY: number): Point;
  worldRectToScreen(rect: Rect): Rect;
  hitTest(wx: number, wy: number): HitTestResult;
  edgeAt(wx: number, wy: number): Edge | null;
  deleteIconEdges(): Edge[];
  edgeDeleteIconRadius(): number;
  edgeDeleteIconAt(wx: number, wy: number): Edge | null;
  resizeGripSize(): number;
  getPointer(): PointerInfo | null;
  viewCenter(): Point;

  /* 選択 */
  select(
    target: { nodes?: readonly string[]; edges?: readonly string[] },
    options?: { additive?: boolean },
  ): void;
  toggleSelect(target: { nodes?: readonly string[]; edges?: readonly string[] }): void;
  clearSelection(): void;
  selectAll(): void;
  selectInRect(rect: Rect, options?: { additive?: boolean }): void;
  get selectedNodes(): Node[];
  selectedEdgeIds(options?: { scope?: EdgeDeleteScope }): string[];

  /* 編集 */
  deleteSelection(): void;
  /** 選択範囲のコネクタだけ削除する。戻り値は削除した ID */
  deleteSelectedEdges(options?: { scope?: EdgeDeleteScope }): string[];
  removeNode(id: string): boolean;
  removeEdge(id: string): boolean;
  duplicateSelection(offset?: Point): { nodes: Node[]; edges: Edge[]; idMap: Map<string, string> } | null;
  duplicateNode(id: string, offset?: Point): { nodes: Node[]; edges: Edge[]; idMap: Map<string, string> } | null;
  copySelection(): CanvasFlowData | null;
  paste(at?: Point): ImportResult | null;
  moveSelection(dx: number, dy: number): void;
  /** 選択ノードを移動単位で動かす（矢印キーの実装） */
  nudgeSelection(stepsX: number, stepsY: number, options?: { pixels?: number }): void;
  setPortVisible(nodeId: string, portKey: PortKey, visible: boolean): boolean;
  setPortsVisible(nodeId: string, visible: boolean, itemId?: string): boolean;
  /** 子ノードは幅を変えられないため null を返す */
  resizeNode(id: string, width: number): Node | null;

  /* 子ノード */
  /** 子ノードを追加する（Undo 可） */
  addChild(parentId: string, child: ChildNodeInput, index?: number): Node | null;
  /** 子を親から外して独立させる（Undo 可）。x / y を渡すとその位置に置く */
  removeChild(id: string, position?: Point): Node | null;
  /** 親子関係を付け替える（Undo 可）。parentId に null を渡すと独立させる */
  setParent(id: string, parentId: string | null, index?: number): boolean;
  /** 子ノードの配列（表示順） */
  childrenOf(nodeOrId: Node | string): Node[];
  /** 一番外側の親（自分が子でなければ自分自身） */
  rootNodeOf(nodeOrId: Node | string): Node | null;

  /* ノード追加 */
  addNodeAt(spec: NodeInput, options?: AddNodeAtOptions): Node | null;
  addNodeAtPointer(spec: NodeInput, options?: AddNodeAtOptions): Node | null;
  addNodeAtCenter(spec: NodeInput, options?: AddNodeAtOptions): Node | null;

  /* 自動整列 */
  autoLayout(options?: AutoLayoutOptions): Map<string, Point> | null;

  /* Undo / Redo */
  get canUndo(): boolean;
  get canRedo(): boolean;
  undo(): boolean;
  redo(): boolean;

  /* ビュー操作 */
  zoomIn(factor?: number): void;
  zoomOut(factor?: number): void;
  setZoom(zoom: number): void;
  resetZoom(): void;
  resetView(): void;
  fitView(padding?: number, options?: { animate?: boolean }): void;
  centerOnNode(id: string, options?: { zoom?: number; animate?: boolean; duration?: number }): void;
  centerOn(wx: number, wy: number, options?: { zoom?: number; animate?: boolean; duration?: number }): void;

  /* 検索 */
  search(query: SearchQuery): Node[];
  /** 検索して該当ノードを中央に表示・選択する */
  searchAndFocus(query: SearchQuery, index?: number): Node[];

  /* JSON */
  exportData(options?: { selectionOnly?: boolean; includeViewport?: boolean }): CanvasFlowData;
  exportJSON(options?: { pretty?: boolean; selectionOnly?: boolean; includeViewport?: boolean }): string;
  downloadJSON(filename?: string, options?: { selectionOnly?: boolean; includeViewport?: boolean }): void;
  importData(input: CanvasFlowInput, options?: ImportDataOptions): ImportResult;
  /** importData の別名 */
  importJSON(input: CanvasFlowInput, options?: ImportDataOptions): ImportResult;
  /** JSON を指定位置に追加する（テンプレート挿入） */
  insertJSON(input: CanvasFlowInput, options?: InsertJSONOptions): ImportResult;
  insertJSONAtPointer(input: CanvasFlowInput, options?: InsertJSONOptions): ImportResult;
  importFromFile(file: File, options?: ImportDataOptions): Promise<ImportResult>;
  openImportDialog(options?: ImportDataOptions): Promise<ImportResult | null>;
  toJSON(): CanvasFlowData;
  load(data: CanvasFlowInput): void;

  destroy(): void;
}

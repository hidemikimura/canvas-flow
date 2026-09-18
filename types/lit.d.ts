/**
 * canvas-flow — Lit Web Component `<canvas-flow-editor>` の型定義。
 *
 *   import '@hidemikimura/canvas-flow/lit';
 */
import { LitElement } from 'lit';
import type {
  AddNodeAtOptions,
  AutoLayoutOptions,
  CanvasFlowData,
  CanvasFlowInput,
  ChildNodeInput,
  ContextMenuDetail,
  GotoLink,
  GotoSpec,
  Graph,
  ConnectRules,
  Edge,
  EdgeDeleteScope,
  EdgeInput,
  EdgeType,
  FocusDirection,
  FocusMode,
  ImportDataOptions,
  ImportResult,
  InsertJSONOptions,
  Node,
  NodeEditor,
  NodeInput,
  NodeItem,
  NodeTypeDef,
  Point,
  PortKey,
  SearchQuery,
  ThemePatch,
} from './core.js';

export * from './core.js';

/** `<canvas-flow-editor>` が発火する CustomEvent の名前 → detail の対応 */
/** 右クリックメニューの 1 項目 */
export interface ContextMenuItem {
  /** 項目を見分ける ID（`context-menu-select` の detail に入る） */
  id?: string;
  label?: string;
  /** 右端に薄く出すショートカット表記（動作は割り当てない） */
  shortcut?: string;
  /** ホバー時のツールチップ */
  title?: string;
  /** 区切り線にする */
  type?: 'separator';
  disabled?: boolean;
  /** true で赤字（削除など） */
  danger?: boolean;
  /** 一覧から除く */
  hidden?: boolean;
  run?: (ctx: ContextMenuContext) => void | Promise<void>;
}

/** 項目を組み立てるときに渡される情報 */
export interface ContextMenuContext extends ContextMenuDetail {
  el: CanvasFlowEditor;
  editor: NodeEditor;
  graph: Graph;
  /** 既定の項目（これに足す／絞るのが簡単） */
  defaultItems: ContextMenuItem[];
}

/** 既定の項目を組み立てる（差し替え時に参考にできる） */
export function defaultContextMenuItems(ctx: ContextMenuContext): ContextMenuItem[];

export interface CanvasFlowEditorEventMap {
  ready: { editor: NodeEditor };
  'selection-change': { nodes: string[]; edges: string[] };
  'viewport-change': { tx: number; ty: number; zoom: number };
  'graph-change': undefined;
  'node-add': Node;
  'node-remove': Node;
  'node-change': Node;
  'nodes-move': { ids: string[]; dx: number; dy: number };
  'nodes-move-end': { ids: string[]; dx: number; dy: number };
  'node-resize-end': { id: string; from: number; to: number };
  'edge-add': Edge;
  'edge-remove': Edge;
  'edge-change': Edge;
  'edge-delete-icon': { edge: Edge };
  'edges-delete': { ids: string[]; scope: EdgeDeleteScope };
  'edge-type-change': { type: EdgeType; edges: string[] | null };
  'focus-change': { mode: FocusMode; direction: FocusDirection; nodes: string[]; edges: string[]; links: string[] };
  'focus-select': { mode: FocusMode; nodes: string[]; edges: string[] };
  /** 右クリック。`preventDefault()` すると内蔵メニューを出さない */
  'context-menu': ContextMenuDetail;
  'context-menu-select': { id: string | null; item: ContextMenuItem; target: ContextMenuContext | null };
  'history-change': { canUndo: boolean; canRedo: boolean };
  'canvas-dblclick': Point;
  'edge-dblclick': { edge: Edge; at: Point };
  'connect-cancel': { from: { node: string; port: PortKey } };
  'connect-rejected': { node: string; port: PortKey; reason: 'source-full' | 'target-full' };
  'node-click': { node: Node; item: NodeItem | null; header: boolean; port: PortKey | null };
  'item-click': { node: Node; item: NodeItem };
  'edge-click': { edge: Edge };
  'canvas-click': Point;
  'node-edit': { node: Node; rect: unknown; screenRect: unknown };
  'item-edit': { node: Node; item: NodeItem; rect: unknown; screenRect: unknown };
  import: ImportResult;
  'import-error': { errors: string[] };
  export: { data: CanvasFlowData; selectionOnly: boolean };
  insert: { at: Point; anchor: string; nodes: Node[]; edges: Edge[] };
  layout: { nodes: string[] };
  render: { nodes: number; edges: number; ms: number };
}

/**
 * ノードエディタの Web Component。コアの `NodeEditor` を包み、主要メソッドを委譲する。
 * `editor` プロパティから `NodeEditor` を直接触れる（`ready` 以降）。
 */
export class CanvasFlowEditor extends LitElement {
  /** 内部の NodeEditor。`ready` イベント以降に使える */
  editor: NodeEditor | null;

  /* プロパティ / 属性 */
  data: CanvasFlowInput | null;
  theme: ThemePatch | null;
  /** 属性 `node-types` */
  nodeTypes: Record<string, NodeTypeDef>;
  minimap: boolean;
  minimapWidth: number;
  minimapHeight: number;
  toolbar: boolean;
  /** 属性 `wheel-mode` */
  wheelMode: 'zoom' | 'pan';
  /** 属性 `drag-mode` */
  dragMode: 'pan' | 'select';
  /** 属性 `read-only` */
  readOnly: boolean;
  /** 属性 `import-mode` */
  importMode: 'replace' | 'merge';
  /** 属性 `max-inputs` */
  maxInputs: number;
  /** 属性 `max-outputs` */
  maxOutputs: number;
  /** 属性 `on-full` */
  onFull: ConnectRules['onFull'];
  /** 属性 `edge-delete-icon`（"false" で無効） */
  edgeDeleteIcon: boolean;
  /** 属性 `move-snap` */
  moveSnap: number;
  /** 属性 `edge-type` */
  edgeType: EdgeType;
  /** 属性 `focus-mode`。選択ノードと繋がっている要素を強調し他を薄くする */
  focusMode: FocusMode;
  /** 属性 `export-filename` */
  exportFilename: string;
  /** 属性 `context-menu`。`"false"` で内蔵の右クリックメニューを無効にする（read-only では出ない） */
  contextMenu: boolean;
  /** 右クリックメニューの項目。配列か、対象ごとに項目を組み立てる関数 */
  contextMenuItems: ContextMenuItem[] | ((ctx: ContextMenuContext) => ContextMenuItem[]) | null;

  /* 委譲メソッド */
  addNode(node: NodeInput): Node | null;
  addEdge(edge: EdgeInput): Edge | null;
  removeNode(id: string): boolean;
  removeEdge(id: string): boolean;
  updateNode(id: string, patch: Partial<Node>): Node | null;
  updateItem(nodeId: string, itemId: string, patch: Partial<NodeItem>): Node | null;
  duplicateSelection(offset?: Point): { nodes: Node[]; edges: Edge[]; idMap: Map<string, string> } | null;
  deleteSelection(): void;
  deleteSelectedEdges(options?: { scope?: EdgeDeleteScope }): string[];
  addNodeAt(spec: NodeInput, options?: AddNodeAtOptions): Node | null;
  addNodeAtPointer(spec: NodeInput, options?: AddNodeAtOptions): Node | null;
  addNodeAtCenter(spec: NodeInput, options?: AddNodeAtOptions): Node | null;
  /** goto（ID 指定の遷移）を設定する（itemId を渡すとその項目に。null で解除） */
  setGoto(nodeOrId: Node | string, value: GotoSpec | null, options?: { itemId?: string }): Node | NodeItem | null;
  /** goto の一覧（引数を省略するとグラフ全体） */
  gotoLinks(nodeOrId?: Node | string): GotoLink[];
  /** このノードを goto で指しているリンク */
  gotoSources(nodeOrId: Node | string): GotoLink[];
  /** 子ノードを追加する */
  addChild(parentId: string, child: ChildNodeInput, index?: number): Node | null;
  /** 子を親から外して独立させる（`removeChild` は DOM の予約名のため別名）。x / y を渡すとその位置に置く */
  detachChild(id: string, position?: Point): Node | null;
  /** 親子関係を付け替える。parentId に null を渡すと独立させる */
  setParent(id: string, parentId: string | null, index?: number): boolean;
  /** 子ノードの配列（表示順） */
  childrenOf(nodeOrId: Node | string): Node[];
  /** 一番外側の親（自分が子でなければ自分自身） */
  rootNodeOf(nodeOrId: Node | string): Node | null;
  getPointer(): { world: Point; screen: Point; inside: boolean } | null;
  /** 開いている右クリックメニューを閉じる */
  closeContextMenu(): void;
  /** 右クリックメニューを要素内の座標（px）に出す */
  openContextMenuAt(x: number, y: number, detail?: Partial<ContextMenuDetail>): void;
  setPortVisible(nodeId: string, portKey: PortKey, visible: boolean): boolean;
  setPortsVisible(nodeId: string, visible: boolean, itemId?: string): boolean;
  setMoveSnap(step: number): void;
  snapNodes(ids?: readonly string[]): string[];
  setEdgeType(type: EdgeType | string, edgeIds?: readonly string[]): void;
  setSelectedEdgeType(type: EdgeType | string): void;
  setFocusMode(mode: FocusMode | boolean, options?: { depth?: number; direction?: FocusDirection }): void;
  selectConnected(options?: { depth?: number; direction?: FocusDirection }): { nodes: string[]; edges: string[] } | null;
  /** 強調表示されている要素をそのまま選択する（強調表示が off なら設定どおりに辿って選択） */
  selectFocused(options?: {
    additive?: boolean;
    depth?: number;
    direction?: FocusDirection;
  }): { nodes: string[]; edges: string[] } | null;
  autoLayout(options?: AutoLayoutOptions): Map<string, Point> | null;
  undo(): boolean;
  redo(): boolean;
  get canUndo(): boolean;
  get canRedo(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  fitView(padding?: number): void;
  search(query: SearchQuery): Node[];
  focusNode(id: string, options?: { zoom?: number; animate?: boolean; duration?: number }): void;
  exportData(options?: { selectionOnly?: boolean; includeViewport?: boolean }): CanvasFlowData;
  exportJSON(options?: { pretty?: boolean; selectionOnly?: boolean; includeViewport?: boolean }): string;
  downloadJSON(filename?: string, options?: { selectionOnly?: boolean; includeViewport?: boolean }): void;
  importJSON(input: CanvasFlowInput, options?: ImportDataOptions): ImportResult | null;
  insertJSON(input: CanvasFlowInput, options?: InsertJSONOptions): ImportResult | null;
  insertJSONAtPointer(input: CanvasFlowInput, options?: InsertJSONOptions): ImportResult | null;
  importFromFile(file: File, options?: ImportDataOptions): Promise<ImportResult | null>;
  openImportDialog(options?: ImportDataOptions): Promise<ImportResult | null>;
  toJSON(): CanvasFlowData;
  load(data: CanvasFlowInput): void;

  addEventListener<K extends keyof CanvasFlowEditorEventMap>(
    type: K,
    listener: (this: CanvasFlowEditor, ev: CustomEvent<CanvasFlowEditorEventMap[K]>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof CanvasFlowEditorEventMap>(
    type: K,
    listener: (this: CanvasFlowEditor, ev: CustomEvent<CanvasFlowEditorEventMap[K]>) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'canvas-flow-editor': CanvasFlowEditor;
  }
}

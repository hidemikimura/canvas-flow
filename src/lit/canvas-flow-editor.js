import { LitElement, html, css, nothing } from 'lit';
import { NodeEditor } from '../core/editor.js';
import { defaultContextMenuItems } from './context-menu.js';

export { defaultContextMenuItems } from './context-menu.js';

/**
 * `<canvas-flow-editor>` — NodeEditor を包む Lit Web Component。
 *
 * 属性 / プロパティ:
 *  - data        {nodes, edges, viewport?}   グラフデータ（設定すると load）
 *  - theme       object                      テーマの部分上書き
 *  - node-types  object                      ノード種別 → {style}
 *  - minimap     boolean (既定 true)
 *  - toolbar     boolean (既定 true)
 *  - wheel-mode  'zoom' | 'pan'
 *  - drag-mode   'pan' | 'select'
 *  - read-only   boolean
 *  - import-mode 'replace' | 'merge'          ツールバー／ドロップでの読み込み方法（既定 replace）
 *  - export-filename string                   書き出しファイル名（既定 canvas-flow.json）
 *  - max-inputs / max-outputs number          ポート側で上限を指定しないときの既定の接続数上限
 *  - on-full     'reject' | 'replace'         満杯のポートへ接続したときの挙動（既定 reject）
 *  - edge-delete-icon "false" で無効          ホバー／選択中のコネクタ中央に削除アイコンを出す（既定 有効）
 *  - move-snap   number                       ノードの移動単位（px）。0 で無効（既定）
 *  - edge-type   bezier | straight | step     コネクタの描画方法（既定 bezier）。コネクタ単位は edge.type
 *  - focus-mode  off | connected | neighbors   選択ノードと繋がっている要素を強調し他を薄くする（既定 off）
 *  - context-menu "false" で無効             右クリックメニュー（既定 有効。read-only では出さない）
 *  - notes       "false" で無効              ノード・コネクタのメモのバッジ（既定 有効）
 *
 * 右クリックメニューの項目は `contextMenuItems`（配列 or (ctx) => 配列）で差し替え・追加できる。
 * `ctx` には `context-menu` イベントの detail に加えて `el` / `editor` / `graph` / `defaultItems` が入る。
 *
 * イベント（CustomEvent, detail に内容）:
 *  selection-change, viewport-change, graph-change, node-add, node-remove, node-change,
 *  nodes-move, nodes-move-end, node-resize-end, edge-add, edge-remove, edge-change,
 *  history-change, import, export, import-error, connect-rejected, layout,
 *  edge-type-change, focus-change, focus-select, edges-delete, insert,
 *  node-click, item-click, edge-click, canvas-click, canvas-dblclick, ready,
 *  context-menu（preventDefault で内蔵メニューを抑止できる）, context-menu-select,
 *  note-hover, note-edit
 *
 * メソッド: `editor` で NodeEditor を直接操作できるほか、よく使うものは委譲している。
 */
export class CanvasFlowEditor extends LitElement {
  static properties = {
    data: { attribute: false },
    theme: { attribute: false },
    nodeTypes: { attribute: 'node-types', type: Object },
    minimap: { type: Boolean },
    toolbar: { type: Boolean },
    wheelMode: { attribute: 'wheel-mode' },
    dragMode: { attribute: 'drag-mode' },
    readOnly: { attribute: 'read-only', type: Boolean },
    importMode: { attribute: 'import-mode' },
    maxInputs: { attribute: 'max-inputs', type: Number },
    maxOutputs: { attribute: 'max-outputs', type: Number },
    onFull: { attribute: 'on-full' },
    edgeDeleteIcon: { attribute: 'edge-delete-icon', converter: (v) => v !== 'false' && v !== '0' },
    moveSnap: { attribute: 'move-snap', type: Number },
    edgeType: { attribute: 'edge-type' },
    focusMode: { attribute: 'focus-mode' },
    exportFilename: { attribute: 'export-filename' },
    contextMenu: { attribute: 'context-menu', converter: (v) => v !== 'false' && v !== '0' },
    notes: { attribute: 'notes', converter: (v) => v !== 'false' && v !== '0' },
    contextMenuItems: { attribute: false },
    _dropping: { state: true },
    _menu: { state: true },
    _noteTip: { state: true },
    minimapWidth: { attribute: 'minimap-width', type: Number },
    minimapHeight: { attribute: 'minimap-height', type: Number },
    _editing: { state: true },
    _searchInfo: { state: true },
    _zoom: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 200px;
      overflow: hidden;
      font: 13px system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #1f2933;
      --cfe-panel-bg: rgba(255, 255, 255, 0.92);
      --cfe-panel-border: #c9ced6;
      --cfe-accent: #3b82f6;
    }
    .stage {
      position: absolute;
      inset: 0;
    }
    canvas.main {
      position: absolute;
      inset: 0;
      display: block;
      outline: none;
    }
    canvas.minimap {
      position: absolute;
      right: 12px;
      bottom: 12px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      cursor: pointer;
    }
    .toolbar {
      position: absolute;
      top: 12px;
      left: 12px;
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px;
      background: var(--cfe-panel-bg);
      border: 1px solid var(--cfe-panel-border);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      flex-wrap: wrap;
      max-width: calc(100% - 24px);
    }
    .toolbar button {
      appearance: none;
      border: 1px solid var(--cfe-panel-border);
      background: #fff;
      border-radius: 6px;
      padding: 4px 8px;
      min-width: 28px;
      cursor: pointer;
      font: inherit;
      line-height: 1.2;
    }
    .toolbar button:hover {
      border-color: var(--cfe-accent);
    }
    .toolbar button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .toolbar input {
      font: inherit;
      padding: 4px 8px;
      border: 1px solid var(--cfe-panel-border);
      border-radius: 6px;
      width: 160px;
    }
    .toolbar .sep {
      width: 1px;
      height: 20px;
      background: var(--cfe-panel-border);
      margin: 0 2px;
    }
    .toolbar .info {
      color: #64748b;
      min-width: 3.5em;
      text-align: center;
    }
    .drop-overlay {
      position: absolute;
      inset: 8px;
      border: 2px dashed var(--cfe-accent);
      border-radius: 10px;
      background: rgba(59, 130, 246, 0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--cfe-accent);
      font-size: 15px;
      pointer-events: none;
      z-index: 3;
    }
    .context-menu {
      position: absolute;
      z-index: 6;
      min-width: 180px;
      max-width: 280px;
      padding: 4px;
      background: #fff;
      border: 1px solid var(--cfe-panel-border);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      outline: none;
      user-select: none;
    }
    .context-menu button {
      appearance: none;
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 5px 8px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }
    .context-menu button:hover:not(:disabled),
    .context-menu button.active:not(:disabled) {
      background: rgba(59, 130, 246, 0.12);
    }
    .context-menu button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .context-menu button.danger:not(:disabled) {
      color: #b91c1c;
    }
    .context-menu button .shortcut {
      color: #94a3b8;
      font-size: 11px;
    }
    .context-menu .menu-sep {
      height: 1px;
      margin: 4px 2px;
      background: #eef1f5;
    }
    .note-tip {
      position: absolute;
      z-index: 5;
      max-width: 260px;
      padding: 6px 9px;
      border-radius: 7px;
      background: rgba(31, 41, 51, 0.95);
      color: #fff;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      pointer-events: none;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
    }
    .inline-editor {
      position: absolute;
      box-sizing: border-box;
      font: inherit;
      padding: 0 6px;
      border: 2px solid var(--cfe-accent);
      border-radius: 4px;
      background: #fff;
      outline: none;
      z-index: 2;
    }
  `;

  constructor() {
    super();
    this.minimap = true;
    this.toolbar = true;
    this.wheelMode = 'zoom';
    this.dragMode = 'pan';
    this.readOnly = false;
    this.importMode = 'replace';
    this.maxInputs = Infinity;
    this.maxOutputs = Infinity;
    this.onFull = 'reject';
    this.edgeDeleteIcon = true;
    this.moveSnap = 0;
    this.edgeType = 'bezier';
    this.focusMode = 'off';
    this.exportFilename = 'canvas-flow.json';
    this.contextMenu = true;
    this.notes = true;
    this._noteTip = null;
    /** @type {Array<object>|((ctx:object)=>Array<object>)|null} */
    this.contextMenuItems = null;
    this._menu = null;
    this._onMenuKey = this._onMenuKey.bind(this);
    this._onDocPointerDownForMenu = (e) => {
      const path = e.composedPath ? e.composedPath() : [e.target];
      if (!path.some((n) => n instanceof HTMLElement && n.classList?.contains('context-menu'))) this.closeContextMenu();
    };
    this._dropping = false;
    this.minimapWidth = 200;
    this.minimapHeight = 140;
    this.nodeTypes = {};
    this._editing = null;
    this._searchInfo = null;
    this._zoom = 1;
    this._searchMatches = [];
    this._searchIndex = 0;
    /** @type {NodeEditor|null} */
    this.editor = null;
  }

  firstUpdated() {
    const canvas = this.renderRoot.querySelector('canvas.main');
    const minimapCanvas = this.renderRoot.querySelector('canvas.minimap');
    this.editor = new NodeEditor(canvas, {
      theme: this.theme,
      nodeTypes: this.nodeTypes,
      minimapCanvas: this.minimap ? minimapCanvas : undefined,
      wheelMode: this.wheelMode,
      dragMode: this.dragMode,
      readOnly: this.readOnly,
      keyboardScope: this,
      rules: this._rules(),
      edgeDeleteIcon: this.edgeDeleteIcon,
      moveSnap: this.moveSnap,
      focusMode: this.focusMode,
    });
    const ed = this.editor;
    if (this.edgeType && this.edgeType !== 'bezier') ed.setEdgeType(this.edgeType);

    // コアイベントを CustomEvent として再発火
    const relay = (type, name) => ed.on(type, (detail) => this._dispatch(name, detail));
    relay('selection:change', 'selection-change');
    relay('viewport:change', 'viewport-change');
    relay('graph:change', 'graph-change');
    relay('node:add', 'node-add');
    relay('node:remove', 'node-remove');
    relay('node:change', 'node-change');
    relay('nodes:move', 'nodes-move');
    relay('nodes:move:end', 'nodes-move-end');
    relay('node:resize:end', 'node-resize-end');
    relay('history:change', 'history-change');
    relay('import', 'import');
    relay('export', 'export');
    ed.on('history:change', () => this.requestUpdate());
    relay('edge:add', 'edge-add');
    relay('edge:remove', 'edge-remove');
    relay('edge:change', 'edge-change');
    relay('canvas:dblclick', 'canvas-dblclick');
    relay('edge:dblclick', 'edge-dblclick');
    relay('connect:cancel', 'connect-cancel');
    relay('connect:rejected', 'connect-rejected');
    relay('edge:delete-icon', 'edge-delete-icon');
    relay('layout', 'layout');
    relay('edges:delete', 'edges-delete');
    relay('insert', 'insert');
    relay('edge-type:change', 'edge-type-change');
    relay('focus:change', 'focus-change');
    relay('focus:select', 'focus-select');
    relay('node:click', 'node-click');
    relay('item:click', 'item-click');
    relay('edge:click', 'edge-click');
    relay('canvas:click', 'canvas-click');
    relay('render', 'render');

    ed.on('viewport:change', (v) => {
      this._zoom = v.zoom;
    });
    ed.on('render', () => {
      if (Math.abs(this._zoom - ed.viewport.zoom) > 1e-6) this._zoom = ed.viewport.zoom;
    });

    // インライン編集
    ed.on('item:edit', ({ node, item, screenRect }) => {
      if (this.readOnly) return;
      if (this._dispatch('item-edit', { node, item }, true)) {
        this._startEdit({ kind: 'item', nodeId: node.id, itemId: item.id, value: item.value ?? item.label ?? '', screenRect });
      }
    });
    ed.on('node:edit', ({ node, screenRect }) => {
      if (this.readOnly) return;
      if (this._dispatch('node-edit', { node }, true)) {
        this._startEdit({ kind: 'title', nodeId: node.id, value: node.title ?? '', screenRect });
      }
    });
    ed.on('viewport:change', () => {
      this._cancelEdit();
      this.closeContextMenu();
      this._noteTip = null;
    });

    // 右クリックメニュー
    ed.on('context:menu', (detail) => this._openContextMenu(detail));

    // メモ: ホバーで全文を吹き出しに出し、ダブルクリックで編集する
    ed.on('note:hover', (detail) => {
      this._dispatch('note-hover', detail);
      this._noteTip = detail && detail.note ? detail : null;
    });
    ed.on('note:edit', (detail) => {
      if (this.readOnly) return;
      if (this._dispatch('note-edit', detail, true)) {
        this._noteTip = null;
        this._startEdit({
          kind: 'note',
          target: detail.kind === 'node' ? detail.id : detail.id,
          noteKind: detail.kind,
          value: detail.note?.text ?? '',
          color: detail.note?.color ?? null,
          screenRect: detail.screenRect,
        });
      }
    });

    this._ro = new ResizeObserver(() => this._syncSize());
    this._ro.observe(this);
    this._syncSize();
    this._appliedTheme = this.theme;
    this._loadedData = this.data;
    if (this.data) ed.load(this.data);
    ed.on('selection:change', () => this.requestUpdate());
    this.updateComplete.then(() => this._dispatch('ready', { editor: ed }));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.closeContextMenu();
    this._ro?.disconnect();
    this.editor?.destroy();
    this.editor = null;
  }

  connectedCallback() {
    super.connectedCallback();
    // 再接続時（一度 destroy 済み）は作り直す
    if (this.hasUpdated && !this.editor) {
      this.requestUpdate();
      this.updateComplete.then(() => this.firstUpdated());
    }
  }

  updated(changed) {
    if (changed.has('_menu')) this._placeContextMenu();
    const ed = this.editor;
    if (!ed) return;
    if (changed.has('readOnly') && this.readOnly) this.closeContextMenu();
    if (changed.has('data') && this.data && this.data !== this._loadedData) {
      this._loadedData = this.data;
      ed.load(this.data);
    }
    if (changed.has('theme') && this.theme !== this._appliedTheme) {
      this._appliedTheme = this.theme;
      ed.setTheme(this.theme);
    }
    if (changed.has('nodeTypes')) ed.nodeTypes = { ...(this.nodeTypes ?? {}) };
    if (changed.has('wheelMode')) ed.options.wheelMode = this.wheelMode;
    if (changed.has('dragMode')) ed.options.dragMode = this.dragMode;
    if (changed.has('readOnly')) ed.options.readOnly = this.readOnly;
    if (changed.has('notes')) {
      ed.options.notes = this.notes;
      this._noteTip = null;
      ed.requestRender();
    }
    if (changed.has('maxInputs') || changed.has('maxOutputs') || changed.has('onFull')) ed.setRules(this._rules());
    if (changed.has('moveSnap')) ed.setMoveSnap(this.moveSnap);
    if (changed.has('edgeType') && this.edgeType && ed.edgeType !== this.edgeType) ed.setEdgeType(this.edgeType);
    if (changed.has('focusMode') && ed.focusMode !== this.focusMode) ed.setFocusMode(this.focusMode);
    if (changed.has('edgeDeleteIcon')) {
      ed.options.edgeDeleteIcon = this.edgeDeleteIcon;
      ed.requestRender();
    }
    if (changed.has('minimap') || changed.has('minimapWidth') || changed.has('minimapHeight')) this._syncSize();
  }

  _rules() {
    const num = (v) => (typeof v === 'number' && v > 0 ? v : Infinity);
    return { maxInputs: num(this.maxInputs), maxOutputs: num(this.maxOutputs), onFull: this.onFull === 'replace' ? 'replace' : 'reject' };
  }

  _syncSize() {
    const ed = this.editor;
    if (!ed) return;
    const r = this.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    ed.resize(r.width, r.height);
    if (this.minimap) ed.resizeMinimap(this.minimapWidth, this.minimapHeight);
  }

  /* ---------- 右クリックメニュー ---------- */

  _openContextMenu(detail) {
    // アプリ側で preventDefault したら内蔵メニューは出さない（独自メニューを出したいとき）
    const allowed = this._dispatch('context-menu', detail, true);
    if (!allowed || !this.contextMenu || this.readOnly || !this.editor) return;
    const ctx = { ...detail, el: this, editor: this.editor, graph: this.editor.graph };
    ctx.defaultItems = defaultContextMenuItems(ctx);
    const source = typeof this.contextMenuItems === 'function' ? this.contextMenuItems(ctx) : (this.contextMenuItems ?? ctx.defaultItems);
    const items = (source ?? []).filter((it) => it && !it.hidden);
    // 区切り線だけ・先頭末尾の区切り線を整理する
    const cleaned = items.filter((it, i) => {
      if (it.type !== 'separator') return true;
      const prev = items.slice(0, i).findLast((x) => x.type !== 'separator');
      const next = items.slice(i + 1).find((x) => x.type !== 'separator');
      return !!prev && !!next && items[i - 1]?.type !== 'separator';
    });
    if (!cleaned.some((it) => it.type !== 'separator')) return;
    this._menu = { items: cleaned, x: detail.screen.x, y: detail.screen.y, ctx, index: -1, placed: false };
    document.addEventListener('pointerdown', this._onDocPointerDownForMenu, true);
  }

  /** 右クリックメニューを閉じる */
  closeContextMenu() {
    if (!this._menu) return;
    this._menu = null;
    document.removeEventListener('pointerdown', this._onDocPointerDownForMenu, true);
  }

  /** 右クリックメニューを任意の位置に出す（ワールド座標ではなく要素内の px） */
  openContextMenuAt(x, y, detail = {}) {
    this._openContextMenu({
      type: 'none',
      node: null,
      item: null,
      edge: null,
      port: null,
      x: this.editor?.viewport.toWorld(x, y).x ?? 0,
      y: this.editor?.viewport.toWorld(x, y).y ?? 0,
      screen: { x, y },
      client: { x, y },
      selection: { nodes: [...(this.editor?.selection.nodes ?? [])], edges: [...(this.editor?.selection.edges ?? [])] },
      ...detail,
    });
  }

  _runMenuItem(item) {
    if (!item || item.type === 'separator' || item.disabled) return;
    const ctx = this._menu?.ctx;
    this.closeContextMenu();
    try {
      item.run?.(ctx);
    } finally {
      this._dispatch('context-menu-select', { id: item.id ?? null, item, target: ctx ?? null });
    }
  }

  _onMenuKey(e) {
    const menu = this._menu;
    if (!menu) return;
    const usable = menu.items.map((it, i) => ({ it, i })).filter(({ it }) => it.type !== 'separator' && !it.disabled);
    if (!usable.length) return;
    const at = usable.findIndex(({ i }) => i === menu.index);
    if (e.key === 'Escape') {
      this.closeContextMenu();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = e.key === 'ArrowDown' ? (at + 1) % usable.length : (at <= 0 ? usable.length - 1 : at - 1);
      this._menu = { ...menu, index: usable[next].i };
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (at >= 0) this._runMenuItem(menu.items[menu.index]);
    } else if (e.key === 'Home' || e.key === 'End') {
      this._menu = { ...menu, index: usable[e.key === 'Home' ? 0 : usable.length - 1].i };
    } else {
      return;
    }
    // Escape などがエディタ本体のキー処理に流れないように止める
    e.preventDefault();
    e.stopPropagation();
  }

  /** 画面外に出ないように位置を補正し、キーボード操作のためフォーカスする */
  _placeContextMenu() {
    const menu = this._menu;
    const node = this.renderRoot?.querySelector?.('.context-menu');
    if (!menu || !node || menu.placed) return;
    const host = this.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    let x = menu.x;
    let y = menu.y;
    if (x + box.width > host.width - 4) x = Math.max(4, x - box.width);
    if (y + box.height > host.height - 4) y = Math.max(4, y - box.height);
    this._menu = { ...menu, x, y, placed: true };
    node.focus({ preventScroll: true });
  }

  _dispatch(name, detail, cancelable = false) {
    return this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable }));
  }

  /* ---------- 委譲メソッド ---------- */

  addNode(node) {
    return this.editor?.graph.addNode(node);
  }
  addEdge(edge) {
    return this.editor?.graph.addEdge(edge);
  }
  removeNode(id) {
    return this.editor?.graph.removeNode(id);
  }
  removeEdge(id) {
    return this.editor?.graph.removeEdge(id);
  }
  updateNode(id, patch) {
    return this.editor?.graph.updateNode(id, patch);
  }
  updateItem(nodeId, itemId, patch) {
    return this.editor?.graph.updateItem(nodeId, itemId, patch);
  }
  duplicateSelection(offset) {
    return this.editor?.duplicateSelection(offset);
  }
  exportData(options) {
    return this.editor?.exportData(options);
  }
  exportJSON(options) {
    return this.editor?.exportJSON(options) ?? '';
  }
  downloadJSON(filename = this.exportFilename, options) {
    this.editor?.downloadJSON(filename, options);
  }
  importJSON(input, options) {
    return this._reportImport(this.editor?.importData(input, { mode: this.importMode, ...options }));
  }
  insertJSON(input, options) {
    return this._reportImport(this.editor?.insertJSON(input, options));
  }
  insertJSONAtPointer(input, options) {
    return this._reportImport(this.editor?.insertJSONAtPointer(input, options));
  }
  importFromFile(file, options) {
    return this.editor?.importFromFile(file, { mode: this.importMode, ...options }).then((r) => this._reportImport(r));
  }
  async openImportDialog(options) {
    const r = await this.editor?.openImportDialog({ mode: this.importMode, ...options });
    return r ? this._reportImport(r) : r;
  }
  _reportImport(r) {
    if (r && !r.ok) this._dispatch('import-error', { errors: r.errors });
    return r;
  }

  /* ---------- ファイルドロップ ---------- */

  _onDragOver(e) {
    if (this.readOnly || !e.dataTransfer) return;
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this._dropping = true;
  }

  _onDragLeave(e) {
    if (e.target === this || !this.contains(e.relatedTarget)) this._dropping = false;
  }

  async _onDrop(e) {
    this._dropping = false;
    if (this.readOnly) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    const at = this.editor.clientToWorld(e.clientX, e.clientY);
    await this.importFromFile(file, this.importMode === 'merge' ? { at } : {});
  }

  autoLayout(options) {
    return this.editor?.autoLayout(options) ?? [];
  }
  addNodeAt(spec, options) {
    return this.editor?.addNodeAt(spec, options) ?? null;
  }
  addNodeAtPointer(spec, options) {
    return this.editor?.addNodeAtPointer(spec, options) ?? null;
  }
  addNodeAtCenter(spec, options) {
    return this.editor?.addNodeAtCenter(spec, options) ?? null;
  }
  /* ---------- メモ（note） ---------- */

  /** メモを設定する（null / 空文字で削除） */
  setNote(target, value) {
    return this.editor?.setNote(target, value) ?? null;
  }
  /** メモを取得する */
  noteOf(target) {
    return this.editor?.noteOf(target) ?? null;
  }
  /** メモが付いているものの一覧 */
  notesList() {
    return this.editor?.notes() ?? [];
  }
  /** メモの編集を開始する（バッジのダブルクリックと同じ） */
  editNote(target) {
    const ed = this.editor;
    if (!ed || this.readOnly) return false;
    const found = ed.graph._resolveNoteTarget(target);
    if (!found) return false;
    const kind = found.kind;
    const id = found.obj.id;
    const box = ed.noteBoxes().find((b) => b.kind === kind && b.id === id);
    const rect = box
      ? box.rect
      : kind === 'node'
        ? (() => {
            const r = ed.graph.nodeRect(found.obj);
            return { x: r.x, y: r.y - 22 / ed.viewport.zoom, w: Math.min(r.w, 160), h: 20 / ed.viewport.zoom };
          })()
        : (() => {
            const p = ed.graph.edgePoint(found.obj, 0.5) ?? { x: 0, y: 0 };
            return { x: p.x - 60, y: p.y - 10, w: 120, h: 20 / ed.viewport.zoom };
          })();
    ed.emit('note:edit', {
      kind,
      id,
      note: ed.noteOf(found.obj),
      rect,
      screenRect: ed.worldRectToScreen(rect),
    });
    return true;
  }

  /* ---------- goto（ID 指定の遷移） ---------- */

  /** goto を設定する。itemId を渡すとその項目に設定する（null で解除） */
  setGoto(nodeOrId, value, options) {
    return this.editor?.setGoto(nodeOrId, value, options) ?? null;
  }
  /** goto の一覧（引数を省略するとグラフ全体） */
  gotoLinks(nodeOrId) {
    return this.editor?.gotoLinks(nodeOrId) ?? [];
  }
  /** このノードを goto で指しているリンク */
  gotoSources(nodeOrId) {
    return this.editor?.gotoSources(nodeOrId) ?? [];
  }

  /* ---------- 子ノード ---------- */

  /** 子ノードを追加する */
  addChild(parentId, child, index) {
    return this.editor?.addChild(parentId, child, index) ?? null;
  }
  /**
   * 子を親から外して独立させる。x / y を渡すとその位置に置く。
   * （`removeChild` は DOM の予約名なので別名にしている）
   */
  detachChild(id, options) {
    return this.editor?.removeChild(id, options) ?? null;
  }
  /** 親子関係を付け替える。parentId に null を渡すと独立させる */
  setParent(id, parentId, index) {
    return this.editor?.setParent(id, parentId, index) ?? false;
  }
  /** 子ノードの配列（表示順） */
  childrenOf(nodeOrId) {
    return this.editor?.childrenOf(nodeOrId) ?? [];
  }
  /** 一番外側の親（自分が子でなければ自分自身） */
  rootNodeOf(nodeOrId) {
    return this.editor?.rootNodeOf(nodeOrId) ?? null;
  }

  getPointer() {
    return this.editor?.getPointer() ?? null;
  }
  setPortVisible(nodeId, portKey, visible) {
    return this.editor?.setPortVisible(nodeId, portKey, visible) ?? false;
  }
  setPortsVisible(nodeId, visible, itemId) {
    return this.editor?.setPortsVisible(nodeId, visible, itemId) ?? false;
  }
  undo() {
    return this.editor?.undo() ?? false;
  }
  redo() {
    return this.editor?.redo() ?? false;
  }
  get canUndo() {
    return this.editor?.canUndo ?? false;
  }
  get canRedo() {
    return this.editor?.canRedo ?? false;
  }
  deleteSelection() {
    this.editor?.deleteSelection();
  }
  setMoveSnap(step) {
    this.moveSnap = step;
  }
  snapNodes(ids) {
    return this.editor?.snapNodes(ids) ?? [];
  }
  /** コネクタの描画方法。edgeIds を渡すとそのコネクタだけ（edge.type）、省略時は全体の既定（edge-type 属性と同期） */
  setEdgeType(type, edgeIds) {
    if (edgeIds) this.editor?.setEdgeType(type, edgeIds);
    else this.edgeType = type;
  }
  setSelectedEdgeType(type) {
    this.editor?.setSelectedEdgeType(type);
  }
  /** 強調表示モード。属性 `focus-mode` と同期する */
  setFocusMode(mode, options) {
    const m = mode === true ? 'connected' : mode === false ? 'off' : mode;
    if (options) {
      this.focusMode = m;
      this.editor?.setFocusMode(m, options);
    } else {
      this.focusMode = m;
    }
  }
  /** 強調表示の対象を選択に加える */
  selectConnected(options) {
    return this.editor?.selectConnected(options) ?? null;
  }
  /** 強調表示されている要素をそのまま選択する（強調表示が off なら設定どおりに辿って選択） */
  selectFocused(options) {
    return this.editor?.selectFocused(options) ?? null;
  }
  deleteSelectedEdges(options) {
    return this.editor?.deleteSelectedEdges(options) ?? [];
  }
  zoomIn() {
    this.editor?.zoomIn();
  }
  zoomOut() {
    this.editor?.zoomOut();
  }
  resetZoom() {
    this.editor?.resetZoom();
  }
  fitView(padding) {
    this.editor?.fitView(padding, { animate: true });
  }
  search(query) {
    return this.editor?.search(query) ?? [];
  }
  focusNode(id, opts) {
    return this.editor?.centerOnNode(id, opts);
  }
  toJSON() {
    return this.editor?.toJSON();
  }
  load(data) {
    this.editor?.load(data);
  }

  /* ---------- 検索 UI ---------- */

  _onSearchInput(e) {
    const q = e.target.value.trim();
    this._searchMatches = q ? this.editor.search(q) : [];
    this._searchIndex = 0;
    this._focusSearchResult();
  }

  _onSearchKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._stepSearch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.target.value = '';
      this._searchMatches = [];
      this._searchInfo = null;
    }
  }

  _stepSearch(delta) {
    if (!this._searchMatches.length) return;
    const n = this._searchMatches.length;
    this._searchIndex = (this._searchIndex + delta + n) % n;
    this._focusSearchResult();
  }

  _focusSearchResult() {
    const n = this._searchMatches.length;
    if (!n) {
      this._searchInfo = this.renderRoot.querySelector('.search')?.value ? '0 件' : null;
      return;
    }
    const node = this._searchMatches[this._searchIndex];
    this.editor.select({ nodes: [node.id] });
    this.editor.centerOnNode(node.id);
    this._searchInfo = `${this._searchIndex + 1} / ${n}`;
  }

  /* ---------- インライン編集 ---------- */

  _startEdit(edit) {
    this._editing = edit;
    this.updateComplete.then(() => {
      const input = this.renderRoot.querySelector('.inline-editor');
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  _commitEdit() {
    const ed = this._editing;
    if (!ed) return;
    const input = this.renderRoot.querySelector('.inline-editor');
    const value = input ? input.value : ed.value;
    this._editing = null;
    if (value === ed.value) return;
    if (ed.kind === 'note') {
      const text = value.trim();
      this.editor.setNote(ed.target, text ? { text, ...(ed.color ? { color: ed.color } : null) } : null);
      this.editor.canvas.focus({ preventScroll: true });
      return;
    }
    if (ed.kind === 'title') this.editor.graph.updateNode(ed.nodeId, { title: value });
    else {
      const node = this.editor.graph.getNode(ed.nodeId);
      const item = node?.items.find((it) => it.id === ed.itemId);
      if (!item) return;
      // value が無い項目はラベルを編集する
      if (item.value == null) this.editor.graph.updateItem(ed.nodeId, ed.itemId, { label: value });
      else this.editor.graph.updateItem(ed.nodeId, ed.itemId, { value });
    }
    this.editor.canvas.focus({ preventScroll: true });
  }

  _cancelEdit() {
    if (!this._editing) return;
    this._editing = null;
  }

  _onEditKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._cancelEdit();
      this.editor.canvas.focus({ preventScroll: true });
    }
    e.stopPropagation();
  }

  /* ---------- render ---------- */

  /** メモの全文を出す吹き出し（バッジは 1 行に省略されるため） */
  _renderNoteTip() {
    const tip = this._noteTip;
    const r = tip.screenRect ?? { x: 0, y: 0, w: 0, h: 0 };
    const host = this.getBoundingClientRect();
    const left = Math.max(4, Math.min(r.x, (host.width || 0) - 270));
    const below = r.y + r.h + 6;
    const style = `left:${Math.round(left)}px; top:${Math.round(below)}px`;
    return html`<div class="note-tip" part="note-tip" style=${style}>${tip.note.text}</div>`;
  }

  _renderContextMenu() {
    const menu = this._menu;
    return html`<div
      class="context-menu"
      part="context-menu"
      role="menu"
      tabindex="-1"
      style="left:${Math.round(menu.x)}px; top:${Math.round(menu.y)}px; opacity:${menu.placed ? '1' : '0'}; pointer-events:${
        menu.placed ? 'auto' : 'none'
      }"
      @keydown=${this._onMenuKey}
      @contextmenu=${(e) => e.preventDefault()}
      @pointerdown=${(e) => e.stopPropagation()}
    >
      ${menu.items.map((item, i) =>
        item.type === 'separator'
          ? html`<div class="menu-sep" role="separator"></div>`
          : html`<button
              role="menuitem"
              class=${[item.danger ? 'danger' : '', menu.index === i ? 'active' : ''].filter(Boolean).join(' ')}
              ?disabled=${!!item.disabled}
              title=${item.title ?? nothing}
              @click=${() => this._runMenuItem(item)}
              @pointerenter=${() => (this._menu = { ...this._menu, index: i })}
            >
              <span>${item.label}</span>
              ${item.shortcut ? html`<span class="shortcut">${item.shortcut}</span>` : nothing}
            </button>`,
      )}
    </div>`;
  }

  render() {
    const z = Math.round(this._zoom * 100);
    const hasSel = this.editor ? this.editor.selection.nodes.size + this.editor.selection.edges.size > 0 : false;
    const hasSelEdges = this.editor ? this.editor.selectedEdgeIds().length > 0 : false;
    const hasSelNodes = this.editor ? this.editor.selection.nodes.size > 0 : false;
    return html`
      <div class="stage" @dragover=${this._onDragOver} @dragleave=${this._onDragLeave} @drop=${this._onDrop}>
        <canvas class="main" tabindex="0" aria-label="node editor"></canvas>
        ${this._dropping ? html`<div class="drop-overlay">JSON ファイルをドロップして読み込み</div>` : nothing}
        <canvas class="minimap" style=${this.minimap ? '' : 'display:none'}></canvas>
        ${this.toolbar
          ? html`<div class="toolbar" part="toolbar" @pointerdown=${(e) => e.stopPropagation()}>
              <input
                class="search"
                type="search"
                placeholder="ノードを検索…"
                @input=${this._onSearchInput}
                @keydown=${this._onSearchKey}
              />
              <button title="前の一致 (Shift+Enter)" @click=${() => this._stepSearch(-1)} ?disabled=${!this._searchMatches.length}>‹</button>
              <button title="次の一致 (Enter)" @click=${() => this._stepSearch(1)} ?disabled=${!this._searchMatches.length}>›</button>
              ${this._searchInfo ? html`<span class="info">${this._searchInfo}</span>` : nothing}
              <span class="sep"></span>
              <button title="縮小 (Ctrl+-)" @click=${() => this.zoomOut()}>−</button>
              <span class="info">${z}%</span>
              <button title="拡大 (Ctrl++)" @click=${() => this.zoomIn()}>+</button>
              <button title="縮尺リセット (Ctrl+0)" @click=${() => this.resetZoom()}>1:1</button>
              <button title="全体表示" @click=${() => this.fitView()}>⛶</button>
              <button
                title="強調表示されている要素をまとめて選択 (Ctrl+Shift+A)"
                ?disabled=${!hasSelNodes}
                @click=${() => this.selectFocused()}
              >
                強調を選択
              </button>
              ${this.readOnly
                ? nothing
                : html`<span class="sep"></span>
                    <button title="元に戻す (Ctrl+Z)" ?disabled=${!this.canUndo} @click=${() => this.undo()}>↶</button>
                    <button title="やり直す (Ctrl+Shift+Z)" ?disabled=${!this.canRedo} @click=${() => this.redo()}>↷</button>
                    <span class="sep"></span>
                    <button title="複製 (Ctrl+D)" ?disabled=${!hasSel} @click=${() => this.duplicateSelection()}>複製</button>
                    <button title="削除 (Delete)" ?disabled=${!hasSel} @click=${() => this.deleteSelection()}>削除</button>
                    <button title="選択範囲内のコネクタのみ削除 (Shift+Delete)" ?disabled=${!hasSelEdges} @click=${() => this.deleteSelectedEdges()}>コネクタ削除</button>
                    <button title="自動整列（2 つ以上選択していればその範囲だけ）" @click=${() => this.autoLayout()}>整列</button>
                    <span class="sep"></span>
                    <button title="JSON ファイルを読み込み" @click=${() => this.openImportDialog()}>読み込み</button>`}
              <button title="JSON ファイルとして書き出し" @click=${() => this.downloadJSON()}>書き出し</button>
              <slot name="toolbar"></slot>
            </div>`
          : nothing}
        ${this._noteTip ? this._renderNoteTip() : nothing}
        ${this._menu ? this._renderContextMenu() : nothing}
        ${this._editing
          ? html`<input
              class="inline-editor"
              .value=${this._editing.value}
              style=${`left:${this._editing.screenRect.x}px;top:${this._editing.screenRect.y}px;width:${this._editing.screenRect.w}px;height:${this._editing.screenRect.h}px;`}
              @keydown=${this._onEditKey}
              @blur=${this._commitEdit}
              @pointerdown=${(e) => e.stopPropagation()}
            />`
          : nothing}
        <slot></slot>
      </div>
    `;
  }
}

if (!customElements.get('canvas-flow-editor')) {
  customElements.define('canvas-flow-editor', CanvasFlowEditor);
}

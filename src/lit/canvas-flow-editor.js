import { LitElement, html, css, nothing } from 'lit';
import { NodeEditor } from '../core/editor.js';

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
 *
 * イベント（CustomEvent, detail に内容）:
 *  selection-change, viewport-change, graph-change, node-add, node-remove, node-change,
 *  nodes-move, nodes-move-end, node-resize-end, edge-add, edge-remove, edge-change,
 *  history-change, import, export, import-error, connect-rejected, layout,
 *  node-click, item-click, edge-click, canvas-click, canvas-dblclick, ready
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
    exportFilename: { attribute: 'export-filename' },
    _dropping: { state: true },
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
    this.exportFilename = 'canvas-flow.json';
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
    ed.on('viewport:change', () => this._cancelEdit());

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
    const ed = this.editor;
    if (!ed) return;
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
    if (changed.has('maxInputs') || changed.has('maxOutputs') || changed.has('onFull')) ed.setRules(this._rules());
    if (changed.has('moveSnap')) ed.setMoveSnap(this.moveSnap);
    if (changed.has('edgeType') && this.edgeType && ed.edgeType !== this.edgeType) ed.setEdgeType(this.edgeType);
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

  render() {
    const z = Math.round(this._zoom * 100);
    const hasSel = this.editor ? this.editor.selection.nodes.size + this.editor.selection.edges.size > 0 : false;
    const hasSelEdges = this.editor ? this.editor.selectedEdgeIds().length > 0 : false;
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

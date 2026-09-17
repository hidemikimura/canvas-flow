/**
 * ポインタ・ホイール・キーボード操作を NodeEditor の操作へ変換する。
 *
 *  - 左ドラッグ（ノード上）      : 選択ノードの移動（未選択ノードならそのノードだけ）。moveSnap 設定時は指定単位に揃う
 *  - 左ドラッグ（ポート上）      : コネクタ作成
 *  - 左ドラッグ（ノード右下グリップ）: 幅のリサイズ
 *  - 2 本指（タッチ）            : ピンチでズーム、同時にパン
 *  - 左ドラッグ（空白）          : dragMode='pan' ならパン、Shift で範囲選択（dragMode='select' なら逆）
 *  - 中ボタン / Space+左ドラッグ : パン
 *  - クリック                    : 選択（Shift / Ctrl / Cmd で追加・トグル）
 *  - コネクタ中央の × アイコン   : そのコネクタを削除（ホバー中・選択中に表示）
 *  - ダブルクリック              : ノード / 項目の編集要求イベント
 *  - ホイール                    : ズーム、Shift+ホイールでパン（wheelMode='pan' なら通常パン、Ctrl/Cmd でズーム）
 *                                  慣性スクロール中は最初の動作を維持する
 *  - Delete / Backspace          : 選択削除（Shift 付きで選択範囲内のコネクタのみ削除）
 *  - Ctrl/Cmd + A / C / V / D    : 全選択 / コピー / 貼り付け / 複製
 *    （コピーはシステムのクリップボードにも JSON として書き込み、貼り付けは JSON テキストも受け付ける）
 *  - Ctrl/Cmd + 0 / + / -        : 縮尺リセット / 拡大 / 縮小
 *  - Ctrl/Cmd + Z / Shift+Z / Y  : Undo / Redo
 *  - Escape                      : 操作キャンセル・選択解除
 */
export class Interaction {
  /** @param {import('./editor.js').NodeEditor} editor */
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;
    this.dragThreshold = 3;
    this.spaceDown = false;
    this._mode = null; // 'pan' | 'drag' | 'box' | 'connect' | 'resize' | 'pending' | 'pinch' | 'pinch-end'
    this._down = null;
    this._lastClientPos = null;
    /** ポインタが canvas 上にあるか */
    this.pointerInside = false;
    /** @type {Map<number, {x:number,y:number}>} 押下中のポインタ（スクリーン座標） */
    this._pointers = new Map();
    this._pinch = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
    this._onContextMenu = (e) => e.preventDefault();
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    const c = this.canvas;
    c.style.touchAction = 'none';
    this._onPointerEnter = (e) => {
      this.pointerInside = true;
      this._lastClientPos = { x: e.clientX, y: e.clientY };
    };
    this._onPointerLeave = () => {
      // ドラッグ中（キャプチャ中）に外へ出てもポインタ位置は追い続ける
      if (!this._mode) this.pointerInside = false;
    };
    c.addEventListener('pointerenter', this._onPointerEnter);
    c.addEventListener('pointerleave', this._onPointerLeave);
    c.addEventListener('pointerdown', this._onPointerDown);
    c.addEventListener('pointermove', this._onPointerMove);
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerUp);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    c.addEventListener('dblclick', this._onDblClick);
    c.addEventListener('contextmenu', this._onContextMenu);
    if (!c.hasAttribute('tabindex')) c.tabIndex = 0;

    // キーボードは document で受ける。このエディタ（canvas を含むルート要素）を
    // 最後にポインタ操作していて、入力欄にフォーカスが無いときだけ処理する。
    this.active = false;
    this._onDocPointerDown = (e) => {
      const root = this.editor.options.keyboardScope ?? this.canvas;
      const path = e.composedPath ? e.composedPath() : [e.target];
      this.active = path.includes(root);
    };
    document.addEventListener('pointerdown', this._onDocPointerDown, true);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

    // システムクリップボード連携（copy / paste イベント）
    this._onCopy = this._onCopy.bind(this);
    this._onPaste = this._onPaste.bind(this);
    document.addEventListener('copy', this._onCopy);
    document.addEventListener('paste', this._onPaste);
    this._pasteHandled = false;
  }

  _onCopy(e) {
    if (!this.active || this._isEditableTarget(e)) return;
    const ed = this.editor;
    if (!ed.selection.nodes.size) return;
    ed.copySelection();
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', ed.exportJSON({ selectionOnly: true, includeViewport: false, pretty: false }));
      e.preventDefault();
    }
  }

  _onPaste(e) {
    if (!this.active || this._isEditableTarget(e)) return;
    const ed = this.editor;
    if (ed.options.readOnly) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const at = this._lastClientPos ? ed.clientToWorld(this._lastClientPos.x, this._lastClientPos.y) : undefined;
    this._pasteHandled = true;
    if (text.trim().startsWith('{')) {
      const r = ed.importData(text, { mode: 'merge', at });
      if (r.ok && r.nodes.length) {
        e.preventDefault();
        return;
      }
    }
    // JSON でなければ内部クリップボードから貼り付け
    if (ed.paste(at)) e.preventDefault();
  }

  _isEditableTarget(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const el of path) {
      if (!(el instanceof Element)) continue;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    }
    return false;
  }

  destroy() {
    const c = this.canvas;
    c.removeEventListener('pointerenter', this._onPointerEnter);
    c.removeEventListener('pointerleave', this._onPointerLeave);
    c.removeEventListener('pointerdown', this._onPointerDown);
    c.removeEventListener('pointermove', this._onPointerMove);
    c.removeEventListener('pointerup', this._onPointerUp);
    c.removeEventListener('pointercancel', this._onPointerUp);
    c.removeEventListener('wheel', this._onWheel);
    c.removeEventListener('dblclick', this._onDblClick);
    c.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('copy', this._onCopy);
    document.removeEventListener('paste', this._onPaste);
  }

  _local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _isAdditive(e) {
    return e.shiftKey || e.ctrlKey || e.metaKey;
  }

  /* ---------- pointer ---------- */

  _onPointerDown(e) {
    const ed = this.editor;
    this.canvas.focus({ preventScroll: true });
    const s = this._local(e);
    const w = ed.viewport.toWorld(s.x, s.y);
    const readOnly = ed.options.readOnly;

    this._pointers.set(e.pointerId, s);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    // 2 本目の指 → 進行中の操作を取り消してピンチへ
    if (this._pointers.size === 2) {
      this._cancelCurrent();
      this._startPinch();
      return;
    }
    if (this._pointers.size > 2 || this._mode === 'pinch' || this._mode === 'pinch-end') return;

    // 中ボタン or Space+左 → パン
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this._begin(e, 'pan', { s, w });
      return;
    }
    if (e.button !== 0) return;

    const hit = ed.hitTest(w.x, w.y);
    switch (hit.type) {
      case 'edge-delete': {
        // pointerup でクリックとして確定する（ドラッグし始めたら何もしない）
        this._begin(e, 'pending', { s, w, hit, target: 'edge-delete' });
        break;
      }
      case 'resize': {
        if (readOnly) {
          this._begin(e, 'pending', { s, w, hit, target: 'nodes', moved: false, total: { x: 0, y: 0 } });
          break;
        }
        if (!ed.selection.nodes.has(hit.node.id)) ed.select({ nodes: [hit.node.id] });
        ed.history.begin('resize');
        this._begin(e, 'resize', { s, w, node: hit.node, startWidth: ed.graph.nodeWidth(hit.node) });
        break;
      }
      case 'port': {
        if (readOnly) {
          this._begin(e, 'pending', { s, w, hit, target: 'nodes', moved: false, total: { x: 0, y: 0 } });
          break;
        }
        const cap = ed.graph.portCapacity(hit.node.id, hit.port.key);
        if (cap?.full && ed.graph.rules.onFull !== 'replace') {
          // 満杯のポートからは新しいコネクタを引けない。ノードのドラッグとして扱う
          ed.emit('connect:rejected', { node: hit.node.id, port: hit.port.key, reason: hit.port.dir === 'out' ? 'source-full' : 'target-full' });
          if (!ed.selection.nodes.has(hit.node.id)) ed.select({ nodes: [hit.node.id] });
          this._begin(e, 'pending', { s, w, hit, target: 'nodes', moved: false, total: { x: 0, y: 0 } });
          break;
        }
        this._begin(e, 'connect', {
          s,
          w,
          from: hit,
          fromPos: { x: hit.port.x, y: hit.port.y },
        });
        ed.pendingEdge = { from: { x: hit.port.x, y: hit.port.y }, to: w, dir: hit.port.dir };
        ed.requestRender();
        break;
      }
      case 'node':
      case 'item': {
        const id = hit.node.id;
        if (this._isAdditive(e)) {
          ed.toggleSelect({ nodes: [id] });
        } else if (!ed.selection.nodes.has(id)) {
          ed.select({ nodes: [id] });
        }
        // ドラッグ準備（しきい値を超えたら移動開始）
        this._begin(e, 'pending', { s, w, hit, target: 'nodes', moved: false, total: { x: 0, y: 0 } });
        break;
      }
      case 'edge': {
        if (this._isAdditive(e)) ed.toggleSelect({ edges: [hit.edge.id] });
        else ed.select({ edges: [hit.edge.id] });
        this._begin(e, 'pending', { s, w, hit, target: 'edge' });
        break;
      }
      default: {
        const wantSelect = ed.options.dragMode === 'select' ? !e.shiftKey : e.shiftKey;
        this._begin(e, 'pending', { s, w, hit, target: wantSelect ? 'box' : 'pan', additive: e.ctrlKey || e.metaKey });
      }
    }
  }

  _begin(e, mode, data) {
    this._mode = mode;
    this._down = { ...data, pointerId: e.pointerId, client: { x: e.clientX, y: e.clientY }, lastS: data.s };
  }

  /** 進行中の操作を状態を変えずに中断する */
  _cancelCurrent() {
    const ed = this.editor;
    if (this._mode === 'drag' || this._mode === 'resize') ed.history.end();
    this._mode = null;
    this._down = null;
    ed.pendingEdge = null;
    ed.selectionBox = null;
    ed.hover.port = null;
    ed.requestRender();
  }

  /* ---------- ピンチ（2 本指） ---------- */

  _pinchState() {
    const [a, b] = [...this._pointers.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  _startPinch() {
    this._mode = 'pinch';
    this._pinch = this._pinchState();
  }

  _updatePinch() {
    const ed = this.editor;
    const cur = this._pinchState();
    const prev = this._pinch;
    if (prev.dist > 0 && cur.dist > 0) ed.viewport.zoomAt(cur.cx, cur.cy, cur.dist / prev.dist);
    ed.viewport.panBy(cur.cx - prev.cx, cur.cy - prev.cy);
    this._pinch = cur;
    ed.requestRender();
  }

  _onPointerMove(e) {
    const ed = this.editor;
    const s = this._local(e);
    this._lastClientPos = { x: e.clientX, y: e.clientY };
    this.pointerInside = true;

    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, s);
    if (this._mode === 'pinch') {
      if (this._pointers.size >= 2) this._updatePinch();
      return;
    }
    if (this._mode === 'pinch-end') return;

    if (!this._mode) {
      this._updateHover(s);
      return;
    }
    const d = this._down;
    const dx = s.x - d.lastS.x;
    const dy = s.y - d.lastS.y;

    if (this._mode === 'pending') {
      const mx = s.x - d.s.x;
      const my = s.y - d.s.y;
      if (Math.abs(mx) < this.dragThreshold && Math.abs(my) < this.dragThreshold) return;
      if (d.target === 'nodes') {
        if (ed.options.readOnly) return void (this._mode = null);
        this._mode = 'drag';
        ed.history.begin('move');
        // 子ノードは自分で座標を持たないので、実際に動かすのは一番外側の親
        const roots = new Map();
        for (const n of ed.selectedNodes) {
          const root = ed.graph.rootOf(n) ?? n;
          if (!roots.has(root.id)) roots.set(root.id, { id: root.id, x: root.x, y: root.y });
        }
        d.startPositions = [...roots.values()];
        // スナップ用: 掴んだノード（子ならその親）を基準にし、実際に適用した移動量を別に持つ
        const grabbed = ed.graph.rootOf(d.hit.node) ?? d.hit.node;
        const anchorId = roots.has(grabbed.id) ? grabbed.id : d.startPositions[0]?.id;
        d.anchorStart = d.startPositions.find((p) => p.id === anchorId) ?? d.startPositions[0];
        d.applied = { x: 0, y: 0 };
      } else if (d.target === 'box') {
        this._mode = 'box';
      } else if (d.target === 'pan') {
        this._mode = 'pan';
      } else {
        this._mode = null;
        return;
      }
    }

    switch (this._mode) {
      case 'pan': {
        ed.viewport.panBy(dx, dy);
        ed.requestRender();
        break;
      }
      case 'drag': {
        const wdx = dx / ed.viewport.zoom;
        const wdy = dy / ed.viewport.zoom;
        d.total.x += wdx;
        d.total.y += wdy;
        const snap = ed.moveSnap;
        if (snap && d.anchorStart) {
          // 基準ノードの左上が移動単位に揃う位置まで、まとめて動かす
          const targetX = ed.snapValue(d.anchorStart.x + d.total.x) - d.anchorStart.x;
          const targetY = ed.snapValue(d.anchorStart.y + d.total.y) - d.anchorStart.y;
          const mdx = targetX - d.applied.x;
          const mdy = targetY - d.applied.y;
          if (mdx || mdy) {
            ed.graph.moveNodes([...ed.selection.nodes], mdx, mdy);
            d.applied.x = targetX;
            d.applied.y = targetY;
          }
        } else {
          ed.graph.moveNodes([...ed.selection.nodes], wdx, wdy);
          d.applied.x = d.total.x;
          d.applied.y = d.total.y;
        }
        break;
      }
      case 'resize': {
        const w = ed.viewport.toWorld(s.x, s.y);
        ed.resizeNode(d.node.id, w.x - d.node.x);
        break;
      }
      case 'box': {
        const a = ed.viewport.toWorld(d.s.x, d.s.y);
        const b = ed.viewport.toWorld(s.x, s.y);
        ed.selectionBox = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          w: Math.abs(a.x - b.x),
          h: Math.abs(a.y - b.y),
        };
        ed.requestRender();
        break;
      }
      case 'connect': {
        const w = ed.viewport.toWorld(s.x, s.y);
        const hit = ed.hitTest(w.x, w.y);
        let to = w;
        ed.hover.port = null;
        if (hit.type === 'port' && this._canConnect(d.from, hit)) {
          to = { x: hit.port.x, y: hit.port.y };
          ed.hover.port = { node: hit.node.id, port: hit.port.key };
        }
        ed.pendingEdge = { from: d.fromPos, to, dir: d.from.port.dir };
        ed.requestRender();
        break;
      }
    }
    d.lastS = s;
  }

  _canConnect(from, to) {
    const g = this.editor.graph;
    const opt = { replace: g.rules.onFull === 'replace' };
    if (from.port.dir === 'out') return g.canConnect(from.node.id, from.port.key, to.node.id, to.port.key, opt);
    return g.canConnect(to.node.id, to.port.key, from.node.id, from.port.key, opt);
  }

  _onPointerUp(e) {
    const ed = this.editor;
    this._pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (this._mode === 'pinch' || this._mode === 'pinch-end') {
      // 残りの指が全部離れるまでは何もしない
      if (this._pointers.size === 0) {
        this._mode = null;
        this._pinch = null;
        ed.emit('viewport:change', ed.viewport.snapshot());
      } else {
        this._mode = 'pinch-end';
      }
      return;
    }
    const mode = this._mode;
    const d = this._down;
    this._mode = null;
    this._down = null;
    if (!d) return;
    const s = this._local(e);

    switch (mode) {
      case 'pending': {
        // クリック（移動なし）
        const w = ed.viewport.toWorld(s.x, s.y);
        const detail = this._clickDetail(e, s, w);
        if (d.target === 'pan' || d.target === 'box') {
          if (!d.additive) ed.clearSelection();
          ed.emit('canvas:click', detail);
        } else if (d.target === 'nodes') {
          const hit = d.hit;
          const node = ed.graph.nodes.get(hit.node.id);
          if (node) {
            const item = hit.type === 'item' ? hit.item : null;
            if (item) ed.emit('item:click', { ...detail, node, item });
            ed.emit('node:click', { ...detail, node, item, header: hit.type === 'node' ? hit.header : false, port: hit.type === 'port' ? hit.port.key : null });
          }
        } else if (d.target === 'edge') {
          const edge = ed.graph.edges.get(d.hit.edge.id);
          if (edge) ed.emit('edge:click', { ...detail, edge });
        } else if (d.target === 'edge-delete') {
          const w = ed.viewport.toWorld(s.x, s.y);
          if (ed.edgeDeleteIconAt(w.x, w.y)?.id === d.hit.edge.id) {
            ed.removeEdge(d.hit.edge.id);
            ed.hover.edge = null;
            ed.hover.edgeDelete = null;
            ed.emit('edge:delete-icon', { edge: d.hit.edge });
          }
        }
        break;
      }
      case 'pan': {
        ed.emit('viewport:change', ed.viewport.snapshot());
        break;
      }
      case 'drag': {
        ed.history.end();
        ed.emit('nodes:move:end', { ids: [...ed.selection.nodes], dx: d.applied.x, dy: d.applied.y, start: d.startPositions });
        break;
      }
      case 'resize': {
        ed.history.end();
        ed.emit('node:resize:end', { id: d.node.id, from: d.startWidth, to: ed.graph.nodeWidth(d.node) });
        break;
      }
      case 'box': {
        const box = ed.selectionBox;
        ed.selectionBox = null;
        if (box) ed.selectInRect(box, { additive: d.additive });
        else ed.requestRender();
        break;
      }
      case 'connect': {
        const w = ed.viewport.toWorld(s.x, s.y);
        const hit = ed.hitTest(w.x, w.y);
        ed.pendingEdge = null;
        ed.hover.port = null;
        if (hit.type === 'port' && this._canConnect(d.from, hit)) {
          const from = d.from;
          const edge =
            from.port.dir === 'out'
              ? { source: from.node.id, sourcePort: from.port.key, target: hit.node.id, targetPort: hit.port.key }
              : { source: hit.node.id, sourcePort: hit.port.key, target: from.node.id, targetPort: from.port.key };
          const added = ed.graph.connect(edge.source, edge.sourcePort, edge.target, edge.targetPort);
          if (added) ed.select({ edges: [added.id] });
        } else {
          ed.emit('connect:cancel', { from: { node: d.from.node.id, port: d.from.port.key }, at: w });
        }
        ed.requestRender();
        break;
      }
    }
    this._updateHover(s);
  }

  /** クリックイベント共通の情報 */
  _clickDetail(e, s, w) {
    return {
      x: w.x,
      y: w.y,
      screen: { x: s.x, y: s.y },
      button: e.button,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      pointerType: e.pointerType,
      originalEvent: e,
    };
  }

  _updateHover(s) {
    const ed = this.editor;
    const w = ed.viewport.toWorld(s.x, s.y);
    const hit = ed.hitTest(w.x, w.y);
    const h = ed.hover;
    const next = {
      node: hit.type === 'node' || hit.type === 'item' || hit.type === 'port' || hit.type === 'resize' ? hit.node.id : null,
      // アイコン上でもコネクタはホバー扱いにして、アイコンが消えないようにする
      edge: hit.type === 'edge' || hit.type === 'edge-delete' ? hit.edge.id : null,
      port: hit.type === 'port' ? { node: hit.node.id, port: hit.port.key } : null,
      edgeDelete: hit.type === 'edge-delete' ? hit.edge.id : null,
    };
    const changed =
      next.node !== h.node ||
      next.edge !== h.edge ||
      next.edgeDelete !== h.edgeDelete ||
      (next.port?.node ?? null) !== (h.port?.node ?? null) ||
      (next.port?.port ?? null) !== (h.port?.port ?? null);
    if (changed) {
      ed.hover = next;
      ed.requestRender();
    }
    this.canvas.style.cursor =
      hit.type === 'edge-delete'
        ? 'pointer'
        : hit.type === 'resize' && !ed.options.readOnly
        ? 'nwse-resize'
        : hit.type === 'port'
          ? 'crosshair'
          : hit.type === 'node' || hit.type === 'item' || hit.type === 'resize'
            ? 'move'
            : hit.type === 'edge'
              ? 'pointer'
              : this.spaceDown
                ? 'grab'
                : 'default';
  }

  /* ---------- wheel ---------- */

  _onWheel(e) {
    e.preventDefault();
    const ed = this.editor;
    const s = this._local(e);
    const now = performance.now();

    // 1 回のスクロール操作（慣性スクロールを含む）の間は、最初に決めた動作（ズーム / パン）を維持する。
    // 慣性中に Shift を離しても途中でズームに切り替わらないようにするため。
    const gap = ed.options.wheelGestureGap ?? 250;
    const mod = e.ctrlKey || e.metaKey;
    const g = this._wheelGesture;
    // 操作の途中で新たに修飾キーが押されたときだけは、ユーザーの意図が明確なので即座に切り替える
    // （離した場合は慣性中の可能性があるので維持する）
    const newlyPressed = g && ((e.shiftKey && !g.shift) || (mod && !g.mod));
    let mode;
    if (g && now - g.time < gap && !newlyPressed) {
      mode = g.mode;
    } else {
      // zoom モード: 通常ズーム、Shift でパン。pan モード: 通常パン、Ctrl/Cmd でズーム
      mode = mod || (ed.options.wheelMode === 'zoom' && !e.shiftKey) ? 'zoom' : 'pan';
    }
    this._wheelGesture = { mode, time: now, shift: e.shiftKey, mod };

    if (mode === 'zoom') {
      const delta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
      const factor = Math.exp(-delta * 0.0015);
      ed.viewport.zoomAt(s.x, s.y, factor);
    } else {
      // パン: deltaX / deltaY をそのまま使う（軸の入れ替えはしない）。
      // トラックパッドの Shift+スワイプはスワイプした方向へ、マウスホイールの Shift+回転は
      // OS / ブラウザが横に変換したものをそのまま横へ動かす。慣性スクロールは deltaX が
      // ちょうど 0 になるため、以前の「deltaX===0 なら横へ」という判定は慣性中だけ横に流れる原因だった。
      const scale = e.deltaMode === 1 ? 20 : 1;
      ed.viewport.panBy(-e.deltaX * scale, -e.deltaY * scale);
    }
    ed.requestRender();
    this._scheduleViewportEvent();
  }

  _scheduleViewportEvent() {
    clearTimeout(this._vpTimer);
    this._vpTimer = setTimeout(() => this.editor.emit('viewport:change', this.editor.viewport.snapshot()), 120);
  }

  /* ---------- dblclick ---------- */

  _onDblClick(e) {
    const ed = this.editor;
    const s = this._local(e);
    const w = ed.viewport.toWorld(s.x, s.y);
    const hit = ed.hitTest(w.x, w.y);
    if (hit.type === 'item') {
      const rect = ed.graph.itemRect(hit.node, hit.item.id);
      ed.emit('item:edit', { node: hit.node, item: hit.item, rect, screenRect: ed.worldRectToScreen(rect) });
    } else if (hit.type === 'node') {
      const r = ed.graph.nodeRect(hit.node);
      const rect = { x: r.x, y: r.y, w: r.w, h: ed.graph.layout.headerHeight };
      ed.emit('node:edit', { node: hit.node, rect, screenRect: ed.worldRectToScreen(rect) });
    } else if (hit.type === 'edge') {
      ed.emit('edge:dblclick', { edge: hit.edge, at: w });
    } else {
      ed.emit('canvas:dblclick', { x: w.x, y: w.y });
    }
  }

  /* ---------- keyboard ---------- */

  /** ホスト側から呼んでもよい（戻り値 true なら処理済み） */
  handleKey(e) {
    const ed = this.editor;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    if (key === ' ') {
      this.spaceDown = true;
      return true;
    }
    if (key === 'Escape') {
      if (this._mode) this._cancelCurrent();
      else ed.clearSelection();
      return true;
    }
    if (mod && (key === 'z' || key === 'Z')) {
      if (e.shiftKey) ed.redo();
      else ed.undo();
      return true;
    }
    if (mod && (key === 'y' || key === 'Y')) {
      ed.redo();
      return true;
    }
    if (key === 'Delete' || key === 'Backspace') {
      // Shift 付きなら選択範囲内のコネクタだけを削除（ノードは残す）
      if (e.shiftKey) ed.deleteSelectedEdges();
      else ed.deleteSelection();
      return true;
    }
    if (mod && (key === 'a' || key === 'A')) {
      ed.selectAll();
      return true;
    }
    if (mod && (key === 'c' || key === 'C')) {
      // 内部クリップボードへ。preventDefault しないことで copy イベントも発火させ、システム側にも書く
      ed.copySelection();
      return false;
    }
    if (mod && (key === 'v' || key === 'V')) {
      // paste イベントに任せる。発火しなかった環境向けに内部クリップボードへフォールバック
      this._pasteHandled = false;
      setTimeout(() => {
        if (this._pasteHandled) return;
        const at = this._lastClientPos ? ed.clientToWorld(this._lastClientPos.x, this._lastClientPos.y) : undefined;
        ed.paste(at);
      }, 50);
      return false;
    }
    if (mod && (key === 'd' || key === 'D')) {
      ed.duplicateSelection();
      return true;
    }
    if (mod && key === '0') {
      ed.resetZoom();
      return true;
    }
    if (mod && (key === '=' || key === '+')) {
      ed.zoomIn();
      return true;
    }
    if (mod && key === '-') {
      ed.zoomOut();
      return true;
    }
    if (!mod && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key) && ed.selection.nodes.size) {
      // 移動単位が設定されていれば 1 押下 = 1 単位（Shift で 10 単位）。未設定なら 1px（Shift で 10px）
      const steps = e.shiftKey ? 10 : 1;
      const sx = key === 'ArrowLeft' ? -steps : key === 'ArrowRight' ? steps : 0;
      const sy = key === 'ArrowUp' ? -steps : key === 'ArrowDown' ? steps : 0;
      ed.nudgeSelection(sx, sy);
      return true;
    }
    return false;
  }

  _onKeyDown(e) {
    if (!this.active || e.defaultPrevented || this._isEditableTarget(e)) return;
    if (this.handleKey(e)) e.preventDefault();
  }

  _onKeyUp(e) {
    if (e.key === ' ') this.spaceDown = false;
  }
}

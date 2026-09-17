/**
 * `<canvas-flow-editor>` の右クリックメニューの既定項目。
 *
 * 項目の形:
 *   { id, label, shortcut?, run(ctx), disabled?, danger? }
 *   { type: 'separator' }
 * `disabled` は真偽値で、省略時は有効。`run` は非同期でもよい。
 *
 * 差し替え・追加は要素の `contextMenuItems` で行う。
 *   el.contextMenuItems = (ctx) => [...ctx.defaultItems, { type: 'separator' },
 *                                   { id: 'log', label: 'ログを見る', run: (c) => open(c.node.id) }];
 * 配列をそのまま渡すこともできる（対象に関係なく同じメニューになる）。
 */

const SEP = { type: 'separator' };

/**
 * @param {object} ctx `context:menu` の detail に、要素（el）・エディタ（editor）・
 *   グラフ（graph）と `defaultItems` を足したもの
 * @returns {Array<object>}
 */
export function defaultContextMenuItems(ctx) {
  const { el, editor, graph, type, node, edge } = ctx;
  const selNodes = editor.selection.nodes.size;
  const selEdges = editor.selectedEdgeIds().length;
  const many = selNodes > 1;

  if (type === 'node' || type === 'item' || type === 'port' || type === 'resize') {
    const isChild = graph.isChild(node);
    // 子ノードを右クリックしたときは、選択（＝一番外側の親）ではなくその子に対して効かせる
    const editItems = isChild
      ? [
          { id: 'duplicate-child', label: 'この子ノードを複製', run: () => duplicateChild(ctx) },
          { id: 'delete-child', label: 'この子ノードを削除', danger: true, run: () => el.removeNode(node.id) },
        ]
      : [
          { id: 'duplicate', label: many ? `${selNodes} 件を複製` : '複製', shortcut: 'Ctrl+D', run: () => el.duplicateSelection() },
          { id: 'delete', label: many ? `${selNodes} 件を削除` : '削除', shortcut: 'Delete', danger: true, run: () => el.deleteSelection() },
        ];
    return [
      ...editItems,
      { id: 'delete-edges', label: 'つながりを外す', shortcut: 'Shift+Delete', disabled: !selEdges, run: () => el.deleteSelectedEdges() },
      SEP,
      { id: 'add-child', label: '子ノードを追加', run: () => addChild(ctx) },
      ...(isChild ? [{ id: 'detach-child', label: '子ノードを親から出す', run: () => detachChild(ctx) }] : []),
      SEP,
      { id: 'select-focused', label: '強調されている要素を選択', shortcut: 'Ctrl+Shift+A', run: () => el.selectFocused() },
      { id: 'select-connected', label: 'つながっている要素を選択', run: () => el.selectConnected() },
      SEP,
      { id: 'copy', label: 'コピー', shortcut: 'Ctrl+C', run: () => editor.copySelection() },
      { id: 'center', label: 'このノードを中心に', run: () => el.focusNode(node.id) },
    ];
  }

  if (type === 'edge' || type === 'edge-delete') {
    const current = graph.edgeType(edge);
    const setType = (t) => () => el.setEdgeType(t, [edge.id]);
    return [
      { id: 'delete-edge', label: 'このコネクタを削除', shortcut: 'Delete', danger: true, run: () => el.removeEdge(edge.id) },
      SEP,
      { id: 'edge-bezier', label: `曲線にする${current === 'bezier' ? '（現在）' : ''}`, disabled: current === 'bezier', run: setType('bezier') },
      { id: 'edge-straight', label: `直線にする${current === 'straight' ? '（現在）' : ''}`, disabled: current === 'straight', run: setType('straight') },
      { id: 'edge-step', label: `直角にする${current === 'step' ? '（現在）' : ''}`, disabled: current === 'step', run: setType('step') },
      SEP,
      { id: 'select-ends', label: '両端のノードを選択', run: () => editor.select({ nodes: [edge.source, edge.target], edges: [edge.id] }) },
    ];
  }

  // 空白
  return [
    { id: 'add-node', label: 'ここにノードを追加', run: () => addNodeHere(ctx) },
    { id: 'paste', label: '貼り付け', shortcut: 'Ctrl+V', run: () => editor.paste({ x: ctx.x, y: ctx.y }) },
    SEP,
    { id: 'select-all', label: 'すべて選択', shortcut: 'Ctrl+A', run: () => editor.selectAll() },
    { id: 'clear-selection', label: '選択を解除', shortcut: 'Esc', disabled: !selNodes && !selEdges, run: () => editor.clearSelection() },
    { id: 'layout', label: selNodes > 1 ? '選択範囲を整列' : '全体を整列', run: () => el.autoLayout() },
    SEP,
    { id: 'fit', label: '全体表示', run: () => el.fitView() },
    { id: 'reset-zoom', label: '縮尺をリセット', shortcut: 'Ctrl+0', run: () => el.resetZoom() },
    { id: 'export', label: 'JSON を書き出し', run: () => el.downloadJSON() },
  ];
}

function addNodeHere({ el, x, y }) {
  const node = el.addNodeAt(
    { title: '新しいノード', input: true, output: true, items: [] },
    { at: { x, y }, anchor: 'header' },
  );
  return node;
}

function addChild({ el, graph, node }) {
  const parent = node.id;
  return el.addChild(parent, {
    title: `子ノード ${graph.childrenOf(parent).length + 1}`,
    input: true,
    output: true,
    items: [],
  });
}

/** 子ノードを（孫ごと）同じ親の次の位置に複製する */
function duplicateChild({ el, graph, node }) {
  const parentId = node.parent;
  if (!parentId) return null;
  const index = graph.childrenOf(parentId).findIndex((c) => c.id === node.id);
  return el.addChild(parentId, cloneSubtree(graph, node), index < 0 ? undefined : index + 1);
}

/** ノードを `childs` 入れ子の入力データに変換する（id は付けず自動生成に任せる） */
function cloneSubtree(graph, node) {
  const { id, parent, x, y, ...rest } = structuredClone(node);
  const kids = graph.childrenOf(node);
  const copy = { ...rest };
  if (kids.length) copy.childs = kids.map((c) => cloneSubtree(graph, c));
  return copy;
}

function detachChild({ el, graph, node }) {
  const root = graph.rootOf(node) ?? node;
  const rect = graph.nodeRect(root);
  return el.detachChild(node.id, { x: rect.x, y: rect.y + rect.h + 30 });
}

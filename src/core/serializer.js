import { uid, parsePortKey } from './graph.js';

/**
 * JSON インポート／エクスポートのフォーマット処理。
 *
 * ファイル形式:
 * {
 *   "format": "canvas-flow",
 *   "version": 1,
 *   "nodes": [ ...Node ],
 *   "edges": [ ...Edge ],
 *   "viewport": { "tx": 0, "ty": 0, "zoom": 1 }   // 任意
 * }
 *
 * `format` / `version` が無いプレーンな {nodes, edges} も受け付ける。
 */
export const FORMAT = 'canvas-flow';
export const FORMAT_VERSION = 1;

/**
 * エクスポート用のオブジェクトを作る。
 * @param {import('./graph.js').Graph} graph
 * @param {{nodeIds?: Iterable<string>, viewport?: object|null}} [options]
 *   nodeIds を渡すとそのノードと、両端がその中に含まれるエッジだけを出力する
 */
export function serialize(graph, { nodeIds, viewport = null } = {}) {
  let nodes;
  let edges;
  if (nodeIds) {
    const set = new Set(nodeIds);
    nodes = [...set].map((id) => graph.nodes.get(id)).filter(Boolean);
    const seen = new Set();
    edges = [];
    for (const n of nodes) {
      for (const e of graph.edgesOf(n.id)) {
        if (!seen.has(e.id) && set.has(e.source) && set.has(e.target)) {
          seen.add(e.id);
          edges.push(e);
        }
      }
    }
  } else {
    nodes = [...graph.nodes.values()];
    edges = [...graph.edges.values()];
  }
  const out = {
    format: FORMAT,
    version: FORMAT_VERSION,
    nodes: nodes.map((n) => structuredClone(n)),
    edges: edges.map((e) => structuredClone(e)),
  };
  if (viewport) out.viewport = { tx: viewport.tx, ty: viewport.ty, zoom: viewport.zoom };
  return out;
}

/**
 * 文字列またはオブジェクトを解釈して検証する。
 * @returns {{ok: true, data: {nodes:object[], edges:object[], viewport?:object}, warnings: string[]} | {ok: false, errors: string[]}}
 */
export function parse(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (err) {
      return { ok: false, errors: [`JSON の構文エラー: ${err.message}`] };
    }
  }
  return validate(data);
}

/**
 * データ構造の検証。壊れたエッジ（存在しないノード／ポートを指すもの）は警告として除外する。
 */
export function validate(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['ルートはオブジェクトである必要があります'] };
  }
  if (data.format != null && data.format !== FORMAT) {
    return { ok: false, errors: [`未対応のフォーマットです: ${data.format}`] };
  }
  if (data.version != null && (typeof data.version !== 'number' || data.version > FORMAT_VERSION)) {
    return { ok: false, errors: [`未対応のバージョンです: ${data.version}（対応: ${FORMAT_VERSION} 以下）`] };
  }
  const rawNodes = data.nodes ?? [];
  const rawEdges = data.edges ?? [];
  if (!Array.isArray(rawNodes)) errors.push('nodes は配列である必要があります');
  if (!Array.isArray(rawEdges)) errors.push('edges は配列である必要があります');
  if (errors.length) return { ok: false, errors };

  const nodes = [];
  const ids = new Set();
  rawNodes.forEach((n, i) => {
    if (!n || typeof n !== 'object') return void errors.push(`nodes[${i}] がオブジェクトではありません`);
    const node = { ...n };
    if (node.id == null) node.id = uid('n');
    node.id = String(node.id);
    if (ids.has(node.id)) return void errors.push(`nodes[${i}]: id "${node.id}" が重複しています`);
    ids.add(node.id);
    if (typeof node.x !== 'number' || !Number.isFinite(node.x)) node.x = 0;
    if (typeof node.y !== 'number' || !Number.isFinite(node.y)) node.y = 0;
    if (node.width != null && (typeof node.width !== 'number' || node.width <= 0)) delete node.width;
    if (node.title != null && typeof node.title !== 'string') node.title = String(node.title);
    if (node.items != null && !Array.isArray(node.items)) {
      warnings.push(`nodes[${i}]: items が配列でないため無視しました`);
      node.items = [];
    }
    if (node.items) {
      const itemIds = new Set();
      node.items = node.items
        .filter((it) => it && typeof it === 'object')
        .map((it) => {
          const item = { ...it };
          if (item.id == null) item.id = uid('i');
          item.id = String(item.id);
          if (itemIds.has(item.id)) {
            warnings.push(`nodes[${i}]: 項目 id "${item.id}" が重複しているため付け替えました`);
            item.id = uid('i');
          }
          itemIds.add(item.id);
          return item;
        });
    }
    nodes.push(node);
  });
  if (errors.length) return { ok: false, errors };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  const edgeIds = new Set();
  rawEdges.forEach((e, i) => {
    if (!e || typeof e !== 'object') return void warnings.push(`edges[${i}] がオブジェクトではないため無視しました`);
    const edge = { ...e };
    if (edge.id == null) edge.id = uid('e');
    edge.id = String(edge.id);
    if (edgeIds.has(edge.id)) {
      warnings.push(`edges[${i}]: id "${edge.id}" が重複しているため付け替えました`);
      edge.id = uid('e');
    }
    const s = nodeMap.get(String(edge.source));
    const t = nodeMap.get(String(edge.target));
    if (!s || !t) return void warnings.push(`edges[${i}]: 存在しないノードを参照しているため無視しました`);
    edge.source = s.id;
    edge.target = t.id;
    if (!portExists(s, edge.sourcePort, 'out') || !portExists(t, edge.targetPort, 'in')) {
      return void warnings.push(`edges[${i}]: 存在しないポートを参照しているため無視しました`);
    }
    edgeIds.add(edge.id);
    edges.push(edge);
  });

  const out = { nodes, edges };
  const vp = data.viewport;
  if (vp && typeof vp === 'object' && [vp.tx, vp.ty, vp.zoom].every((v) => typeof v === 'number' && Number.isFinite(v)) && vp.zoom > 0) {
    out.viewport = { tx: vp.tx, ty: vp.ty, zoom: vp.zoom };
  }
  return { ok: true, data: out, warnings };
}

function portExists(node, key, dir) {
  const p = parsePortKey(key);
  if (!p || p.dir !== dir) return false;
  if (p.itemId == null) return !!(dir === 'in' ? node.input : node.output);
  const item = (node.items ?? []).find((it) => it.id === p.itemId);
  return !!item && !!(dir === 'in' ? item.input : item.output);
}

/**
 * 既存グラフと衝突する ID を付け替えたコピーを返す（merge 用）。
 * @param {{nodes:object[], edges:object[]}} data
 * @param {import('./graph.js').Graph} graph
 * @param {{offset?:{x:number,y:number}, forceNewIds?:boolean}} [options]
 */
export function remapForMerge(data, graph, { offset, forceNewIds = false } = {}) {
  const idMap = new Map();
  const nodes = data.nodes.map((n) => {
    const copy = structuredClone(n);
    if (forceNewIds || graph.nodes.has(copy.id)) {
      const next = uid('n');
      idMap.set(copy.id, next);
      copy.id = next;
    }
    if (offset) {
      copy.x += offset.x;
      copy.y += offset.y;
    }
    return copy;
  });
  const edges = data.edges.map((e) => {
    const copy = structuredClone(e);
    copy.source = idMap.get(copy.source) ?? copy.source;
    copy.target = idMap.get(copy.target) ?? copy.target;
    if (forceNewIds || graph.edges.has(copy.id)) copy.id = uid('e');
    return copy;
  });
  return { nodes, edges, idMap };
}

/** ブラウザでファイルとしてダウンロードさせる */
export function downloadText(text, filename, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** ファイル選択ダイアログを開き、選んだファイルの中身（文字列）を返す。キャンセル時は null */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (value) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      done({ name: file.name, text: await file.text() });
    });
    // キャンセル検出（対応ブラウザのみ）
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

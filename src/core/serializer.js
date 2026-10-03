import { uid, parsePortKey, normalizeGoto, normalizeNote } from './graph.js';

/**
 * JSON インポート／エクスポートのフォーマット処理。
 *
 * ファイル形式:
 * {
 *   "format": "canvas-flow",
 *   "version": 1,
 *   "nodes": [ ...Node ],
 *   "edges": [ ...Edge ],
 *   "groups": [ ...Group ],                        // 任意。ノードは node.group でメンバーになる
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
 * @param {{nodeIds?: Iterable<string>, groupIds?: Iterable<string>, viewport?: object|null}} [options]
 *   nodeIds / groupIds を渡すとそのノード（グループはメンバーごと）と、両端がその中に含まれるエッジだけを出力する
 */
export function serialize(graph, { nodeIds, groupIds, viewport = null } = {}) {
  const pack = (node, isRoot) => {
    const { parent, ...rest } = structuredClone(node);
    if (!isRoot) {
      delete rest.x;
      delete rest.y;
      delete rest.width;
    }
    const kids = graph.childrenOf(node);
    if (kids.length) rest.childs = kids.map((c) => pack(c, false));
    return rest;
  };

  let tops;
  let edges;
  let groups;
  if (nodeIds || groupIds) {
    groups = [...(groupIds ?? [])].map((id) => graph.groups.get(id)).filter(Boolean);
    // 指定ノードは子孫も一緒に書き出す。グループはメンバーも一緒に
    const set = new Set();
    const ids = [...(nodeIds ?? [])];
    for (const g of groups) for (const n of graph.groupMembers(g)) ids.push(n.id);
    for (const id of ids) {
      const node = graph.nodes.get(id);
      if (!node) continue;
      set.add(node.id);
      for (const d of graph.descendantIds(node)) set.add(d);
    }
    tops = [...set]
      .map((id) => graph.nodes.get(id))
      .filter((n) => n && !(n.parent && set.has(n.parent)));
    const seen = new Set();
    edges = [];
    for (const id of set) {
      for (const e of graph.edgesOf(id)) {
        if (!seen.has(e.id) && set.has(e.source) && set.has(e.target)) {
          seen.add(e.id);
          edges.push(e);
        }
      }
    }
  } else {
    tops = [...graph.nodes.values()].filter((n) => !graph.isChild(n));
    edges = [...graph.edges.values()];
    groups = [...(graph.groups?.values() ?? [])];
  }
  const out = {
    format: FORMAT,
    version: FORMAT_VERSION,
    nodes: tops.map((n) => pack(n, true)),
    edges: edges.map((e) => structuredClone(e)),
  };
  if (groups.length) out.groups = groups.map((g) => structuredClone(g));
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
  const rawGroups = data.groups ?? [];
  if (!Array.isArray(rawNodes)) errors.push('nodes は配列である必要があります');
  if (!Array.isArray(rawEdges)) errors.push('edges は配列である必要があります');
  if (!Array.isArray(rawGroups)) errors.push('groups は配列である必要があります');
  if (errors.length) return { ok: false, errors };

  const groups = [];
  const groupIds = new Set();
  rawGroups.forEach((g, i) => {
    if (!g || typeof g !== 'object') return void warnings.push(`groups[${i}] がオブジェクトではないため無視しました`);
    const group = { ...g };
    if (group.id == null) group.id = uid('g');
    group.id = String(group.id);
    if (groupIds.has(group.id)) {
      errors.push(`groups[${i}]: id "${group.id}" が重複しています`);
      return;
    }
    groupIds.add(group.id);
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!num(group.x)) group.x = 0;
    if (!num(group.y)) group.y = 0;
    if (!num(group.width) || group.width <= 0) group.width = 320;
    if (!num(group.height) || group.height <= 0) group.height = 200;
    group.label = group.label == null ? '' : String(group.label);
    groups.push(group);
  });
  if (errors.length) return { ok: false, errors };

  const nodes = [];
  const flat = [];
  const ids = new Set();

  const normalizeNode = (n, path) => {
    if (!n || typeof n !== 'object') {
      errors.push(`${path} がオブジェクトではありません`);
      return null;
    }
    const node = { ...n };
    if (node.id == null) node.id = uid('n');
    node.id = String(node.id);
    if (ids.has(node.id)) {
      errors.push(`${path}: id "${node.id}" が重複しています`);
      return null;
    }
    ids.add(node.id);
    if (typeof node.x !== 'number' || !Number.isFinite(node.x)) node.x = 0;
    if (typeof node.y !== 'number' || !Number.isFinite(node.y)) node.y = 0;
    if (node.width != null && (typeof node.width !== 'number' || node.width <= 0)) delete node.width;
    if (node.title != null && typeof node.title !== 'string') node.title = String(node.title);
    if (node.items != null && !Array.isArray(node.items)) {
      warnings.push(`${path}: items が配列でないため無視しました`);
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
            warnings.push(`${path}: 項目 id "${item.id}" が重複しているため付け替えました`);
            item.id = uid('i');
          }
          itemIds.add(item.id);
          return item;
        });
    }
    // メモは形だけ見て、解釈できないものは落とす
    if (node.note != null && !normalizeNote(node.note)) {
      warnings.push(`${path}: note を解釈できないため無視しました`);
      delete node.note;
    }
    // goto（ID 指定の遷移）は形だけ見て、解釈できないものは落とす
    if (node.goto != null && !normalizeGoto(node.goto).length) {
      warnings.push(`${path}: goto を解釈できないため無視しました`);
      delete node.goto;
    }
    for (const it of node.items ?? []) {
      if (it.goto != null && !normalizeGoto(it.goto).length) {
        warnings.push(`${path}: 項目 "${it.id}" の goto を解釈できないため無視しました`);
        delete it.goto;
      }
    }
    // 親から渡される座標は自動配置で上書きされるため、入力の parent は無視する
    delete node.parent;
    // group は ID（文字列）だけ受け付ける。存在しないグループを指していても読み込み時に無視される
    if (node.group != null) {
      if (typeof node.group === 'number') node.group = String(node.group);
      if (typeof node.group !== 'string' || !node.group) {
        warnings.push(`${path}: group を解釈できないため無視しました`);
        delete node.group;
      }
    }
    if (node.childs != null && !Array.isArray(node.childs)) {
      warnings.push(`${path}: childs が配列でないため無視しました`);
      delete node.childs;
    }
    if (node.childs) {
      const kids = [];
      node.childs.forEach((c, k) => {
        const child = normalizeNode(c, `${path}.childs[${k}]`);
        if (child) kids.push(child);
      });
      if (kids.length) node.childs = kids;
      else delete node.childs;
    }
    flat.push(node);
    return node;
  };

  rawNodes.forEach((n, i) => {
    const node = normalizeNode(n, `nodes[${i}]`);
    if (node) nodes.push(node);
  });
  if (errors.length) return { ok: false, errors };

  const nodeMap = new Map(flat.map((n) => [n.id, n]));
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
    if (edge.note != null && !normalizeNote(edge.note)) {
      warnings.push(`edges[${i}]: note を解釈できないため無視しました`);
      delete edge.note;
    }
    if (!portExists(s, edge.sourcePort, 'out') || !portExists(t, edge.targetPort, 'in')) {
      return void warnings.push(`edges[${i}]: 存在しないポートを参照しているため無視しました`);
    }
    edgeIds.add(edge.id);
    edges.push(edge);
  });

  const out = { nodes, edges };
  if (groups.length) out.groups = groups;
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
 * @param {{nodes:object[], edges:object[], groups?:object[]}} data
 * @param {import('./graph.js').Graph} graph
 * @param {{offset?:{x:number,y:number}, forceNewIds?:boolean}} [options]
 */
export function remapForMerge(data, graph, { offset, forceNewIds = false } = {}) {
  const idMap = new Map();
  const groupMap = new Map();
  const groups = (data.groups ?? []).map((g) => {
    const copy = structuredClone(g);
    if (forceNewIds || graph.groups?.has(copy.id)) {
      const next = uid('g');
      groupMap.set(copy.id, next);
      copy.id = next;
    }
    if (offset) {
      copy.x += offset.x;
      copy.y += offset.y;
    }
    return copy;
  });
  const remapNode = (n, isRoot) => {
    const copy = { ...structuredClone(n) };
    if (forceNewIds || graph.nodes.has(copy.id)) {
      const next = uid('n');
      idMap.set(copy.id, next);
      copy.id = next;
    }
    if (isRoot && offset) {
      copy.x += offset.x;
      copy.y += offset.y;
    }
    if (copy.group != null && groupMap.has(copy.group)) copy.group = groupMap.get(copy.group);
    // 子ノードは親が自動配置するのでオフセットは不要。id だけ付け替える
    if (Array.isArray(copy.childs)) copy.childs = copy.childs.map((c) => remapNode(c, false));
    return copy;
  };
  const nodes = data.nodes.map((n) => remapNode(n, true));
  const edges = data.edges.map((e) => {
    const copy = structuredClone(e);
    copy.source = idMap.get(copy.source) ?? copy.source;
    copy.target = idMap.get(copy.target) ?? copy.target;
    if (forceNewIds || graph.edges.has(copy.id)) copy.id = uid('e');
    return copy;
  });
  // goto の遷移先 ID も付け替える（付け替え対象に無い ID はそのまま＝外のノードを指したまま）
  const remapGoto = (value) => {
    if (value == null) return value;
    const one = (v) => {
      if (typeof v === 'string') return idMap.get(v) ?? v;
      if (v && typeof v === 'object' && typeof v.to === 'string') return { ...v, to: idMap.get(v.to) ?? v.to };
      return v;
    };
    return Array.isArray(value) ? value.map(one) : one(value);
  };
  const walkGoto = (node) => {
    if (node.goto != null) node.goto = remapGoto(node.goto);
    for (const it of node.items ?? []) if (it.goto != null) it.goto = remapGoto(it.goto);
    if (Array.isArray(node.childs)) node.childs.forEach(walkGoto);
  };
  nodes.forEach(walkGoto);
  return { nodes, edges, groups, idMap, groupMap };
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

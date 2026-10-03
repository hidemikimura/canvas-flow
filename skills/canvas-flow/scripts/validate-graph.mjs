#!/usr/bin/env node
/**
 * canvas-flow 用の JSON を検証する。
 *
 *   node validate-graph.mjs graph.json [--lib <パッケージのディレクトリ>] [--json]
 *
 * 1. ライブラリの validate() で構造を確かめる（エラー・警告）
 * 2. 実際に Graph に読み込み、黙って捨てられるコネクタを理由つきで挙げる
 *    （存在しないポート・向き違い・上限超過・重複・同じノード同士）
 * 3. 重なっているノード、存在しないグループを指すノードなどの注意点を挙げる
 *
 * 終了コード: 0 = 問題なし（注意のみ含む）、1 = エラーか捨てられるコネクタあり、2 = 実行できない
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const libIdx = args.indexOf('--lib');
const libDir = libIdx >= 0 ? args[libIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && (libIdx < 0 || i !== libIdx + 1));

if (!file) {
  console.error('使い方: node validate-graph.mjs <graph.json> [--lib <@hidemikimura/canvas-flow のディレクトリ>] [--json]');
  process.exit(2);
}

/** ライブラリのコアを探す。--lib > カレントから解決 > このリポジトリの src */
async function loadCore() {
  const candidates = [];
  if (libDir) {
    const dir = resolve(libDir);
    candidates.push(join(dir, 'dist/core.js'), join(dir, 'src/core/editor.js'));
  } else {
    try {
      const req = createRequire(join(process.cwd(), 'noop.js'));
      candidates.push(req.resolve('@hidemikimura/canvas-flow/core'));
    } catch {
      /* 見つからなければ次へ */
    }
    candidates.push(resolve(process.cwd(), 'src/core/editor.js'));
  }
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      return await import(pathToFileURL(p).href);
    } catch (err) {
      console.error(`読み込みに失敗: ${p}\n${err.message}`);
    }
  }
  console.error('@hidemikimura/canvas-flow が見つかりません。プロジェクトのディレクトリで実行するか --lib で場所を指定してください。');
  process.exit(2);
}

const core = await loadCore();
const { validate, Graph, parsePortKey } = core;

let raw;
try {
  raw = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`JSON として読めません: ${err.message}`);
  process.exit(1);
}

const report = { file, errors: [], warnings: [], droppedEdges: [], notices: [], stats: {} };

const v = validate(raw);
if (!v.ok) {
  report.errors.push(...v.errors);
  finish();
}
report.warnings.push(...v.warnings);
const data = v.data;

// 実際に読み込んで、addEdge で捨てられるコネクタを調べる（読み込み順もライブラリと同じにする）
const g = new Graph();
g.batch(() => {
  for (const grp of data.groups ?? []) g.addGroup(grp);
  for (const n of data.nodes) g.addNode(n);
});
const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
data.edges.forEach((e) => {
  // validate を通ったコネクタも、上限・重複・同じノード同士で落ちることがある
  const { source: src, sourcePort: sp, target: dst, targetPort: dp } = e;
  const reason = g.connectError(src, sp, dst, dp);
  if (reason) {
    report.droppedEdges.push({ id: e.id, source: `${e.source}.${e.sourcePort}`, target: `${e.target}.${e.targetPort}`, reason: explain(reason, g, src, sp, dst, dp) });
    return;
  }
  g.addEdge(e);
});

// validate が警告で落としたコネクタを、原因が分かる形に言い直す
let droppedByValidate = 0;
report.warnings = report.warnings.filter((w) => {
  const m = /^edges\[(\d+)\]: (存在しないノード|存在しないポート)/.exec(w);
  if (!m) return true;
  droppedByValidate++;
  const e = rawEdges[Number(m[1])] ?? {};
  report.droppedEdges.push({
    id: e.id ?? `edges[${m[1]}]`,
    source: `${e.source}.${e.sourcePort}`,
    target: `${e.target}.${e.targetPort}`,
    reason: explainRaw(e, g),
  });
  return false;
});

// 注意点
const flatNodes = [...g.nodes.values()];
for (const n of data.nodes) {
  if (n.group != null && !g.groups.has(n.group)) report.notices.push(`node ${n.id}: group "${n.group}" が存在しないため無視される`);
}
const roots = flatNodes.filter((n) => !g.isChild(n));
const overlaps = [];
for (let i = 0; i < roots.length && overlaps.length < 20; i++) {
  const a = g.nodeRect(roots[i]);
  for (const other of g.nodesInRect(a)) {
    if (other.id <= roots[i].id || g.isChild(other)) continue;
    const b = g.nodeRect(other);
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${roots[i].id} と ${other.id}`);
  }
}
if (overlaps.length) report.notices.push(`重なっているノード: ${overlaps.join(', ')}${overlaps.length >= 20 ? ' …' : ''}（autoLayout() で並べ直せる）`);
const allZero = roots.length > 1 && roots.every((n) => n.x === 0 && n.y === 0);
if (allZero) report.notices.push('すべてのノードが (0, 0) にある。座標を計算するか、読み込み後に autoLayout() を呼ぶこと');
for (const grp of g.groups.values()) {
  const r = g.groupRect(grp);
  for (const m of g.groupMembers(grp)) {
    const nr = g.nodeRect(m);
    if (nr.x < r.x || nr.y < r.y + g.layout.groupLabelHeight || nr.x + nr.w > r.x + r.w || nr.y + nr.h > r.y + r.h) {
      report.notices.push(`group ${grp.id}: メンバー ${m.id} が枠（ラベル帯の下）からはみ出している（fitGroup() で合わせられる）`);
    }
  }
}
const isolated = roots.filter((n) => g.edgesOf(n.id).length === 0 && !g.descendantIds(n).some((d) => g.edgesOf(d).length));
report.stats = {
  nodes: flatNodes.length,
  rootNodes: roots.length,
  edgesInFile: rawEdges.length,
  edgesLoaded: g.edges.size,
  droppedByValidate,
  groups: g.groups.size,
  isolatedNodes: isolated.length,
};
finish();

/** 検証で落ちたコネクタの原因（ノードが無い・向き違い・ポートが無い） */
function explainRaw(e, graph) {
  const missing = [e.source, e.target].filter((id) => !graph.nodes.has(String(id)));
  if (missing.length) return `存在しないノード: ${missing.join(', ')}（子ノードも含めて id を確認）`;
  const sp = parsePortKey(String(e.sourcePort ?? ''));
  const tp = parsePortKey(String(e.targetPort ?? ''));
  if (!sp || !tp) return `ポートキーの書式が違う（"in" / "out" / "item:<項目id>:in" / "item:<項目id>:out" のどれか）: ${e.sourcePort} → ${e.targetPort}`;
  if (sp.dir === 'in' && tp.dir === 'out') return 'source / target が逆向き（JSON では出力ポート → 入力ポートの向きで書く必要があり、逆向きは読み込み時に捨てられる）';
  if (sp.dir !== 'out' || tp.dir !== 'in') return `向きが違う: sourcePort は出力（out）、targetPort は入力（in）`;
  const miss = [];
  if (!graph.portPosition(String(e.source), e.sourcePort)) miss.push(`${e.source} に出力ポート ${e.sourcePort} が無い`);
  if (!graph.portPosition(String(e.target), e.targetPort)) miss.push(`${e.target} に入力ポート ${e.targetPort} が無い`);
  return `存在しないポート: ${miss.join(' / ')}（項目の id と input / output の指定を確認）`;
}

function explain(reason, graph, src, sp, dst, dp) {
  switch (reason) {
    case 'same-node':
      return 'same-node: 同じノード同士はつなげない';
    case 'invalid-port':
      return `invalid-port: sourcePort は ":out"（または "out"）、targetPort は ":in"（または "in"）で終わる必要がある（${sp} → ${dp}）`;
    case 'missing-port': {
      const miss = [];
      if (!graph.portPosition(src, sp)) miss.push(`${src} に出力ポート ${sp} が無い`);
      if (!graph.portPosition(dst, dp)) miss.push(`${dst} に入力ポート ${dp} が無い`);
      return `missing-port: ${miss.join(' / ')}（項目の id と input / output の指定を確認）`;
    }
    case 'duplicate':
      return 'duplicate: 同じポートの組のコネクタがすでにある';
    case 'source-full': {
      const c = graph.portCapacity(src, sp);
      return `source-full: ${src}.${sp} は最大 ${c?.max} 本まで`;
    }
    case 'target-full': {
      const c = graph.portCapacity(dst, dp);
      return `target-full: ${dst}.${dp} は最大 ${c?.max} 本まで`;
    }
    default:
      return reason;
  }
}

function finish() {
  const failed = report.errors.length > 0 || report.droppedEdges.length > 0;
  if (asJson) {
    console.log(JSON.stringify({ ok: !failed, ...report }, null, 2));
  } else {
    const out = [];
    out.push(failed ? `NG: ${file}` : `OK: ${file}`);
    if (report.stats.nodes != null) {
      const s = report.stats;
      out.push(`  ノード ${s.nodes}（トップレベル ${s.rootNodes}）/ コネクタ ${s.edgesLoaded} / ${s.edgesInFile}（読み込めた / ファイル内）/ グループ ${s.groups} / どこにもつながっていないノード ${s.isolatedNodes}`);
    }
    for (const e of report.errors) out.push(`  [エラー] ${e}`);
    for (const w of report.warnings) out.push(`  [警告] ${w}`);
    for (const d of report.droppedEdges) out.push(`  [捨てられるコネクタ] ${d.id}: ${d.source} → ${d.target} … ${d.reason}`);
    for (const n of report.notices) out.push(`  [注意] ${n}`);
    console.log(out.join('\n'));
  }
  process.exit(failed ? 1 : 0);
}

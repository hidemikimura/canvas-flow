/**
 * シナリオ分析ビューの試作。
 *
 * read-only のノードエディタの上に、計測値を次の 3 つで重ねている。
 *  1. 項目行の下端の割合バー（選択率）と、ヘッダ下端の離脱率バー  → overlayRenderer
 *  2. ノードのヒートマップ（表示回数が多いほどヘッダが濃い）      → node.style
 *  3. コネクタの太さ（遷移数）                                    → edge.style.strokeWidth
 * 数値そのものは「項目の value 列」（ノードのサイズが変わらない場所）と
 * ホバー時の HTML 吹き出しで見せる。
 *
 * 計測値の持ち方（このライブラリは data を素通しするだけなので形式は自由）:
 *   node.data.stats = { views, exits }
 *   item.data.stats = { selected }
 *   edge.data.stats = { transitions }
 */
import '../src/index.js';

const el = document.getElementById('editor');
const tip = document.getElementById('tip');
const info = document.getElementById('info');

const show = { bars: true, heat: true, flow: true };

/* ---------------- サンプルのシナリオ + 計測値 ---------------- */

const SCENARIO = {
  nodes: [
    {
      id: 'greet', title: '① あいさつ', x: 0, y: 160, output: true,
      data: { stats: { views: 5000, exits: 140 } },
      items: [{ id: 'g1', label: 'こんにちは！ご用件は？', output: true, data: { stats: { selected: 4860 } } }],
    },
    {
      id: 'menu', title: '② メインメニュー', x: 320, y: 100, input: true, output: true,
      data: { stats: { views: 4860, exits: 520 } },
      items: [
        { id: 'm1', label: '料金を知りたい', input: false, output: true, data: { stats: { selected: 2180 } } },
        { id: 'm2', label: '使い方を知りたい', output: true, data: { stats: { selected: 1240 } } },
        { id: 'm3', label: '人に相談したい', output: true, data: { stats: { selected: 760 } } },
        { id: 'm4', label: 'その他', output: true, data: { stats: { selected: 160 } } },
      ],
    },
    {
      id: 'price', title: '③ 料金案内', x: 700, y: 0, input: true, output: true,
      data: { stats: { views: 2180, exits: 260 } },
      items: [
        { id: 'p1', label: 'プラン表を見る', output: true, data: { stats: { selected: 1310 } } },
        { id: 'p2', label: '見積もりを依頼', output: true, data: { stats: { selected: 470 } } },
        { id: 'p3', label: 'メニューに戻る', output: true, data: { stats: { selected: 140 } } },
      ],
    },
    {
      id: 'howto', title: '④ 使い方案内', x: 700, y: 250, input: true, output: true,
      data: { stats: { views: 1240, exits: 410 } },
      items: [
        { id: 'h1', label: '動画で見る', output: true, data: { stats: { selected: 520 } } },
        { id: 'h2', label: 'ドキュメントを開く', output: true, data: { stats: { selected: 240 } } },
        { id: 'h3', label: '解決しなかった', output: true, data: { stats: { selected: 70 } } },
      ],
    },
    {
      id: 'agent', title: '⑤ 有人チャットへ', x: 1080, y: 420, input: true, output: true,
      data: { stats: { views: 900, exits: 90 } },
      items: [{ id: 'a1', label: 'オペレーターにつなぐ', output: true, data: { stats: { selected: 810 } } }],
    },
    {
      id: 'survey', title: '⑥ 満足度アンケート', x: 1080, y: 120, input: true, output: true,
      data: { stats: { views: 2550, exits: 1180 } },
      items: [
        { id: 's1', label: '解決した', output: true, data: { stats: { selected: 980 } } },
        { id: 's2', label: '解決しなかった', output: true, data: { stats: { selected: 390 } } },
      ],
    },
    {
      id: 'end', title: '⑦ 終了メッセージ', x: 1440, y: 240, input: true,
      data: { stats: { views: 1790, exits: 1790 } },
      items: [{ id: 'e1', label: 'ご利用ありがとうございました', data: { stats: { selected: 1790 } } }],
    },
  ],
  edges: [
    ['e1', 'greet', 'item:g1:out', 'menu', 'in', 4860],
    ['e2', 'menu', 'item:m1:out', 'price', 'in', 2180],
    ['e3', 'menu', 'item:m2:out', 'howto', 'in', 1240],
    ['e4', 'menu', 'item:m3:out', 'agent', 'in', 760],
    ['e5', 'price', 'item:p1:out', 'survey', 'in', 1310],
    ['e6', 'price', 'item:p2:out', 'agent', 'in', 470],
    ['e7', 'price', 'item:p3:out', 'menu', 'in', 140],
    ['e8', 'howto', 'item:h1:out', 'survey', 'in', 520],
    ['e9', 'howto', 'item:h2:out', 'survey', 'in', 240],
    ['e10', 'howto', 'item:h3:out', 'agent', 'in', 70],
    ['e11', 'agent', 'item:a1:out', 'end', 'in', 810],
    ['e12', 'survey', 'item:s1:out', 'end', 'in', 980],
    ['e13', 'survey', 'item:s2:out', 'agent', 'in', 390],
  ].map(([id, source, sourcePort, target, targetPort, transitions]) => ({
    id, source, sourcePort, target, targetPort, data: { stats: { transitions } },
  })),
};

/* ---------------- 計測値 → 表示用の加工 ---------------- */

const nf = new Intl.NumberFormat('ja-JP');
const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

const statsOf = (obj) => obj?.data?.stats ?? null;
const viewsOf = (node) => statsOf(node)?.views ?? 0;
const exitRateOf = (node) => {
  const s = statsOf(node);
  return s && s.views ? Math.min(1, (s.exits ?? 0) / s.views) : 0;
};
/** 項目の選択率（そのノードの表示回数に対する割合） */
const selectRateOf = (node, item) => {
  const v = viewsOf(node);
  const s = statsOf(item)?.selected ?? 0;
  return v ? Math.min(1, s / v) : 0;
};

/** 表示回数に応じてヘッダの色を濃くする（ヒートマップ） */
function heatStyle(node, maxViews) {
  const t = maxViews ? viewsOf(node) / maxViews : 0;
  // #eef1f5（薄） → #bfd7fb（濃）
  const mix = (a, b) => Math.round(a + (b - a) * t);
  const headerFill = `rgb(${mix(238, 191)}, ${mix(241, 215)}, ${mix(245, 251)})`;
  const exit = exitRateOf(node);
  return {
    headerFill,
    // 離脱率が高いノードは枠を赤寄りに
    stroke: exit >= 0.4 ? '#f0a3a3' : exit >= 0.2 ? '#f3c7a3' : '#c9ced6',
  };
}

function prepare(data) {
  const maxViews = Math.max(...data.nodes.map(viewsOf));
  const maxTransitions = Math.max(...data.edges.map((e) => statsOf(e)?.transitions ?? 0));
  const nodes = data.nodes.map((node) => ({
    ...node,
    // 数値はノードのサイズが変わらない「value 列」に入れる
    items: (node.items ?? []).map((item) => ({
      ...item,
      // 割合はバーで見えるので、value 列は回数だけにしてラベルの幅を残す
      value: nf.format(statsOf(item)?.selected ?? 0),
    })),
    style: show.heat ? heatStyle(node, maxViews) : undefined,
  }));
  const edges = data.edges.map((edge) => {
    const t = (statsOf(edge)?.transitions ?? 0) / (maxTransitions || 1);
    return { ...edge, style: show.flow ? { strokeWidth: 1 + t * 7, stroke: '#94a3b8' } : undefined };
  });
  return { nodes, edges };
}

/* ---------------- 追加描画（項目行のバー） ---------------- */

function overlay(ctx, api) {
  if (!show.bars || api.lod) return; // 縮小時は項目が描かれないのでバーも出さない
  const { graph, zoom } = api;
  const { padding, headerHeight } = graph.layout;
  const barH = 4;

  for (const node of api.nodes) {
    const s = statsOf(node);
    if (!s) continue;
    const rect = graph.nodeRect(node);

    // ヘッダ下端の離脱率バー（右から伸ばして選択率バーと区別する）
    const exit = exitRateOf(node);
    if (exit > 0) {
      const trackW = (rect.w - padding * 2) / 2; // ヘッダは右半分だけ使う
      const x0 = rect.x + rect.w - padding - trackW;
      const y0 = rect.y + headerHeight - barH - 2;
      ctx.fillStyle = 'rgba(239,68,68,0.18)';
      api.roundRect(x0, y0, trackW, barH, barH / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(239,68,68,0.9)';
      api.roundRect(x0, y0, Math.max(barH, trackW * exit), barH, barH / 2);
      ctx.fill();
    }

    // 項目行の下端の選択率バー（文字に重ならない位置に置く）
    const best = Math.max(0, ...(node.items ?? []).map((it) => statsOf(it)?.selected ?? 0));
    for (const item of node.items ?? []) {
      const ir = graph.itemRect(node, item.id);
      if (!ir) continue;
      const rate = selectRateOf(node, item);
      const trackW = ir.w - padding * 2;
      const y = ir.y + ir.h - barH - 2;
      ctx.fillStyle = 'rgba(203,213,225,0.7)';
      api.roundRect(ir.x + padding, y, trackW, barH, barH / 2);
      ctx.fill();
      if (rate > 0) {
        const isBest = (statsOf(item)?.selected ?? 0) === best && best > 0;
        ctx.fillStyle = isBest ? '#2563eb' : 'rgba(59,130,246,0.75)';
        api.roundRect(ir.x + padding, y, Math.max(barH, trackW * rate), barH, barH / 2);
        ctx.fill();
      }
      // ホバー中の行を枠で示す
      if (hovered && hovered.node.id === node.id && hovered.item?.id === item.id) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5 / zoom;
        api.roundRect(ir.x + 2, ir.y + 1, ir.w - 4, ir.h - 2, 4);
        ctx.stroke();
      }
    }
  }
}

/* ---------------- ホバー詳細 ---------------- */

let hovered = null; // { node, item }
let raf = 0;

function bar(rate) {
  return `<div class="track"><div class="bar" style="width:${Math.round(rate * 100)}%"></div></div>`;
}

function tipHTML({ node, item }) {
  const s = statsOf(node);
  const ed = el.editor;
  const rows = (node.items ?? [])
    .map((it) => {
      const rate = selectRateOf(node, it);
      const hot = item && it.id === item.id ? ' class="hot"' : '';
      return `<tr${hot}><th>${escapeHTML(it.label ?? it.id)}</th><td>${nf.format(statsOf(it)?.selected ?? 0)}</td><td>${pct(rate)}</td><td class="barcell">${bar(rate)}</td></tr>`;
    })
    .join('');
  const outgoing = ed.graph
    .edgesOf(node.id)
    .filter((e) => e.source === node.id)
    .map((e) => {
      const to = ed.graph.getNode(e.target);
      const n = statsOf(e)?.transitions ?? 0;
      return `<tr><th>→ ${escapeHTML(to?.title ?? e.target)}</th><td>${nf.format(n)}</td><td>${pct(s?.views ? n / s.views : 0)}</td><td class="barcell">${bar(s?.views ? n / s.views : 0)}</td></tr>`;
    })
    .join('');
  return `
    <h4>${escapeHTML(node.title ?? node.id)}</h4>
    <p class="sub">表示 ${nf.format(s?.views ?? 0)} 回 ／
      <span class="exit">離脱 ${nf.format(s?.exits ?? 0)} 回（${pct(exitRateOf(node))}）</span></p>
    ${rows ? `<table>${rows}</table>` : ''}
    ${outgoing ? `<hr /><table>${outgoing}</table>` : ''}
  `;
}

const escapeHTML = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function placeTip(node) {
  const ed = el.editor;
  const r = ed.worldRectToScreen(ed.graph.nodeRect(node));
  tip.hidden = false;
  // いったん表示してサイズを測り、画面外に出るなら左・上に寄せる
  const box = tip.getBoundingClientRect();
  const host = el.getBoundingClientRect();
  let x = r.x + r.w + 12;
  if (x + box.width > host.width - 8) x = Math.max(8, r.x - box.width - 12);
  let y = r.y;
  if (y + box.height > host.height - 8) y = Math.max(8, host.height - box.height - 8);
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

function updateHover(clientX, clientY) {
  const ed = el.editor;
  if (!ed) return;
  const w = ed.clientToWorld(clientX, clientY);
  const hit = ed.hitTest(w.x, w.y);
  const next = hit.type === 'item' || hit.type === 'node' || hit.type === 'port' ? { node: hit.node, item: hit.item ?? null } : null;
  const same = next && hovered && next.node.id === hovered.node.id && (next.item?.id ?? null) === (hovered.item?.id ?? null);
  if (same) return void placeTip(next.node);
  hovered = next;
  if (!next) {
    tip.hidden = true;
  } else {
    tip.innerHTML = tipHTML(next);
    placeTip(next.node);
  }
  ed.requestRender();
}

el.addEventListener('pointermove', (e) => {
  if (raf) cancelAnimationFrame(raf);
  const { clientX, clientY } = e;
  raf = requestAnimationFrame(() => {
    raf = 0;
    updateHover(clientX, clientY);
  });
});
el.addEventListener('pointerleave', () => {
  hovered = null;
  tip.hidden = true;
  el.editor?.requestRender();
});

/* ---------------- 起動 ---------------- */

function load() {
  el.editor.overlayRenderer = overlay;
  el.load(prepare(SCENARIO));
  el.editor.fitView(60);
  const total = SCENARIO.nodes.reduce((a, n) => a + viewsOf(n), 0);
  info.textContent = `${SCENARIO.nodes.length} ノード ／ 表示 ${nf.format(total)} 回ぶんのサンプル`;
}

if (el.editor) load();
else el.addEventListener('ready', load, { once: true });

for (const key of ['bars', 'heat', 'flow']) {
  document.getElementById(key).addEventListener('change', (e) => {
    show[key] = e.target.checked;
    // ヒートマップとコネクタ太さは style なので作り直す。バーは描画だけ
    if (key === 'bars') el.editor.requestRender();
    else {
      const vp = el.editor.viewport.snapshot();
      el.load(prepare(SCENARIO));
      el.editor.viewport.restore(vp);
      el.editor.requestRender();
    }
  });
}

// ホバーだけでなくクリックでも中身をコンソールに出しておく（実装の参考用）
el.addEventListener('node-click', (e) => console.log('node-click', e.detail.node.id, e.detail.node.data));

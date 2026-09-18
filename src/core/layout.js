/**
 * 階層レイアウト（Sugiyama 方式の簡略版）。
 * コネクタは常に「出力（右）→ 入力（左）」なので、左から右へ層を並べる。
 *
 * 手順:
 *  1. 連結成分ごとに分ける（孤立ノードは最後にまとめてグリッド配置）
 *  2. DFS で逆向きエッジを見つけてサイクルを断つ
 *  3. 最長経路で層を割り当てる（出力側が左）
 *  4. 層をまたぐコネクタにダミーノードを挿入し、途中の層で場所を確保する
 *     → コネクタが他のノードの上を横切らない
 *  5. バリセンタ法で層内の順序を決め、交差を減らす
 *  6. 隣接ノードの重心に寄せながら、重ならないように縦位置を決める
 *
 * @param {import('./graph.js').Graph} graph
 * @param {Iterable<string>} nodeIds レイアウト対象のノード ID
 * @param {object} [options]
 * @param {number} [options.layerGap=120]  層と層の間隔（コネクタが曲がるための余白）
 * @param {number} [options.nodeGap=40]    同じ層のノード間の縦の間隔
 * @param {number} [options.componentGap=80] 連結成分の間隔
 * @param {number} [options.dummyHeight=24] ダミーノード（通過するコネクタ）が確保する高さ
 * @param {number} [options.iterations=8]  順序付け・座標調整の反復回数
 * @param {{x:number,y:number}} [options.origin] 左上の基準位置。省略時は対象ノードの元の左上
 * @returns {Map<string, {x:number, y:number}>} ノード ID → 新しい位置
 */
export function layeredLayout(graph, nodeIds, options = {}) {
  const opt = { layerGap: 120, nodeGap: 40, componentGap: 80, dummyHeight: 24, iterations: 8, ...options };
  const ids = [...nodeIds].filter((id) => graph.nodes.has(id));
  const idSet = new Set(ids);
  const result = new Map();
  if (!ids.length) return result;

  // 元の左上を基準にする
  let originX = Infinity;
  let originY = Infinity;
  for (const id of ids) {
    const n = graph.nodes.get(id);
    if (n.x < originX) originX = n.x;
    if (n.y < originY) originY = n.y;
  }
  if (opt.origin) ({ x: originX, y: originY } = opt.origin);

  // 対象内で閉じているエッジ（source→target、重複はまとめる）
  const out = new Map(ids.map((id) => [id, new Set()]));
  const inn = new Map(ids.map((id) => [id, new Set()]));
  for (const id of ids) {
    for (const e of graph.edgesOf(id)) {
      if (e.source === id && idSet.has(e.target) && e.target !== id) {
        out.get(e.source).add(e.target);
        inn.get(e.target).add(e.source);
      }
    }
    // goto（ID 指定の遷移）もコネクタと同じ繋がりとして扱う（links: false で無効）
    if (opt.links === false) continue;
    const own = [id, ...graph.descendantIds(id)];
    for (const from of own) {
      for (const l of graph.gotoLinks(from)) {
        const target = graph.rootOf(l.to);
        if (!l.exists || !target || !idSet.has(target.id) || target.id === id) continue;
        out.get(id).add(target.id);
        inn.get(target.id).add(id);
      }
    }
  }

  // --- 連結成分 ---
  const seen = new Set();
  const components = [];
  const isolated = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    if (out.get(id).size === 0 && inn.get(id).size === 0) {
      seen.add(id);
      isolated.push(id);
      continue;
    }
    const comp = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const v = stack.pop();
      comp.push(v);
      for (const w of out.get(v)) if (!seen.has(w)) (seen.add(w), stack.push(w));
      for (const w of inn.get(v)) if (!seen.has(w)) (seen.add(w), stack.push(w));
    }
    components.push(comp);
  }
  // 大きい成分を上に
  components.sort((a, b) => b.length - a.length);

  let cursorY = originY;
  for (const comp of components) {
    const size = layoutComponent(graph, comp, out, inn, opt);
    for (const [id, p] of size.positions) result.set(id, { x: originX + p.x, y: cursorY + p.y });
    cursorY += size.height + opt.componentGap;
  }

  // --- 孤立ノード: 横幅を揃えたグリッドに並べる ---
  if (isolated.length) {
    const rects = isolated.map((id) => graph.nodeRect(graph.nodes.get(id)));
    const maxW = Math.max(...rects.map((r) => r.w));
    const totalW = Math.max(
      maxW,
      components.length ? Math.max(...components.map((c) => c.reduce((m, id) => Math.max(m, result.get(id).x - originX + graph.nodeWidth(graph.nodes.get(id))), 0))) : 0,
      Math.ceil(Math.sqrt(isolated.length)) * (maxW + opt.nodeGap),
    );
    const cols = Math.max(1, Math.floor((totalW + opt.nodeGap) / (maxW + opt.nodeGap)));
    let rowY = 0;
    let rowH = 0;
    isolated.forEach((id, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) {
        rowY += rowH + opt.nodeGap;
        rowH = 0;
      }
      result.set(id, { x: originX + col * (maxW + opt.nodeGap), y: cursorY + rowY });
      rowH = Math.max(rowH, rects[i].h);
    });
  }

  return result;
}

/** 1 つの連結成分をレイアウトし、左上 (0,0) 基準の位置と高さを返す */
function layoutComponent(graph, comp, out, inn, opt) {
  const compSet = new Set(comp);

  // --- サイクル除去（DFS の逆向きエッジを反転扱いにする） ---
  const state = new Map(); // 0 未訪問 / 1 訪問中 / 2 完了
  const fwd = new Map(comp.map((id) => [id, []])); // DAG 化した順方向エッジ
  const rev = new Map(comp.map((id) => [id, []]));
  const order = comp.slice().sort((a, b) => inn.get(a).size - inn.get(b).size); // 入力の少ないものから
  const visit = (start) => {
    const stack = [[start, [...out.get(start)].filter((w) => compSet.has(w)), 0]];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [v, ws] = top;
      if (top[2] >= ws.length) {
        state.set(v, 2);
        stack.pop();
        continue;
      }
      const w = ws[top[2]++];
      const st = state.get(w) ?? 0;
      if (st === 1) {
        // 逆向きエッジ → 向きを反転
        fwd.get(w).push(v);
        rev.get(v).push(w);
      } else {
        fwd.get(v).push(w);
        rev.get(w).push(v);
        if (st === 0) {
          state.set(w, 1);
          stack.push([w, [...out.get(w)].filter((x) => compSet.has(x)), 0]);
        }
      }
    }
  };
  for (const id of order) if (!state.get(id)) visit(id);

  // --- 層割り当て（最長経路。入力が無いノードが層 0） ---
  const layerOf = new Map();
  const indeg = new Map(comp.map((id) => [id, rev.get(id).length]));
  let queue = comp.filter((id) => indeg.get(id) === 0);
  for (const id of queue) layerOf.set(id, 0);
  while (queue.length) {
    const next = [];
    for (const v of queue) {
      for (const w of fwd.get(v)) {
        layerOf.set(w, Math.max(layerOf.get(w) ?? 0, layerOf.get(v) + 1));
        indeg.set(w, indeg.get(w) - 1);
        if (indeg.get(w) === 0) next.push(w);
      }
    }
    queue = next;
  }
  for (const id of comp) if (!layerOf.has(id)) layerOf.set(id, 0);

  // --- ダミーノードを含む層構造を作る ---
  /** @type {Array<Array<{id:string, real:boolean, h:number, w:number, up:any[], down:any[], y:number, order:number}>>} */
  const layers = [];
  const nodeOf = new Map();
  const mk = (id, real, layer) => {
    const r = real ? graph.nodeRect(graph.nodes.get(id)) : { w: 0, h: opt.dummyHeight };
    const v = { id, real, h: r.h, w: r.w, up: [], down: [], y: 0, order: 0, layer };
    while (layers.length <= layer) layers.push([]);
    layers[layer].push(v);
    if (real) nodeOf.set(id, v);
    return v;
  };
  for (const id of comp) mk(id, true, layerOf.get(id));
  let dummySeq = 0;
  for (const id of comp) {
    for (const w of fwd.get(id)) {
      let prev = nodeOf.get(id);
      const to = nodeOf.get(w);
      for (let l = layerOf.get(id) + 1; l < layerOf.get(w); l++) {
        const d = mk(`__dummy${dummySeq++}`, false, l);
        prev.down.push(d);
        d.up.push(prev);
        prev = d;
      }
      prev.down.push(to);
      to.up.push(prev);
    }
  }

  // --- 初期順序: 元の y 座標順（ユーザーの配置をできるだけ尊重） ---
  for (const layer of layers) {
    layer.sort((a, b) => {
      const ya = a.real ? graph.nodes.get(a.id).y : (a.up[0]?.y ?? 0);
      const yb = b.real ? graph.nodes.get(b.id).y : (b.up[0]?.y ?? 0);
      return ya - yb;
    });
    layer.forEach((v, i) => (v.order = i));
  }

  // --- バリセンタ法で順序を改善 ---
  const bary = (v, neighbors) => {
    if (!neighbors.length) return v.order;
    let s = 0;
    for (const n of neighbors) s += n.order;
    return s / neighbors.length;
  };
  for (let it = 0; it < opt.iterations; it++) {
    const down = it % 2 === 0;
    const idxs = down ? [...layers.keys()].slice(1) : [...layers.keys()].slice(0, -1).reverse();
    for (const li of idxs) {
      const layer = layers[li];
      const keys = new Map(layer.map((v) => [v, bary(v, down ? v.up : v.down)]));
      layer.sort((a, b) => keys.get(a) - keys.get(b) || a.order - b.order);
      layer.forEach((v, i) => (v.order = i));
    }
  }

  // --- 縦位置: まず積み上げ、次に隣接の重心へ寄せつつ重なりを解消 ---
  const stack = (layer, desired) => {
    // desired が与えられればその位置を尊重しつつ、下方向にずらして重なりを消す
    let y = -Infinity;
    for (const v of layer) {
      const want = desired ? desired.get(v) : 0;
      v.y = Math.max(want, y);
      y = v.y + v.h + opt.nodeGap;
    }
  };
  for (const layer of layers) stack(layer);
  const center = (v) => v.y + v.h / 2;
  for (let it = 0; it < opt.iterations; it++) {
    const down = it % 2 === 0;
    const idxs = down ? [...layers.keys()].slice(1) : [...layers.keys()].slice(0, -1).reverse();
    for (const li of idxs) {
      const layer = layers[li];
      const desired = new Map();
      for (const v of layer) {
        const ns = down ? v.up : v.down;
        if (!ns.length) {
          desired.set(v, v.y);
          continue;
        }
        let s = 0;
        for (const n of ns) s += center(n);
        desired.set(v, s / ns.length - v.h / 2);
      }
      // 上から順に、希望位置か直前の下端のどちらか低い方へ
      stack(layer, desired);
      // 全体が下に流れすぎないよう、希望位置との平均ずれで戻す
      let shift = 0;
      for (const v of layer) shift += v.y - desired.get(v);
      shift /= layer.length;
      for (const v of layer) v.y -= shift;
    }
  }

  // --- 横位置: 層ごとの最大幅 + 間隔 ---
  const layerX = [];
  let x = 0;
  for (const layer of layers) {
    layerX.push(x);
    const maxW = layer.reduce((m, v) => Math.max(m, v.w), 0);
    x += maxW + opt.layerGap;
  }

  // 左上を (0,0) に正規化
  let minY = Infinity;
  for (const layer of layers) for (const v of layer) if (v.real && v.y < minY) minY = v.y;
  const positions = new Map();
  let height = 0;
  for (let li = 0; li < layers.length; li++) {
    for (const v of layers[li]) {
      if (!v.real) continue;
      const py = v.y - minY;
      positions.set(v.id, { x: layerX[li], y: py });
      height = Math.max(height, py + v.h);
    }
  }
  return { positions, height };
}

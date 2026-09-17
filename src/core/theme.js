/**
 * 見た目のテーマ。`NodeEditor` の `theme` オプションで部分的に上書きできる。
 * ノード単位・コネクタ単位の上書きは node.style / edge.style で行う。
 */
export const defaultTheme = {
  background: '#f6f7f9',
  grid: { color: '#e0e3e8', size: 32, majorEvery: 4, majorColor: '#cfd4db' },
  font: '13px system-ui, -apple-system, "Segoe UI", sans-serif',
  titleFont: 'bold 13px system-ui, -apple-system, "Segoe UI", sans-serif',
  node: {
    fill: '#ffffff',
    stroke: '#c9ced6',
    strokeWidth: 1,
    radius: 8,
    headerFill: '#eef1f5',
    headerHeight: 30,
    titleColor: '#1f2933',
    textColor: '#3b4652',
    itemHeight: 26,
    itemSeparator: '#eef1f5',
    padding: 8,
    width: 200,
    /** 子ノードを親の左右からどれだけ内側に置くか */
    childIndent: 10,
    /** 子ノードどうしの縦の間隔 */
    childGap: 6,
    selectedStroke: '#3b82f6',
    selectedStrokeWidth: 2,
    hoverStroke: '#93c5fd',
    shadow: 'rgba(0,0,0,0.08)',
  },
  port: {
    radius: 5,
    fill: '#ffffff',
    stroke: '#64748b',
    strokeWidth: 1.5,
    hoverFill: '#3b82f6',
    connectedFill: '#64748b',
    fullFill: '#f59e0b',
  },
  edge: {
    stroke: '#7c8794',
    strokeWidth: 2,
    selectedStroke: '#3b82f6',
    selectedStrokeWidth: 3,
    hoverStroke: '#93c5fd',
    pendingStroke: '#3b82f6',
    /** 描画方法の既定: 'bezier'（曲線）| 'straight'（直線）| 'step'（直角の階段状）。コネクタ単位は edge.type */
    type: 'bezier',
    /** bezier の曲がり具合（横距離に対する制御点の比率） */
    curvature: 0.5,
    /** step のとき、ポートから水平に突き出す最小長さ */
    stepOffset: 24,
    /** ホバー／選択中のコネクタ中央に出る削除アイコン（画面ピクセル単位） */
    deleteIcon: {
      radius: 9,
      fill: '#ffffff',
      stroke: '#ef4444',
      color: '#ef4444',
      hoverFill: '#ef4444',
      hoverColor: '#ffffff',
    },
  },
  /**
   * 強調表示（focusMode）。選択ノードと繋がっていない要素を薄くする。
   *  - dimOpacity: 薄くする側の不透明度
   *  - edgeStroke / edgeWidth: 繋がっているコネクタを色や太さで強調する（null で通常描画のまま）
   */
  focus: {
    dimOpacity: 0.12,
    /** 簡易表示（LOD）中は線が細く消えやすいので少し濃くする */
    dimOpacityLod: 0.25,
    edgeStroke: null,
    edgeWidth: null,
  },
  selectionBox: {
    fill: 'rgba(59,130,246,0.08)',
    stroke: '#3b82f6',
  },
  minimap: {
    background: 'rgba(255,255,255,0.9)',
    border: '#c9ced6',
    node: '#94a3b8',
    selectedNode: '#3b82f6',
    viewportFill: 'rgba(59,130,246,0.12)',
    viewportStroke: '#3b82f6',
  },
  /** この拡大率以下（30% 以下）になったら、文字や項目を省いた簡易描画にする */
  lodZoom: 0.3,
};

/** 深いマージ（配列は上書き） */
export function mergeTheme(base, patch) {
  if (!patch) return structuredClone(base);
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(patch)) {
    const b = base?.[key];
    const p = patch[key];
    out[key] =
      p && typeof p === 'object' && !Array.isArray(p) && b && typeof b === 'object'
        ? mergeTheme(b, p)
        : p;
  }
  return out;
}

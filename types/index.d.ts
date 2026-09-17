/**
 * canvas-flow — コアと Web Component をまとめたエントリの型定義。
 * これを読み込むと `<canvas-flow-editor>` が登録される。
 *
 *   import '@hidemikimura/canvas-flow';
 */
export * from './core.js';
export { CanvasFlowEditor, defaultContextMenuItems } from './lit.js';
export type { CanvasFlowEditorEventMap, ContextMenuItem, ContextMenuContext } from './lit.js';

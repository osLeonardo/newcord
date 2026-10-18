/**
 * The app's own title bar (D106): Windows' title bar is hidden, the window draws its own bar this
 * many pixels high (the renderer's `TitleBar`, `h-8`), and Windows draws its minimize, maximize and
 * close buttons over the bar's right end, in the app's colors (zinc-900 and zinc-400).
 */
export const TITLE_BAR_OVERLAY = {
  color: "#18181b",
  symbolColor: "#a1a1aa",
  height: 32,
} as const;

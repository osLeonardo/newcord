import { APP_NAME } from "@newcord/shared";
import logo from "../assets/logo.png";

/**
 * The app's own title bar (D106): dragging it moves the window, double-clicking it maximizes, and
 * Windows draws its buttons over its right end. Its height matches the main process's
 * `TITLE_BAR_OVERLAY` (32 px).
 */
export function TitleBar(): React.JSX.Element {
  return (
    <header className="flex h-8 shrink-0 items-center gap-2 bg-zinc-900 px-3 select-none [-webkit-app-region:drag]">
      <img src={logo} alt="" className="h-4 w-4" />
      <span className="text-xs font-medium text-zinc-400">{APP_NAME}</span>
    </header>
  );
}

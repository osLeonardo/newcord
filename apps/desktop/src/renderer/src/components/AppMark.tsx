import { APP_NAME } from "@newcord/shared";
import logo from "../assets/logo.png";

/** The app's logo and name, at the top of the account screens and of the sidebar. */
export function AppMark(): React.JSX.Element {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-300">
      <img src={logo} alt="" className="h-6 w-6" />
      {APP_NAME}
    </p>
  );
}

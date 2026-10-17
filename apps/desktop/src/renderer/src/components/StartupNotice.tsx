import { useEffect, useState } from "react";
import { APP_NAME } from "@newcord/shared";
import type { DesktopApi } from "../../../preload/desktop-api";
import { screenStyles } from "./screen-styles";

interface StartupNoticeProps {
  readonly desktopApi: DesktopApi;
}

/** The first screen's note that the app starts with Windows, and where to turn that off (D46). */
export function StartupNotice(
  props: StartupNoticeProps,
): React.JSX.Element | null {
  const { desktopApi } = props;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let mounted = true;
    desktopApi.readStartupNotice().then(
      (show) => {
        if (mounted) setShown(show);
      },
      () => undefined,
    );
    return (): void => {
      mounted = false;
    };
  }, [desktopApi]);

  if (!shown) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-0 top-0 z-10 flex items-center justify-between gap-4 bg-zinc-800 px-6 py-2 text-sm text-zinc-100"
    >
      {APP_NAME} starts with Windows, hidden in the tray, so you get messages
      without opening it. You can turn this off in Settings, under App.
      <button
        type="button"
        className={screenStyles.smallSecondaryButton}
        onClick={() => {
          setShown(false);
          desktopApi.dismissStartupNotice().catch(() => undefined);
        }}
      >
        Got it
      </button>
    </p>
  );
}

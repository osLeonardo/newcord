import { useEffect, useState } from "react";
import { APP_NAME } from "@newcord/shared";
import type { DesktopApi } from "../../../preload/desktop-api";
import { screenStyles } from "./screen-styles";

interface UpdateOfferProps {
  readonly desktopApi: DesktopApi;
}

/** The offer to restart into a downloaded update, shown once a Call ends; never during one (12-m5-build step 7). */
export function UpdateOffer(props: UpdateOfferProps): React.JSX.Element | null {
  const { desktopApi } = props;
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    let mounted = true;
    desktopApi.readUpdateOffer().then(
      (offer) => {
        if (mounted) setOffered(offer);
      },
      () => undefined,
    );
    const unsubscribe = desktopApi.onUpdateOfferChanged((offer) => {
      setOffered(offer);
    });
    return (): void => {
      mounted = false;
      unsubscribe();
    };
  }, [desktopApi]);

  if (!offered) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 bg-zinc-800 px-6 py-2 text-sm text-zinc-100"
    >
      An update to {APP_NAME} is ready. Restarting installs it and opens the app
      again.
      <button
        type="button"
        className={screenStyles.smallSecondaryButton}
        onClick={() => {
          desktopApi.restartToUpdate().catch(() => undefined);
        }}
      >
        Restart to update
      </button>
    </p>
  );
}

import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../preload/desktop-api";

/**
 * Whether the server has accepted this Device's connection, following each change; undefined
 * until the first answer.
 * @example const connected = useConnection(desktopApi);
 */
export function useConnection(desktopApi: DesktopApi): boolean | undefined {
  const [connected, setConnected] = useState<boolean>();
  useEffect(() => {
    let mounted = true;
    const unsubscribe = desktopApi.onConnectionChanged(setConnected);
    desktopApi.readConnection().then(
      (ready) => {
        if (mounted) setConnected(ready);
      },
      () => undefined,
    );
    return (): void => {
      mounted = false;
      unsubscribe();
    };
  }, [desktopApi]);
  return connected;
}

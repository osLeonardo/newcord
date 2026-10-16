import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import { screenStyles } from "../screen-styles";

interface OnlineNowProps {
  readonly desktopApi: DesktopApi;
}

/** The other Accounts online now, among those sharing a Group, kept up to date by the main process. */
export function OnlineNow({ desktopApi }: OnlineNowProps): React.JSX.Element {
  const [usernames, setUsernames] = useState<readonly string[]>([]);

  useEffect(() => {
    let showsThisList = true;
    const unsubscribe = desktopApi.onOnlineAccountsChanged(setUsernames);
    desktopApi.readOnlineAccounts().then(
      (online) => {
        if (showsThisList) setUsernames(online);
      },
      () => undefined,
    );
    return (): void => {
      showsThisList = false;
      unsubscribe();
    };
  }, [desktopApi]);

  return (
    <section aria-labelledby="online-now" className="flex flex-col gap-2 p-4">
      <h2 id="online-now" className={screenStyles.sectionHeading}>
        Online now
      </h2>
      {usernames.length === 0 ? (
        <p className={screenStyles.hint}>Nobody else is online.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {usernames.map((username) => (
            <li key={username} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full bg-emerald-500"
              />
              {username}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../account/account-messages";
import { viewForSessionState, type AppView } from "../app-view";
import { ScreenCard } from "../components/ScreenCard";
import { screenStyles } from "../components/screen-styles";

interface HomeScreenProps {
  readonly desktopApi: DesktopApi;
  readonly username: string;
  readonly show: (view: AppView) => void;
}

interface OnlineNowProps {
  readonly desktopApi: DesktopApi;
}

/** The logged-in home: who else is online now, and logging out. */
export function HomeScreen(props: HomeScreenProps): React.JSX.Element {
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState<string>();

  async function logOut(): Promise<void> {
    setLoggingOut(true);
    try {
      props.show(viewForSessionState(await props.desktopApi.logOut()));
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
      setLoggingOut(false);
    }
  }

  return (
    <ScreenCard title={`Logged in as ${props.username}`}>
      <OnlineNow desktopApi={props.desktopApi} />
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      <button
        type="button"
        className={screenStyles.secondaryButton}
        disabled={loggingOut}
        onClick={() => {
          props.show({ screen: "password-change", username: props.username });
        }}
      >
        Change password
      </button>
      <button
        type="button"
        className={screenStyles.primaryButton}
        disabled={loggingOut}
        onClick={() => void logOut()}
      >
        Log out
      </button>
    </ScreenCard>
  );
}

/** The other Accounts online now, kept up to date by the main process. */
function OnlineNow({ desktopApi }: OnlineNowProps): React.JSX.Element {
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
    <section aria-labelledby="online-now" className="flex flex-col gap-2">
      <h2 id="online-now" className="text-sm font-medium text-zinc-300">
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

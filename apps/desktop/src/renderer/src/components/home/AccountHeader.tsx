import { useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import { viewForSessionState, type AppView } from "../../app-view";
import { screenStyles } from "../screen-styles";

interface AccountHeaderProps {
  readonly desktopApi: DesktopApi;
  readonly username: string;
  readonly show: (view: AppView) => void;
  /** Settings open next to the sidebar, so a running Call keeps going. */
  readonly openSettings: () => void;
}

/** The sidebar's top: the app, who is logged in, and the account actions. */
export function AccountHeader(props: AccountHeaderProps): React.JSX.Element {
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
    <header className="flex flex-col gap-2 border-b border-zinc-800 p-4">
      <p className="truncate font-medium">{props.username}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          className={screenStyles.linkButton}
          onClick={props.openSettings}
        >
          Settings
        </button>
        <button
          type="button"
          className={screenStyles.linkButton}
          onClick={() => {
            props.show({ screen: "password-change", username: props.username });
          }}
        >
          Change password
        </button>
        <button
          type="button"
          className={screenStyles.linkButton}
          disabled={loggingOut}
          onClick={() => void logOut()}
        >
          Log out
        </button>
      </div>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
    </header>
  );
}

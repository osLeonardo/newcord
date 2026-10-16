import { useState } from "react";
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

/** The logged-in home; Step 03 adds the "online now" list here. */
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
      <p className={screenStyles.hint}>
        This computer is logged in to your Account.
      </p>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
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

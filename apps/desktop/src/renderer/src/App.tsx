import { useEffect, useState } from "react";
import type { DesktopApi } from "../../preload/desktop-api";
import { viewForSessionState, type AppView } from "./app-view";
import { AccountSwitchScreen } from "./screens/AccountSwitchScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LogInScreen } from "./screens/LogInScreen";
import { RecoveryCodeScreen } from "./screens/RecoveryCodeScreen";
import { SignUpScreen } from "./screens/SignUpScreen";

interface AppProps {
  readonly desktopApi: DesktopApi;
}

interface CurrentScreenProps extends AppProps {
  readonly view: AppView;
  readonly show: (view: AppView) => void;
}

/** The window's content: one screen at a time, starting from the stored session state. */
function App({ desktopApi }: AppProps): React.JSX.Element {
  const [view, setView] = useState<AppView>({ screen: "starting" });

  useEffect(() => {
    let showsThisWindow = true;
    desktopApi.readSessionState().then(
      (session) => {
        if (showsThisWindow) setView(viewForSessionState(session));
      },
      () => {
        if (showsThisWindow) setView({ screen: "start-failed" });
      },
    );
    return (): void => {
      showsThisWindow = false;
    };
  }, [desktopApi]);

  useEffect(
    () =>
      desktopApi.onSessionChanged((session) => {
        setView(viewForSessionState(session));
      }),
    [desktopApi],
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <CurrentScreen view={view} desktopApi={desktopApi} show={setView} />
    </main>
  );
}

function CurrentScreen({
  view,
  desktopApi,
  show,
}: CurrentScreenProps): React.JSX.Element {
  switch (view.screen) {
    case "starting":
      return <p className="text-sm text-zinc-400">Starting…</p>;
    case "start-failed":
      return (
        <p role="alert" className="text-sm text-red-400">
          The app could not read its local data. Restart it.
        </p>
      );
    case "sign-up":
      return (
        <SignUpScreen
          desktopApi={desktopApi}
          storedUsername={view.storedUsername}
          show={show}
        />
      );
    case "log-in":
      return (
        <LogInScreen
          desktopApi={desktopApi}
          storedUsername={view.storedUsername}
          show={show}
        />
      );
    case "recovery-code":
      return (
        <RecoveryCodeScreen
          recoveryCode={view.recoveryCode}
          onContinue={() => {
            show(viewForSessionState(view.session));
          }}
        />
      );
    case "account-switch":
      return (
        <AccountSwitchScreen
          desktopApi={desktopApi}
          storedUsername={view.storedUsername}
          request={view.request}
          show={show}
        />
      );
    case "home":
      return (
        <HomeScreen
          desktopApi={desktopApi}
          username={view.username}
          show={show}
        />
      );
  }
}

export default App;

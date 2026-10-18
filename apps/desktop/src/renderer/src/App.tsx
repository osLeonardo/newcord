import { useEffect, useState } from "react";
import type { DesktopApi } from "../../preload/desktop-api";
import { useConnection } from "./account/use-connection";
import { viewForSessionState, type AppView } from "./app-view";
import { TitleBar } from "./components/TitleBar";
import { UpdateOffer } from "./components/UpdateOffer";
import { AccountSwitchScreen } from "./screens/AccountSwitchScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LogInScreen } from "./screens/LogInScreen";
import { PasswordChangeScreen } from "./screens/PasswordChangeScreen";
import { PasswordRecoveryScreen } from "./screens/PasswordRecoveryScreen";
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
  const connected = useConnection(desktopApi);

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

  // The window is the title bar plus the screen below it, which never scrolls past the window.
  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <TitleBar />
      <UpdateOffer desktopApi={desktopApi} />
      {view.screen === "home" && connected === false && (
        <p
          role="status"
          className="shrink-0 bg-amber-900/60 px-4 py-1 text-center text-xs text-amber-100"
        >
          Connecting to the server… Messages and Calls resume once it answers.
        </p>
      )}
      {view.screen === "home" ? (
        <div className="min-h-0 flex-1">
          <CurrentScreen view={view} desktopApi={desktopApi} show={setView} />
        </div>
      ) : (
        // m-auto centres the card, and still lets a tall one scroll from its top.
        <div className="flex min-h-0 flex-1 overflow-y-auto p-6">
          <div className="m-auto flex w-full justify-center">
            <CurrentScreen view={view} desktopApi={desktopApi} show={setView} />
          </div>
        </div>
      )}
    </div>
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
            show(view.next);
          }}
        />
      );
    case "password-recovery":
      return (
        <PasswordRecoveryScreen
          desktopApi={desktopApi}
          storedUsername={view.storedUsername}
          show={show}
        />
      );
    case "password-change":
      return (
        <PasswordChangeScreen
          desktopApi={desktopApi}
          username={view.username}
          show={show}
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

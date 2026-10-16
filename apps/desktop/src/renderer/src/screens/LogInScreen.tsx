import type { DesktopApi } from "../../../preload/desktop-api";
import { enterAccount } from "../account/account-entry";
import type { CredentialsSender } from "../account/credentials-submission";
import type { AppView } from "../app-view";
import { CredentialsForm } from "../components/CredentialsForm";
import { ScreenCard } from "../components/ScreenCard";
import { SwitchScreenLink } from "../components/SwitchScreenLink";

interface LogInScreenProps {
  readonly desktopApi: DesktopApi;
  readonly storedUsername: string | null;
  readonly show: (view: AppView) => void;
}

/** Logs this installation in; the username of its Account is filled in once one is stored. */
export function LogInScreen(props: LogInScreenProps): React.JSX.Element {
  const logIn: CredentialsSender = (credentials) =>
    enterAccount(
      props.desktopApi,
      { kind: "log-in", credentials },
      { switchAccount: false },
      props,
    );

  return (
    <ScreenCard title="Log in">
      <CredentialsForm
        submitLabel="Log in"
        passwordAutoComplete="current-password"
        initialUsername={props.storedUsername ?? ""}
        send={logIn}
      />
      <SwitchScreenLink
        prompt="Forgot your password?"
        label="Use your Recovery code"
        onClick={() => {
          props.show({
            screen: "password-recovery",
            storedUsername: props.storedUsername,
          });
        }}
      />
      <SwitchScreenLink
        prompt="New here?"
        label="Create an Account"
        onClick={() => {
          props.show({
            screen: "sign-up",
            storedUsername: props.storedUsername,
          });
        }}
      />
    </ScreenCard>
  );
}

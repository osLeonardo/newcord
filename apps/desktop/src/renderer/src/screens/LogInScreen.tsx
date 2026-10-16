import type { DesktopApi } from "../../../preload/desktop-api";
import { accountRefusalMessage } from "../account/account-messages";
import type { CredentialsSender } from "../account/credentials-submission";
import { viewForSessionState, type AppView } from "../app-view";
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
  const logIn: CredentialsSender = async (credentials) => {
    const result = await props.desktopApi.logIn(credentials);
    if (result.outcome === "refused") {
      return accountRefusalMessage(result.refusal, props.storedUsername);
    }
    props.show(viewForSessionState(result.session));
    return undefined;
  };

  return (
    <ScreenCard title="Log in">
      <CredentialsForm
        submitLabel="Log in"
        passwordAutoComplete="current-password"
        initialUsername={props.storedUsername ?? ""}
        send={logIn}
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

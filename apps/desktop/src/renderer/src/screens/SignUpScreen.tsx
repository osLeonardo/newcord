import type { DesktopApi } from "../../../preload/desktop-api";
import { enterAccount } from "../account/account-entry";
import type { CredentialsSender } from "../account/credentials-submission";
import type { AppView } from "../app-view";
import { CredentialsForm } from "../components/CredentialsForm";
import { ScreenCard } from "../components/ScreenCard";
import { SwitchScreenLink } from "../components/SwitchScreenLink";

interface SignUpScreenProps {
  readonly desktopApi: DesktopApi;
  readonly storedUsername: string | null;
  readonly show: (view: AppView) => void;
}

/** Creates an Account, then shows its Recovery code once; another Account stored here first shows the switch warning. */
export function SignUpScreen(props: SignUpScreenProps): React.JSX.Element {
  const signUp: CredentialsSender = (credentials) =>
    enterAccount(
      props.desktopApi,
      { kind: "sign-up", credentials },
      { switchAccount: false },
      props,
    );

  return (
    <ScreenCard title="Create your Account">
      <CredentialsForm
        submitLabel="Sign up"
        passwordAutoComplete="new-password"
        initialUsername=""
        send={signUp}
      />
      <SwitchScreenLink
        prompt="Already have an Account?"
        label="Log in"
        onClick={() => {
          props.show({
            screen: "log-in",
            storedUsername: props.storedUsername,
          });
        }}
      />
    </ScreenCard>
  );
}

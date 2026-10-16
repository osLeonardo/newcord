import type { DesktopApi } from "../../../preload/desktop-api";
import { accountRefusalMessage } from "../account/account-messages";
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

/** Creates an Account, then shows its Recovery code once. */
export function SignUpScreen(props: SignUpScreenProps): React.JSX.Element {
  const signUp: CredentialsSender = async (credentials) => {
    const result = await props.desktopApi.signUp(credentials);
    if (result.outcome === "refused") {
      return accountRefusalMessage(result.refusal, props.storedUsername);
    }
    props.show({
      screen: "recovery-code",
      recoveryCode: result.recoveryCode,
      session: result.session,
    });
    return undefined;
  };

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

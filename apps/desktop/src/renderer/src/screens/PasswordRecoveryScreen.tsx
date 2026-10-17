import { useState, type FormEvent } from "react";
import type { DesktopApi } from "../../../preload/desktop-api";
import { submitPasswordRecovery } from "../account/password-submission";
import type { AppView } from "../app-view";
import { ScreenCard } from "../components/ScreenCard";
import { screenStyles } from "../components/screen-styles";
import { TextField } from "../components/TextField";

interface PasswordRecoveryScreenProps {
  readonly desktopApi: DesktopApi;
  readonly storedUsername: string | null;
  readonly show: (view: AppView) => void;
}

/** Sets a new password with the Recovery code, then shows the new code once (D55). */
export function PasswordRecoveryScreen(
  props: PasswordRecoveryScreenProps,
): React.JSX.Element {
  const [username, setUsername] = useState(props.storedUsername ?? "");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSending(true);
    setMessage(
      await submitPasswordRecovery(
        props.desktopApi,
        { username, recoveryCode, newPassword, repeatedPassword },
        props.show,
      ),
    );
    setSending(false);
  }

  return (
    <ScreenCard title="Recover your Account">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <TextField
          label="Username"
          type="text"
          value={username}
          autoComplete="username"
          onChange={setUsername}
        />
        <TextField
          label="Recovery code"
          type="text"
          value={recoveryCode}
          autoComplete="off"
          onChange={setRecoveryCode}
        />
        <TextField
          label="New password"
          type="password"
          value={newPassword}
          autoComplete="new-password"
          onChange={setNewPassword}
        />
        <TextField
          label="Type the new password again"
          type="password"
          value={repeatedPassword}
          autoComplete="new-password"
          onChange={setRepeatedPassword}
        />
        {message !== undefined && (
          <p role="alert" className={screenStyles.errorMessage}>
            {message}
          </p>
        )}
        <button
          type="submit"
          className={screenStyles.primaryButton}
          disabled={sending}
        >
          Set new password
        </button>
        <button
          type="button"
          className={screenStyles.secondaryButton}
          disabled={sending}
          onClick={() => {
            props.show({
              screen: "log-in",
              storedUsername: props.storedUsername,
            });
          }}
        >
          Back to login
        </button>
      </form>
    </ScreenCard>
  );
}

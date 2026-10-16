import { useState, type FormEvent } from "react";
import type { DesktopApi } from "../../../preload/desktop-api";
import { submitPasswordChange } from "../account/password-submission";
import type { AppView } from "../app-view";
import { ScreenCard } from "../components/ScreenCard";
import { screenStyles } from "../components/screen-styles";
import { TextField } from "../components/TextField";

interface PasswordChangeScreenProps {
  readonly desktopApi: DesktopApi;
  readonly username: string;
  readonly show: (view: AppView) => void;
}

/** Sets a new password from this logged-in Device, typed twice and without the old one (D55). */
export function PasswordChangeScreen(
  props: PasswordChangeScreenProps,
): React.JSX.Element {
  const [newPassword, setNewPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [sending, setSending] = useState(false);
  const [changed, setChanged] = useState(false);
  const goHome = (): void => {
    props.show({ screen: "home", username: props.username });
  };

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSending(true);
    const submission = await submitPasswordChange(props.desktopApi, {
      newPassword,
      repeatedPassword,
    });
    setSending(false);
    if (submission.changed) setChanged(true);
    else setMessage(submission.message);
  }

  if (changed) {
    return (
      <ScreenCard title="Password changed">
        <p className={screenStyles.hint}>
          Use your new password from now on. Your other Devices were logged out
          and need it to log in again.
        </p>
        <button
          type="button"
          className={screenStyles.primaryButton}
          onClick={goHome}
        >
          Done
        </button>
      </ScreenCard>
    );
  }

  return (
    <ScreenCard title="Change your password">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
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
          Change password
        </button>
        <button
          type="button"
          className={screenStyles.secondaryButton}
          disabled={sending}
          onClick={goHome}
        >
          Cancel
        </button>
      </form>
    </ScreenCard>
  );
}

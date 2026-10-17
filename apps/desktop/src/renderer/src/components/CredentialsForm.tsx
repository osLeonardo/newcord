import { useState, type FormEvent } from "react";
import {
  submitCredentials,
  type CredentialsSender,
} from "../account/credentials-submission";
import { screenStyles } from "./screen-styles";
import { TextField } from "./TextField";

interface CredentialsFormProps {
  readonly submitLabel: string;
  readonly passwordAutoComplete: "new-password" | "current-password";
  readonly initialUsername: string;
  readonly send: CredentialsSender;
}

/** The username and password form of the sign-up and login screens; it shows refusals as plain text. */
export function CredentialsForm(
  props: CredentialsFormProps,
): React.JSX.Element {
  const [username, setUsername] = useState(props.initialUsername);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSending(true);
    setMessage(await submitCredentials({ username, password }, props.send));
    setSending(false);
  }

  return (
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
        label="Password"
        type="password"
        value={password}
        autoComplete={props.passwordAutoComplete}
        onChange={setPassword}
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
        {props.submitLabel}
      </button>
    </form>
  );
}

import { useState } from "react";
import type { DesktopApi } from "../../../preload/desktop-api";
import { enterAccount } from "../account/account-entry";
import { UNEXPECTED_FAILURE_MESSAGE } from "../account/account-messages";
import type { AccountRequest, AppView } from "../app-view";
import { ScreenCard } from "../components/ScreenCard";
import { screenStyles } from "../components/screen-styles";

interface AccountSwitchScreenProps {
  readonly desktopApi: DesktopApi;
  readonly storedUsername: string;
  readonly request: AccountRequest;
  readonly show: (view: AppView) => void;
}

/** The warning before this installation leaves its Account for another one (D60). */
export function AccountSwitchScreen(
  props: AccountSwitchScreenProps,
): React.JSX.Element {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string>();
  const newUsername = props.request.credentials.username;

  async function confirm(): Promise<void> {
    setSending(true);
    try {
      setMessage(
        await enterAccount(
          props.desktopApi,
          props.request,
          { switchAccount: true },
          props,
        ),
      );
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
    setSending(false);
  }

  return (
    <ScreenCard title="Switch Accounts?">
      <p className="text-sm text-zinc-300">
        This app is set up for the Account &ldquo;{props.storedUsername}
        &rdquo;. Continuing as &ldquo;{newUsername}&rdquo; erases this
        app&apos;s data on this computer and creates a new identity key, so this
        computer becomes a new Device of &ldquo;{newUsername}&rdquo;.
      </p>
      <p className={screenStyles.hint}>
        The Account &ldquo;{props.storedUsername}&rdquo; itself is kept: you can
        log in to it again later, as a new Device.
      </p>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      <button
        type="button"
        className={screenStyles.dangerButton}
        disabled={sending}
        onClick={() => void confirm()}
      >
        Erase and continue
      </button>
      <button
        type="button"
        className={screenStyles.secondaryButton}
        disabled={sending}
        onClick={() => {
          props.show({
            screen: props.request.kind,
            storedUsername: props.storedUsername,
          });
        }}
      >
        Cancel
      </button>
    </ScreenCard>
  );
}

import { useId, useState } from "react";
import { recoveryCodeGroups } from "../app-view";
import { ScreenCard } from "../components/ScreenCard";
import { screenStyles } from "../components/screen-styles";

interface RecoveryCodeScreenProps {
  readonly recoveryCode: string;
  readonly onContinue: () => void;
}

/** Shows the Recovery code once, in groups of four; Continue waits until the person confirms they saved it. */
export function RecoveryCodeScreen(
  props: RecoveryCodeScreenProps,
): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  const confirmationId = useId();

  return (
    <ScreenCard title="Save your Recovery code">
      <p className={screenStyles.hint}>
        It is the only way back into your Account if you forget your password.
        It is shown this once: write it down or keep it in a password manager.
      </p>
      <ol
        aria-label="Recovery code"
        className="grid grid-cols-3 gap-2 rounded-md bg-zinc-950 p-4 text-center font-mono text-lg tracking-widest select-all"
      >
        {recoveryCodeGroups(props.recoveryCode).map((group, position) => (
          <li key={position}>{group}</li>
        ))}
      </ol>
      <div className="flex items-center gap-2 text-sm">
        <input
          id={confirmationId}
          type="checkbox"
          checked={saved}
          className="size-4 accent-indigo-500"
          onChange={(event) => {
            setSaved(event.target.checked);
          }}
        />
        <label htmlFor={confirmationId}>I have saved this code</label>
      </div>
      <button
        type="button"
        className={screenStyles.primaryButton}
        disabled={!saved}
        onClick={props.onContinue}
      >
        Continue
      </button>
    </ScreenCard>
  );
}

import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { SafetyNumberResult } from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import { groupRefusalMessage } from "../../groups/group-text";
import { safetyNumberBlocks } from "../../groups/safety-text";
import { screenStyles } from "../screen-styles";

interface SafetyNumberPanelProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
  readonly username: string;
  readonly onClose: () => void;
  /** Told after the person was marked verified, so the member list shows it. */
  readonly onVerified: () => void;
}

/** The Safety number with a Member as 12 blocks of 5 digits, to read aloud or compare in person (D45). */
export function SafetyNumberPanel(
  props: SafetyNumberPanelProps,
): React.JSX.Element {
  const { desktopApi, groupId, username } = props;
  const [result, setResult] = useState<SafetyNumberResult>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let showsThisPerson = true;
    desktopApi.readSafetyNumber(groupId, username).then(
      (read) => {
        if (showsThisPerson) setResult(read);
      },
      () => {
        if (showsThisPerson) setMessage(UNEXPECTED_FAILURE_MESSAGE);
      },
    );
    return (): void => {
      showsThisPerson = false;
    };
  }, [desktopApi, groupId, username]);

  async function verify(safetyNumber: string): Promise<void> {
    try {
      const marked = await desktopApi.markVerified(
        groupId,
        username,
        safetyNumber,
      );
      if (marked.outcome === "done") {
        setResult({ outcome: "found", safetyNumber, verified: true });
        setMessage(undefined);
        props.onVerified();
      } else {
        setMessage(groupRefusalMessage(marked.refusal));
        setResult(await desktopApi.readSafetyNumber(groupId, username));
      }
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
  }

  return (
    <section
      aria-label={`Safety number with ${username}`}
      className="flex flex-col gap-2 rounded border border-zinc-700 p-3"
    >
      <h3 className={screenStyles.sectionHeading}>
        Safety number with {username}
      </h3>
      {result?.outcome === "found" && (
        <>
          <p className="text-xs text-zinc-400">
            Read these digits to each other on a Call or compare them in person.
            If they match, nobody is impersonating either of you.
          </p>
          <ol className="grid grid-cols-4 gap-x-3 gap-y-1 font-mono text-base tracking-wider">
            {safetyNumberBlocks(result.safetyNumber).map((block, index) => (
              <li key={index}>{block}</li>
            ))}
          </ol>
          {result.verified ? (
            <p className="text-sm text-emerald-400">
              You marked {username} as verified.
            </p>
          ) : (
            <button
              type="button"
              className={screenStyles.smallPrimaryButton}
              onClick={() => void verify(result.safetyNumber)}
            >
              Mark as verified
            </button>
          )}
        </>
      )}
      {result?.outcome === "refused" && (
        <p role="alert" className={screenStyles.errorMessage}>
          {groupRefusalMessage(result.refusal)}
        </p>
      )}
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      <button
        type="button"
        className={screenStyles.smallSecondaryButton}
        onClick={props.onClose}
      >
        Close
      </button>
    </section>
  );
}

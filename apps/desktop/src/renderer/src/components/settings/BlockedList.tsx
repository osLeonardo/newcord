import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import { groupRefusalMessage } from "../../groups/group-text";
import { screenStyles } from "../screen-styles";

interface BlockedListProps {
  readonly desktopApi: DesktopApi;
}

/** Everyone this Account blocks, each with Unblock, including people no Group is shared with (D88). */
export function BlockedList(props: BlockedListProps): React.JSX.Element {
  const { desktopApi } = props;
  const [blocked, setBlocked] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let mounted = true;
    const refresh = (): void => {
      desktopApi.listBlocked().then(
        (usernames) => {
          if (mounted) setBlocked(usernames);
        },
        () => undefined,
      );
    };
    const unsubscribe = desktopApi.onBlocksChanged(refresh);
    refresh();
    return (): void => {
      mounted = false;
      unsubscribe();
    };
  }, [desktopApi]);

  async function unblock(username: string): Promise<void> {
    try {
      const result = await desktopApi.unblockAccount(username);
      setMessage(
        result.outcome === "done"
          ? undefined
          : groupRefusalMessage(result.refusal),
      );
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
  }

  return (
    <section aria-label="Blocked people" className="flex flex-col gap-1">
      <span className="text-zinc-300">Blocked people</span>
      {blocked.length === 0 ? (
        <span className={screenStyles.hint}>You block nobody.</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {blocked.map((username) => (
            <li key={username} className="flex items-center gap-2">
              <span>{username}</span>
              <button
                type="button"
                className={screenStyles.smallSecondaryButton}
                onClick={() => void unblock(username)}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
    </section>
  );
}

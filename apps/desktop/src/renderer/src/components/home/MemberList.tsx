import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { GroupMemberSummary } from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import {
  groupRefusalMessage,
  memberDevicesLabel,
} from "../../groups/group-text";
import { screenStyles } from "../screen-styles";
import { SafetyNumberPanel } from "./SafetyNumberPanel";

interface MemberListProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
}

/**
 * The Group's people with their Device counts; removing someone removes all their Devices, and
 * blocking someone hides their messages without removing them (D57).
 */
export function MemberList(props: MemberListProps): React.JSX.Element {
  const { desktopApi, groupId } = props;
  const [members, setMembers] = useState<readonly GroupMemberSummary[]>([]);
  const blocked = useBlockedUsernames(desktopApi);
  const [confirming, setConfirming] = useState<string>();
  const [comparing, setComparing] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let showsThisList = true;
    const refresh = (): void => {
      desktopApi.listMembers(groupId).then(
        (listed) => {
          if (showsThisList) setMembers(listed);
        },
        () => undefined,
      );
    };
    // Every applied commit signals a Groups change, so the list follows membership.
    const unsubscribe = desktopApi.onGroupsChanged(refresh);
    refresh();
    return (): void => {
      showsThisList = false;
      unsubscribe();
    };
  }, [desktopApi, groupId]);

  async function refreshMembers(): Promise<void> {
    try {
      setMembers(await desktopApi.listMembers(groupId));
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
  }

  async function remove(username: string): Promise<void> {
    setConfirming(undefined);
    try {
      const result = await desktopApi.removeMember(groupId, username);
      setMessage(
        result.outcome === "done"
          ? undefined
          : groupRefusalMessage(result.refusal),
      );
      setMembers(await desktopApi.listMembers(groupId));
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
  }

  async function toggleBlock(username: string): Promise<void> {
    try {
      const result = blocked.has(username)
        ? await desktopApi.unblockAccount(username)
        : await desktopApi.blockAccount(username);
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
    <section aria-label="Members" className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-sm">
        {members.map((member) => (
          <li
            key={member.username}
            className="flex items-center justify-between gap-2"
          >
            <span>
              {member.username}
              {member.self && <span className="text-zinc-500"> (you)</span>}
              {member.verified && (
                <span className="text-emerald-400"> ✓ verified</span>
              )}
              {blocked.has(member.username) && (
                <span className="text-zinc-500"> (blocked)</span>
              )}
              <span className="text-zinc-500">
                {" "}
                · {memberDevicesLabel(member)}
              </span>
            </span>
            {!member.self && (
              <span className="flex gap-1">
                <button
                  type="button"
                  className={screenStyles.smallSecondaryButton}
                  onClick={() => {
                    setComparing(member.username);
                  }}
                >
                  Safety number
                </button>
                <button
                  type="button"
                  className={screenStyles.smallSecondaryButton}
                  onClick={() => void toggleBlock(member.username)}
                >
                  {blocked.has(member.username) ? "Unblock" : "Block"}
                </button>
                <button
                  type="button"
                  className={screenStyles.smallSecondaryButton}
                  onClick={() => {
                    if (confirming === member.username) {
                      void remove(member.username);
                    } else {
                      setConfirming(member.username);
                    }
                  }}
                >
                  {confirming === member.username
                    ? "Confirm removal"
                    : "Remove"}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {comparing !== undefined && (
        <SafetyNumberPanel
          key={comparing}
          desktopApi={desktopApi}
          groupId={groupId}
          username={comparing}
          onClose={() => {
            setComparing(undefined);
          }}
          onVerified={() => void refreshMembers()}
        />
      )}
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
    </section>
  );
}

/** The Account's block list, following every change the server sends. */
function useBlockedUsernames(desktopApi: DesktopApi): ReadonlySet<string> {
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let mounted = true;
    const refresh = (): void => {
      desktopApi.listBlocked().then(
        (usernames) => {
          if (mounted) setBlocked(new Set(usernames));
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
  return blocked;
}

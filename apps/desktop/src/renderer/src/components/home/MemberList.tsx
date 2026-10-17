import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { GroupMemberSummary } from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import {
  groupRefusalMessage,
  memberDevicesLabel,
} from "../../groups/group-text";
import { screenStyles } from "../screen-styles";

interface MemberListProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
}

/** The Group's people with their Device counts; removing someone removes all their Devices. */
export function MemberList(props: MemberListProps): React.JSX.Element {
  const { desktopApi, groupId } = props;
  const [members, setMembers] = useState<readonly GroupMemberSummary[]>([]);
  const [confirming, setConfirming] = useState<string>();
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
              <span className="text-zinc-500">
                {" "}
                · {memberDevicesLabel(member)}
              </span>
            </span>
            {!member.self && (
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
                {confirming === member.username ? "Confirm removal" : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
    </section>
  );
}

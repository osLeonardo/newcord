import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { InvitationSummary } from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import { groupRefusalMessage } from "../../groups/group-text";
import { screenStyles } from "../screen-styles";

interface InvitationListProps {
  readonly desktopApi: DesktopApi;
}

/** Pending Invitations with each Group's name and who sent it, to accept or decline (D13). */
export function InvitationList({
  desktopApi,
}: InvitationListProps): React.JSX.Element | null {
  const [invitations, setInvitations] = useState<readonly InvitationSummary[]>(
    [],
  );
  const [message, setMessage] = useState<string>();
  const [answering, setAnswering] = useState<string>();

  useEffect(() => {
    let showsThisList = true;
    const refresh = (): void => {
      desktopApi.listInvitations().then(
        (listed) => {
          if (showsThisList) setInvitations(listed);
        },
        () => undefined,
      );
    };
    const unsubscribe = desktopApi.onInvitationsChanged(refresh);
    refresh();
    return (): void => {
      showsThisList = false;
      unsubscribe();
    };
  }, [desktopApi]);

  async function answer(invitationId: string, accept: boolean): Promise<void> {
    setAnswering(invitationId);
    try {
      const result = await desktopApi.answerInvitation(invitationId, accept);
      setMessage(
        result.outcome === "done"
          ? undefined
          : groupRefusalMessage(result.refusal),
      );
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
    setAnswering(undefined);
  }

  if (invitations.length === 0 && message === undefined) return null;
  return (
    <section aria-labelledby="invitations" className="flex flex-col gap-2 p-4">
      <h2 id="invitations" className={screenStyles.sectionHeading}>
        Invitations
      </h2>
      <ul className="flex flex-col gap-3">
        {invitations.map((invitation) => (
          <li
            key={invitation.invitationId}
            className="flex flex-col gap-1 text-sm"
          >
            <span>
              <span className="font-medium">{invitation.groupName}</span>
              <span className="text-zinc-400"> from {invitation.from}</span>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className={screenStyles.smallPrimaryButton}
                disabled={answering !== undefined}
                onClick={() => void answer(invitation.invitationId, true)}
              >
                Accept
              </button>
              <button
                type="button"
                className={screenStyles.smallSecondaryButton}
                disabled={answering !== undefined}
                onClick={() => void answer(invitation.invitationId, false)}
              >
                Decline
              </button>
            </span>
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

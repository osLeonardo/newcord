import { useState, type FormEvent } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { GroupSummary } from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import {
  groupRefusalMessage,
  inviteUsernameProblem,
} from "../../groups/group-text";
import { screenStyles } from "../screen-styles";
import type { CallSession } from "../../calls/use-call-session";
import { CallPanel } from "./CallPanel";
import { ChatView } from "./ChatView";
import { MemberList } from "./MemberList";

interface GroupPaneProps {
  readonly desktopApi: DesktopApi;
  readonly group: GroupSummary;
  readonly callSession: CallSession;
}

interface InviteFormProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
}

type GroupPanel = "invite" | "members";

interface PanelToggleProps {
  readonly label: string;
  readonly open: boolean;
  readonly toggle: () => void;
}

interface LeaveButtonProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
}

/** The open Group: its name, its Call, inviting people, its members, leaving, and the chat. */
export function GroupPane(props: GroupPaneProps): React.JSX.Element {
  const [panel, setPanel] = useState<GroupPanel>();
  const { groupId } = props.group;
  const toggle = (next: GroupPanel): void => {
    setPanel(panel === next ? undefined : next);
  };

  return (
    <section aria-labelledby="group-name" className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
        <h1 id="group-name" className="truncate text-lg font-semibold">
          {props.group.name}
        </h1>
        <div className="flex gap-2">
          <PanelToggle
            label="Members"
            open={panel === "members"}
            toggle={() => toggle("members")}
          />
          <PanelToggle
            label="Invite people"
            open={panel === "invite"}
            toggle={() => toggle("invite")}
          />
          <LeaveButton
            key={groupId}
            desktopApi={props.desktopApi}
            groupId={groupId}
          />
        </div>
      </header>
      <CallPanel
        desktopApi={props.desktopApi}
        groupId={groupId}
        callSession={props.callSession}
      />
      {panel !== undefined && (
        <div className="border-b border-zinc-800 px-6 py-4">
          {panel === "invite" ? (
            <InviteForm
              key={groupId}
              desktopApi={props.desktopApi}
              groupId={groupId}
            />
          ) : (
            <MemberList
              key={groupId}
              desktopApi={props.desktopApi}
              groupId={groupId}
            />
          )}
        </div>
      )}
      <ChatView key={groupId} desktopApi={props.desktopApi} groupId={groupId} />
    </section>
  );
}

function PanelToggle(props: PanelToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={props.open}
      className={screenStyles.smallSecondaryButton}
      onClick={props.toggle}
    >
      {props.label}
    </button>
  );
}

/** Leaving asks once more: it deletes the Group and its history from this Device (D57). */
function LeaveButton(props: LeaveButtonProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>();

  async function leave(): Promise<void> {
    try {
      const result = await props.desktopApi.leaveGroup(props.groupId);
      if (result.outcome === "refused") {
        setMessage(groupRefusalMessage(result.refusal));
        setConfirming(false);
      }
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
      setConfirming(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {message !== undefined && (
        <span role="alert" className={screenStyles.errorMessage}>
          {message}
        </span>
      )}
      <button
        type="button"
        className={
          confirming
            ? screenStyles.smallDangerButton
            : screenStyles.smallSecondaryButton
        }
        onClick={() => {
          if (confirming) void leave();
          else setConfirming(true);
        }}
      >
        {confirming ? "Leave and delete history" : "Leave"}
      </button>
    </span>
  );
}

/** Invites someone by username (D13); the server's answer is the same whether or not they block you (D57). */
function InviteForm(props: InviteFormProps): React.JSX.Element {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<{ text: string; isError: boolean }>();
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problem = inviteUsernameProblem(username);
    if (problem !== undefined) {
      setMessage({ text: problem, isError: true });
      return;
    }
    setSending(true);
    try {
      const result = await props.desktopApi.inviteToGroup(
        props.groupId,
        username,
      );
      setMessage(
        result.outcome === "done"
          ? { text: `Invitation sent to ${username}.`, isError: false }
          : { text: groupRefusalMessage(result.refusal), isError: true },
      );
      if (result.outcome === "done") setUsername("");
    } catch {
      setMessage({ text: UNEXPECTED_FAILURE_MESSAGE, isError: true });
    }
    setSending(false);
  }

  return (
    <form
      className="flex max-w-sm flex-col gap-2"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <label className="flex flex-col gap-1 text-sm text-zinc-300">
        Invite by username
        <input
          type="text"
          value={username}
          autoCapitalize="none"
          spellCheck={false}
          className={screenStyles.textInput}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
        />
      </label>
      {message !== undefined && (
        <p
          role={message.isError ? "alert" : "status"}
          className={
            message.isError ? screenStyles.errorMessage : screenStyles.hint
          }
        >
          {message.text}
        </p>
      )}
      <button
        type="submit"
        className={screenStyles.secondaryButton}
        disabled={sending}
      >
        Send Invitation
      </button>
    </form>
  );
}

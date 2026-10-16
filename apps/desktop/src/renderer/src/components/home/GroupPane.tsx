import { useState, type FormEvent } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { GroupSummary } from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import {
  groupRefusalMessage,
  inviteUsernameProblem,
} from "../../groups/group-text";
import { screenStyles } from "../screen-styles";

interface GroupPaneProps {
  readonly desktopApi: DesktopApi;
  readonly group: GroupSummary;
}

interface InviteFormProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
}

/** The open Group: its name and inviting people; the chat arrives with #6, Step 03. */
export function GroupPane(props: GroupPaneProps): React.JSX.Element {
  return (
    <section aria-labelledby="group-name" className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h1 id="group-name" className="truncate text-lg font-semibold">
          {props.group.name}
        </h1>
      </header>
      <div className="flex flex-col gap-4 p-6">
        <InviteForm
          key={props.group.groupId}
          desktopApi={props.desktopApi}
          groupId={props.group.groupId}
        />
      </div>
    </section>
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

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type {
  ChatEntry,
  ChatMessage,
  ChatNotice,
} from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import {
  chatTextProblem,
  isSendKey,
  messageTimeLabel,
} from "../../groups/chat-text";
import { groupRefusalMessage, noticeText } from "../../groups/group-text";
import { screenStyles } from "../screen-styles";

interface ChatViewProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
}

/** The Group chat: its history in the server's order, always shown as text, and the composer. */
export function ChatView(props: ChatViewProps): React.JSX.Element {
  const { desktopApi, groupId } = props;
  const [messages, setMessages] = useState<readonly ChatEntry[]>([]);
  // When the history was last read: today's messages show only their time.
  const [readAt, setReadAt] = useState(0);
  const end = useRef<HTMLLIElement>(null);

  useEffect(() => {
    let showsThisChat = true;
    const refresh = (): void => {
      desktopApi.listMessages(groupId).then(
        (listed) => {
          if (!showsThisChat) return;
          setMessages(listed);
          setReadAt(Date.now());
        },
        () => undefined,
      );
    };
    const unsubscribe = desktopApi.onMessagesChanged((changed) => {
      if (changed === groupId) refresh();
    });
    refresh();
    return (): void => {
      showsThisChat = false;
      unsubscribe();
    };
  }, [desktopApi, groupId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4"
      >
        {messages.length === 0 && (
          <li className={screenStyles.hint}>No messages yet. Say hello.</li>
        )}
        {messages.map((entry, index) =>
          entry.kind === "text" ? (
            <MessageLine key={`m${entry.seq}`} message={entry} now={readAt} />
          ) : (
            <NoticeLine key={`n${entry.seq}-${index}`} notice={entry} />
          ),
        )}
        <li ref={end} aria-hidden />
      </ol>
      <Composer desktopApi={desktopApi} groupId={groupId} />
    </div>
  );
}

/** One message. Its text is a React text node: markup in it is shown, never run (security checklist, M2). */
function MessageLine({
  message,
  now,
}: {
  readonly message: ChatMessage;
  readonly now: number;
}): React.JSX.Element {
  return (
    <li className="flex flex-col gap-0.5">
      <p className="text-xs text-zinc-500">
        <span
          className={
            message.own
              ? "font-medium text-indigo-300"
              : "font-medium text-zinc-300"
          }
        >
          {message.sender}
        </span>{" "}
        {messageTimeLabel(message.sentAt, now)}
      </p>
      <p className="text-sm break-words whitespace-pre-wrap text-zinc-100">
        {message.text}
      </p>
    </li>
  );
}

/** A system line: stored on this Device, never sent (D56, D71). */
function NoticeLine({
  notice,
}: {
  readonly notice: ChatNotice;
}): React.JSX.Element {
  const warning = notice.notice.type !== "new-device";
  return (
    <li
      className={
        warning
          ? "rounded border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200"
          : "text-center text-xs text-zinc-400"
      }
    >
      {noticeText(notice.notice)}
    </li>
  );
}

/** Sends with Enter; Shift+Enter starts a new line. */
function Composer(props: ChatViewProps): React.JSX.Element {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string>();
  const [sending, setSending] = useState(false);

  async function send(): Promise<void> {
    const problem = chatTextProblem(text);
    if (problem !== undefined) {
      setMessage(text.trim() === "" ? undefined : problem);
      return;
    }
    setSending(true);
    try {
      const result = await props.desktopApi.sendMessage(props.groupId, text);
      if (result.outcome === "sent") {
        setText("");
        setMessage(undefined);
      } else {
        setMessage(groupRefusalMessage(result.refusal));
      }
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
    setSending(false);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (!isSendKey({ ...event, isComposing: event.nativeEvent.isComposing }))
      return;
    event.preventDefault();
    void send();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void send();
  }

  return (
    <form
      className="flex flex-col gap-2 border-t border-zinc-800 px-6 py-4"
      noValidate
      onSubmit={submit}
    >
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          aria-label="Message"
          rows={2}
          value={text}
          placeholder="Write a message"
          className={`${screenStyles.textInput} min-w-0 flex-1 resize-none`}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={keyDown}
        />
        <button
          type="submit"
          className={screenStyles.primaryButton}
          disabled={sending}
        >
          Send
        </button>
      </div>
    </form>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { GroupSummary } from "../../../../preload/group-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import { groupNameProblem, groupRefusalMessage } from "../../groups/group-text";
import { screenStyles } from "../screen-styles";

interface GroupListProps {
  readonly desktopApi: DesktopApi;
  readonly selectedGroupId: string | undefined;
  readonly select: (group: GroupSummary | undefined) => void;
}

interface CreateGroupFormProps {
  readonly desktopApi: DesktopApi;
  readonly created: (group: GroupSummary) => void;
}

/** The Groups this Device is in, kept up to date, with a form to create one. */
export function GroupList(props: GroupListProps): React.JSX.Element {
  const { desktopApi, select, selectedGroupId } = props;
  const [groups, setGroups] = useState<readonly GroupSummary[]>([]);

  useEffect(() => {
    let showsThisList = true;
    const refresh = (): void => {
      desktopApi.listGroups().then(
        (listed) => {
          if (showsThisList) setGroups(listed);
        },
        () => undefined,
      );
    };
    const unsubscribe = desktopApi.onGroupsChanged(refresh);
    refresh();
    return (): void => {
      showsThisList = false;
      unsubscribe();
    };
  }, [desktopApi]);

  useEffect(() => {
    if (selectedGroupId === undefined) return;
    if (!groups.some((group) => group.groupId === selectedGroupId)) {
      select(undefined);
    }
  }, [groups, selectedGroupId, select]);

  return (
    <section aria-labelledby="groups" className="flex flex-col gap-2 p-4">
      <h2 id="groups" className={screenStyles.sectionHeading}>
        Groups
      </h2>
      {groups.length === 0 && (
        <p className={screenStyles.hint}>You are in no Group yet.</p>
      )}
      <ul className="flex flex-col gap-1">
        {groups.map((group) => (
          <li key={group.groupId}>
            <button
              type="button"
              aria-current={group.groupId === selectedGroupId}
              className={screenStyles.listItemButton}
              onClick={() => {
                select(group);
              }}
            >
              {group.name}
            </button>
          </li>
        ))}
      </ul>
      <CreateGroupForm desktopApi={desktopApi} created={select} />
    </section>
  );
}

function CreateGroupForm(props: CreateGroupFormProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string>();
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problem = groupNameProblem(name);
    if (problem !== undefined) {
      setMessage(problem);
      return;
    }
    setSending(true);
    try {
      const result = await props.desktopApi.createGroup(name);
      if (result.outcome === "created") {
        setName("");
        setMessage(undefined);
        props.created(result.group);
      } else {
        setMessage(groupRefusalMessage(result.refusal));
      }
    } catch {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    }
    setSending(false);
  }

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <label className="flex flex-col gap-1 text-sm text-zinc-300">
        New Group
        <input
          type="text"
          value={name}
          maxLength={64}
          placeholder="Group name"
          className={screenStyles.textInput}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      <button
        type="submit"
        className={screenStyles.secondaryButton}
        disabled={sending}
      >
        Create Group
      </button>
    </form>
  );
}

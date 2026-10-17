import { useCallback, useEffect, useState } from "react";
import type { DesktopApi } from "../../../preload/desktop-api";
import type { GroupSummary } from "../../../preload/group-api";
import type { AppView } from "../app-view";
import { useCallSession } from "../calls/use-call-session";
import { AccountHeader } from "../components/home/AccountHeader";
import { GroupList } from "../components/home/GroupList";
import { GroupPane } from "../components/home/GroupPane";
import { InvitationList } from "../components/home/InvitationList";
import { OnlineNow } from "../components/home/OnlineNow";
import { RemoteAudio } from "../components/home/RemoteAudio";
import { screenStyles } from "../components/screen-styles";
import { groupLeftMessage } from "../groups/group-text";

interface HomeScreenProps {
  readonly desktopApi: DesktopApi;
  readonly username: string;
  readonly show: (view: AppView) => void;
}

/** The logged-in home: the sidebar with the account, who is online, Groups and Invitations, and the open Group. */
export function HomeScreen(props: HomeScreenProps): React.JSX.Element {
  const [openGroup, setOpenGroup] = useState<GroupSummary>();
  const [leftNotice, setLeftNotice] = useState<string>();
  const callSession = useCallSession(props.desktopApi);
  const select = useCallback((group: GroupSummary | undefined): void => {
    setOpenGroup(group);
  }, []);

  useEffect(
    () =>
      props.desktopApi.onGroupLeft((notice) => {
        setLeftNotice(groupLeftMessage(notice));
      }),
    [props.desktopApi],
  );

  return (
    <div className="flex h-screen w-full">
      <RemoteAudio streams={callSession.remoteStreams} />
      <nav
        aria-label="Groups and people"
        className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900"
      >
        <AccountHeader
          desktopApi={props.desktopApi}
          username={props.username}
          show={props.show}
        />
        {leftNotice !== undefined && (
          <p
            role="status"
            className="flex items-start justify-between gap-2 border-b border-zinc-800 p-4 text-sm text-zinc-300"
          >
            {leftNotice}
            <button
              type="button"
              className={screenStyles.linkButton}
              onClick={() => {
                setLeftNotice(undefined);
              }}
            >
              Dismiss
            </button>
          </p>
        )}
        <OnlineNow desktopApi={props.desktopApi} />
        <InvitationList desktopApi={props.desktopApi} />
        <GroupList
          desktopApi={props.desktopApi}
          selectedGroupId={openGroup?.groupId}
          select={select}
        />
      </nav>
      <main className="min-w-0 flex-1">
        {openGroup === undefined ? (
          <p className={`${screenStyles.hint} p-6`}>
            Open a Group, or create one to start.
          </p>
        ) : (
          <GroupPane
            desktopApi={props.desktopApi}
            group={openGroup}
            callSession={callSession}
          />
        )}
      </main>
    </div>
  );
}

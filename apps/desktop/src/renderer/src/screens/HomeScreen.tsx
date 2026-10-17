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
import { SettingsScreen } from "../components/settings/SettingsScreen";
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
  const [showsSettings, setShowsSettings] = useState(false);
  const callSession = useCallSession(props.desktopApi);
  const select = useCallback((group: GroupSummary | undefined): void => {
    setOpenGroup(group);
    setShowsSettings(false);
  }, []);

  useEffect(
    () =>
      props.desktopApi.onGroupLeft((notice) => {
        setLeftNotice(groupLeftMessage(notice));
      }),
    [props.desktopApi],
  );

  // Messages in the Group open in the focused window need no notification (#10's spec).
  const { desktopApi } = props;
  const openGroupId = showsSettings ? undefined : openGroup?.groupId;
  useEffect(() => {
    desktopApi.setViewedGroup(openGroupId ?? null).catch(() => undefined);
  }, [desktopApi, openGroupId]);
  useEffect(
    () => (): void => {
      desktopApi.setViewedGroup(null).catch(() => undefined);
    },
    [desktopApi],
  );

  // Clicking a notification opens its Group (11-m4-build step 7).
  useEffect(
    () =>
      desktopApi.onOpenGroup((groupId) => {
        desktopApi.listGroups().then(
          (groups) => {
            const group = groups.find((entry) => entry.groupId === groupId);
            if (group !== undefined) select(group);
          },
          () => undefined,
        );
      }),
    [desktopApi, select],
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
          openSettings={() => {
            setShowsSettings(true);
          }}
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
      <main className="flex min-w-0 flex-1 flex-col">
        {callSession.sharing && (
          <p
            role="status"
            className="flex items-center justify-between gap-4 bg-red-900 px-6 py-2 text-sm text-red-50"
          >
            You are sharing your screen.
            <button
              type="button"
              className={screenStyles.smallSecondaryButton}
              onClick={() => {
                callSession.stopSharing();
              }}
            >
              Stop sharing
            </button>
          </p>
        )}
        <div className="min-h-0 flex-1">
          {showsSettings ? (
            <SettingsScreen
              desktopApi={desktopApi}
              close={() => {
                setShowsSettings(false);
              }}
            />
          ) : openGroup === undefined ? (
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
        </div>
      </main>
    </div>
  );
}

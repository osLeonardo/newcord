import { useCallback, useState } from "react";
import type { DesktopApi } from "../../../preload/desktop-api";
import type { GroupSummary } from "../../../preload/group-api";
import type { AppView } from "../app-view";
import { AccountHeader } from "../components/home/AccountHeader";
import { GroupList } from "../components/home/GroupList";
import { GroupPane } from "../components/home/GroupPane";
import { InvitationList } from "../components/home/InvitationList";
import { OnlineNow } from "../components/home/OnlineNow";
import { screenStyles } from "../components/screen-styles";

interface HomeScreenProps {
  readonly desktopApi: DesktopApi;
  readonly username: string;
  readonly show: (view: AppView) => void;
}

/** The logged-in home: the sidebar with the account, who is online, Groups and Invitations, and the open Group. */
export function HomeScreen(props: HomeScreenProps): React.JSX.Element {
  const [openGroup, setOpenGroup] = useState<GroupSummary>();
  const select = useCallback((group: GroupSummary | undefined): void => {
    setOpenGroup(group);
  }, []);

  return (
    <div className="flex h-screen w-full">
      <nav
        aria-label="Groups and people"
        className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900"
      >
        <AccountHeader
          desktopApi={props.desktopApi}
          username={props.username}
          show={props.show}
        />
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
          <GroupPane desktopApi={props.desktopApi} group={openGroup} />
        )}
      </main>
    </div>
  );
}

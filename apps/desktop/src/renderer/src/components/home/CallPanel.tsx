import { useEffect, useState } from "react";
import type { CallSummary } from "../../../../preload/call-api";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type { CallSession } from "../../calls/use-call-session";
import { screenStyles } from "../screen-styles";
import { SharedScreens } from "./SharedScreens";
import { SharePicker } from "./SharePicker";

interface CallPanelProps {
  readonly desktopApi: DesktopApi;
  readonly groupId: string;
  readonly callSession: CallSession;
}

/** The Group's one drop-in Call (D3): who is in it, who is speaking, and Join or Leave. */
export function CallPanel(props: CallPanelProps): React.JSX.Element {
  const { desktopApi, groupId, callSession } = props;
  const [heard, setHeard] = useState<CallSummary>();
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let showsThisGroup = true;
    desktopApi.readCall(groupId).then(
      (call) => {
        if (showsThisGroup) setHeard(call);
      },
      () => undefined,
    );
    const unsubscribe = desktopApi.onCallChanged((call) => {
      if (call.groupId === groupId) setHeard(call);
    });
    return (): void => {
      showsThisGroup = false;
      unsubscribe();
    };
  }, [desktopApi, groupId]);

  const inThisCall = callSession.active?.groupId === groupId;
  const call = inThisCall ? callSession.active : heard;
  const participants = call?.participants ?? [];

  return (
    <section
      aria-label="Call"
      className="flex min-h-0 flex-wrap items-center gap-3 overflow-y-auto border-b border-zinc-800 px-6 py-2 text-sm"
    >
      {participants.length === 0 ? (
        <span className="text-zinc-500">Nobody is in the Call.</span>
      ) : (
        <ul aria-label="In the Call" className="flex flex-wrap gap-3">
          {participants.map((participant) => (
            <li key={participant.deviceId} className="flex items-center gap-1">
              <span
                aria-label={
                  inThisCall && callSession.speaking.has(participant.deviceId)
                    ? "speaking"
                    : undefined
                }
                className={`inline-block h-2 w-2 rounded-full ${
                  inThisCall && callSession.speaking.has(participant.deviceId)
                    ? "bg-emerald-400"
                    : "bg-zinc-600"
                }`}
              />
              {participant.username}
              {participant.self && <span className="text-zinc-500">(you)</span>}
            </li>
          ))}
        </ul>
      )}
      {inThisCall ? (
        <>
          {!callSession.sharing && (
            <button
              type="button"
              className={screenStyles.smallSecondaryButton}
              onClick={() => {
                setPicking(!picking);
              }}
            >
              Share screen
            </button>
          )}
          <button
            type="button"
            aria-pressed={callSession.muted}
            className={screenStyles.smallSecondaryButton}
            onClick={() => {
              callSession.toggleMute();
            }}
          >
            {callSession.muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            className={screenStyles.smallDangerButton}
            onClick={() => {
              callSession.leave();
            }}
          >
            Leave Call
          </button>
        </>
      ) : call?.full === true ? (
        <span className="text-amber-300">Call full</span>
      ) : (
        <button
          type="button"
          className={screenStyles.smallPrimaryButton}
          disabled={callSession.joining}
          onClick={() => {
            callSession.join(groupId);
          }}
        >
          {callSession.joining ? "Joining…" : "Join Call"}
        </button>
      )}
      {callSession.problem !== undefined && (
        <span role="alert" className={screenStyles.errorMessage}>
          {callSession.problem}
        </span>
      )}
      {inThisCall && picking && (
        <SharePicker
          desktopApi={desktopApi}
          pick={(sourceId, mode) => {
            setPicking(false);
            callSession.startSharing(sourceId, mode);
          }}
          cancel={() => {
            setPicking(false);
          }}
        />
      )}
      {inThisCall && callSession.active !== undefined && (
        <SharedScreens
          call={callSession.active}
          remoteStreams={callSession.remoteStreams}
        />
      )}
    </section>
  );
}

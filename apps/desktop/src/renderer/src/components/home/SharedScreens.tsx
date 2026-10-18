import { useRef } from "react";
import type { CallSummary } from "../../../../preload/call-api";
import { useLiveVideo } from "../../calls/use-live-video";
import { screenStyles } from "../screen-styles";

interface SharedScreensProps {
  readonly call: CallSummary;
  readonly remoteStreams: ReadonlyMap<string, readonly MediaStream[]>;
}

/** The screens the other Participants share, each with its sharer's name. */
export function SharedScreens(props: SharedScreensProps): React.JSX.Element {
  const names = new Map(
    props.call.participants.map((participant) => [
      participant.deviceId,
      participant.username,
    ]),
  );
  const screens = [...props.remoteStreams].flatMap(([deviceId, streams]) =>
    streams
      .filter((stream) => stream.getVideoTracks().length > 0)
      .map((stream) => ({ deviceId, stream })),
  );
  return (
    <div className="flex w-full flex-col gap-2">
      {screens.map(({ deviceId, stream }) => (
        <ScreenView
          key={stream.id}
          stream={stream}
          sharer={names.get(deviceId) ?? "Someone"}
        />
      ))}
    </div>
  );
}

/** One shared screen; the button or a double-click shows it full screen, and Esc or a double-click leaves (D101). */
function ScreenView(props: {
  readonly stream: MediaStream;
  readonly sharer: string;
}): React.JSX.Element | null {
  const live = useLiveVideo(props.stream);
  const video = useRef<HTMLVideoElement | null>(null);
  if (!live) return null;
  const toggleFullScreen = (): void => {
    if (document.fullscreenElement !== null) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    video.current?.requestFullscreen().catch(() => undefined);
  };
  return (
    <figure className="flex flex-col gap-1">
      <video
        autoPlay
        muted
        playsInline
        title="Double-click for full screen"
        className="max-h-[45vh] w-full rounded bg-black object-contain"
        onDoubleClick={toggleFullScreen}
        ref={(element) => {
          video.current = element;
          if (element !== null) element.srcObject = props.stream;
        }}
      />
      <figcaption className="flex items-center justify-between gap-2 text-xs text-zinc-400">
        {props.sharer}&apos;s screen
        <button
          type="button"
          className={screenStyles.smallSecondaryButton}
          onClick={toggleFullScreen}
        >
          Full screen
        </button>
      </figcaption>
    </figure>
  );
}

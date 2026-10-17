import type { CallSummary } from "../../../../preload/call-api";
import { useLiveVideo } from "../../calls/use-live-video";

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

function ScreenView(props: {
  readonly stream: MediaStream;
  readonly sharer: string;
}): React.JSX.Element | null {
  const live = useLiveVideo(props.stream);
  if (!live) return null;
  return (
    <figure className="flex flex-col gap-1">
      <video
        autoPlay
        muted
        playsInline
        className="max-h-[60vh] w-full rounded bg-black object-contain"
        ref={(element) => {
          if (element !== null) element.srcObject = props.stream;
        }}
      />
      <figcaption className="text-xs text-zinc-400">
        {props.sharer}&apos;s screen
      </figcaption>
    </figure>
  );
}

interface RemoteAudioProps {
  readonly streams: ReadonlyMap<string, MediaStream>;
}

/** Plays every other Participant's voice; kept mounted while the Group screens change. */
export function RemoteAudio(props: RemoteAudioProps): React.JSX.Element {
  return (
    <div hidden>
      {[...props.streams].map(([deviceId, stream]) => (
        <audio
          key={deviceId}
          autoPlay
          ref={(element) => {
            if (element !== null) element.srcObject = stream;
          }}
        />
      ))}
    </div>
  );
}

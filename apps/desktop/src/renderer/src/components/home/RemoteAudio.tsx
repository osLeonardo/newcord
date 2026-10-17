interface RemoteAudioProps {
  readonly streams: ReadonlyMap<string, readonly MediaStream[]>;
}

/** Plays every other Participant's voice; kept mounted while the Group screens change. */
export function RemoteAudio(props: RemoteAudioProps): React.JSX.Element {
  return (
    <div hidden>
      {[...props.streams].flatMap(([deviceId, streams]) =>
        streams.map((stream) => (
          <audio
            key={`${deviceId}-${stream.id}`}
            autoPlay
            ref={(element) => {
              if (element !== null) element.srcObject = stream;
            }}
          />
        )),
      )}
    </div>
  );
}

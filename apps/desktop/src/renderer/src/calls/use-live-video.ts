import { useEffect, useState } from "react";

/**
 * Whether a stream shows a moving picture: a share that stopped leaves a muted or ended track.
 * Mount the caller with the stream's ID as its key, so a new stream starts fresh.
 * @example const live = useLiveVideo(stream);
 */
export function useLiveVideo(stream: MediaStream): boolean {
  const [live, setLive] = useState(() => hasLiveVideo(stream));
  useEffect(() => {
    const update = (): void => {
      setLive(hasLiveVideo(stream));
    };
    const watched = new Set<MediaStreamTrack>();
    const watchTracks = (): void => {
      for (const track of stream.getVideoTracks()) {
        if (watched.has(track)) continue;
        watched.add(track);
        track.addEventListener("mute", update);
        track.addEventListener("unmute", update);
        track.addEventListener("ended", update);
      }
      update();
    };
    stream.addEventListener("addtrack", watchTracks);
    stream.addEventListener("removetrack", update);
    for (const track of stream.getVideoTracks()) {
      watched.add(track);
      track.addEventListener("mute", update);
      track.addEventListener("unmute", update);
      track.addEventListener("ended", update);
    }
    return (): void => {
      stream.removeEventListener("addtrack", watchTracks);
      stream.removeEventListener("removetrack", update);
      for (const track of watched) {
        track.removeEventListener("mute", update);
        track.removeEventListener("unmute", update);
        track.removeEventListener("ended", update);
      }
    };
  }, [stream]);
  return live;
}

function hasLiveVideo(stream: MediaStream): boolean {
  return stream
    .getVideoTracks()
    .some((track) => track.readyState === "live" && !track.muted);
}

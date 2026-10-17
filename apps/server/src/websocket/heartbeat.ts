import { startRepeatingTask, type RepeatingTask } from "../repeating-task.js";

/** Each authenticated socket is pinged this often, and one that missed the last reply is ended (D100, 08-m1-build Settings). */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** The part of a `ws` socket the heartbeat uses; browsers and Electron answer pings on their own. */
export interface HeartbeatSocket {
  ping(): void;
  terminate(): void;
  on(event: "pong", listener: () => void): unknown;
}

/**
 * Pings `socket` every `intervalMs`. A socket that has not answered one ping by the next is
 * terminated, which closes it as usual, so its Account goes offline within two intervals.
 * Example: `const heartbeat = startHeartbeat(socket, HEARTBEAT_INTERVAL_MS); heartbeat.stop();`
 */
export function startHeartbeat(
  socket: HeartbeatSocket,
  intervalMs: number,
): RepeatingTask {
  let answered = true;
  socket.on("pong", () => {
    answered = true;
  });
  const repeating = startRepeatingTask(() => {
    if (!answered) {
      repeating.stop();
      socket.terminate();
      return;
    }
    answered = false;
    socket.ping();
  }, intervalMs);
  return repeating;
}

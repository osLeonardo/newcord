import type { FastifyInstance } from "fastify";

export interface RepeatingTask {
  stop(): void;
}

/**
 * Runs `task` every `intervalMs` milliseconds, not at once, without keeping the process alive.
 * Example: `const repeating = startRepeatingTask(checkSessions, 15 * 60 * 1000); repeating.stop();`
 */
export function startRepeatingTask(
  task: () => void,
  intervalMs: number,
): RepeatingTask {
  const timer = setInterval(task, intervalMs);
  timer.unref();
  return { stop: (): void => clearInterval(timer) };
}

/**
 * Starts a repeating task when the app is ready and stops it when the app closes.
 * Example: `runWhileAppIsUp(app, () => startRepeatingTask(checkSessions, intervalMs));`
 */
export function runWhileAppIsUp(
  app: FastifyInstance,
  start: () => RepeatingTask,
): void {
  let running: RepeatingTask | undefined;
  app.addHook("onReady", (done) => {
    running = start();
    done();
  });
  app.addHook("onClose", (_instance, done) => {
    running?.stop();
    done();
  });
}

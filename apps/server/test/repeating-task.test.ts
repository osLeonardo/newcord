import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWhileAppIsUp, startRepeatingTask } from "../src/repeating-task.js";
import { startTestServer } from "./support/server-test-kit.js";

const INTERVAL_MS = 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startRepeatingTask", () => {
  it("runs the task at each interval, not at once", () => {
    const task = vi.fn();

    const repeating = startRepeatingTask(task, INTERVAL_MS);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INTERVAL_MS * 3);
    repeating.stop();

    expect(task).toHaveBeenCalledTimes(3);
  });

  it("stops when asked and leaves no timer behind", () => {
    const task = vi.fn();

    startRepeatingTask(task, INTERVAL_MS).stop();
    vi.advanceTimersByTime(INTERVAL_MS * 3);

    expect(task).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("runWhileAppIsUp", () => {
  it("starts the task when the app is ready and stops it when the app closes", async () => {
    const server = await startTestServer();
    const timersBefore = vi.getTimerCount();
    const task = vi.fn();
    runWhileAppIsUp(server.app, () => startRepeatingTask(task, INTERVAL_MS));

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(task).not.toHaveBeenCalled();
    await server.app.ready();
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(task).toHaveBeenCalledOnce();
    await server.close();

    vi.advanceTimersByTime(INTERVAL_MS * 3);
    expect(task).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(timersBefore);
  });
});

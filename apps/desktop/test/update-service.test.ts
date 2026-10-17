import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUpdateService,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdateService,
  type UpdateSource,
} from "../src/main/updates/update-service";
import { createManualClock, type ManualClock } from "./support/manual-clock";

interface FakeUpdateSource extends UpdateSource {
  readonly checks: number;
  finishDownload(): void;
  readonly restartAndInstall: ReturnType<typeof vi.fn<() => void>>;
}

function createFakeUpdateSource(): FakeUpdateSource {
  let checks = 0;
  const downloaded: (() => void)[] = [];
  return {
    get checks(): number {
      return checks;
    },
    check: (): Promise<void> => {
      checks += 1;
      return Promise.resolve();
    },
    onDownloaded: (listener): void => {
      downloaded.push(listener);
    },
    finishDownload: (): void => {
      for (const listener of downloaded) listener();
    },
    restartAndInstall: vi.fn<() => void>(),
  };
}

const SIX_HOURS = 6 * 60 * 60 * 1000;

let clock: ManualClock;
let source: FakeUpdateSource;
let offers: boolean[];
let updates: UpdateService;

beforeEach(() => {
  clock = createManualClock();
  source = createFakeUpdateSource();
  offers = [];
  updates = createUpdateService({
    source,
    clock,
    offerChanged: (offered) => offers.push(offered),
  });
});

describe("checking for updates (#13, Step 02)", () => {
  it("checks at start-up and every 6 hours", async () => {
    updates.start();
    expect(source.checks).toBe(1);

    await clock.advance(SIX_HOURS - 1);
    expect(source.checks).toBe(1);
    await clock.advance(1);
    expect(source.checks).toBe(2);
    await clock.advance(2 * SIX_HOURS);
    expect(source.checks).toBe(4);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(SIX_HOURS);
  });

  it("stops checking once stopped", async () => {
    updates.start();
    updates.stop();

    await clock.advance(3 * SIX_HOURS);

    expect(source.checks).toBe(1);
    expect(clock.pendingDelays()).toEqual([]);
  });
});

describe("restarting into an update (#13, Step 02)", () => {
  it("never restarts during a Call", async () => {
    updates.start();
    source.finishDownload();
    updates.callChanged(true);

    await expect(updates.restartToUpdate()).resolves.toBe("in-call");
    expect(source.restartAndInstall).not.toHaveBeenCalled();
    await expect(updates.readUpdateOffer()).resolves.toBe(false);
  });

  it("offers restart to update when a Call ends with a downloaded update, and restarts on request", async () => {
    updates.start();
    updates.callChanged(true);
    source.finishDownload();
    expect(offers).toEqual([]);

    updates.callChanged(false);

    expect(offers).toEqual([true]);
    await expect(updates.readUpdateOffer()).resolves.toBe(true);
    await expect(updates.restartToUpdate()).resolves.toBe("restarting");
    expect(source.restartAndInstall).toHaveBeenCalledOnce();
  });

  it("withdraws the offer while a Call runs, and offers it again when the Call ends", async () => {
    source.finishDownload();
    updates.callChanged(true);
    await expect(updates.readUpdateOffer()).resolves.toBe(false);
    updates.callChanged(false);

    expect(offers).toEqual([true, false, true]);
  });

  it("offers nothing when a Call ends with no update waiting", async () => {
    updates.callChanged(true);
    updates.callChanged(false);

    expect(offers).toEqual([]);
    await expect(updates.restartToUpdate()).resolves.toBe("no-update");
    expect(source.restartAndInstall).not.toHaveBeenCalled();
  });

  it("offers restart to update as soon as an update is downloaded outside a Call (D97)", async () => {
    updates.start();
    source.finishDownload();

    expect(offers).toEqual([true]);
    await expect(updates.readUpdateOffer()).resolves.toBe(true);
  });
});

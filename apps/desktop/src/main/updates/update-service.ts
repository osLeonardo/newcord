import type {
  RestartToUpdateResult,
  UpdateApiCalls,
} from "../../preload/update-api";
import type { CancelTimer, SessionClock } from "../session/session-clock";

/** How often the app looks for a new release, besides at start-up (12-m5-build step 6). */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The update library behind the app's own interface: electron-updater in the app, a fake in tests. */
export interface UpdateSource {
  /** Looks for a new release and downloads it in the background; failures are the source's to report. */
  check(): Promise<void>;
  /** Hears that an update finished downloading; it installs on its own when the app next quits. */
  onDownloaded(listener: () => void): void;
  /** Quits the app and runs the downloaded update's installer. */
  restartAndInstall(): void;
}

export interface UpdateServiceDependencies {
  readonly source: UpdateSource;
  readonly clock: Pick<SessionClock, "setTimer">;
  /** Tells the windows whether to offer "restart to update". */
  readonly offerChanged: (offered: boolean) => void;
}

/** The app's updater: the desktop API's update calls, plus what the main process drives. */
export interface UpdateService extends UpdateApiCalls {
  /** Checks now, then every 6 hours until stopped. */
  start(): void;
  /** Whether this Device is in a Call now. */
  callChanged(inCall: boolean): void;
  stop(): void;
}

interface UpdateState {
  downloaded: boolean;
  inCall: boolean;
  offered: boolean;
  cancelNextCheck?: CancelTimer;
}

/**
 * Checks GitHub Releases at start-up and every 6 hours, and lets a downloaded update install on the
 * next restart. It never restarts during a Call: when a Call ends with an update waiting, the
 * window offers "restart to update", and joining another Call withdraws the offer (12-m5-build step 7).
 * @example const updates = createUpdateService({ source, clock, offerChanged }); updates.start();
 */
export function createUpdateService(
  dependencies: UpdateServiceDependencies,
): UpdateService {
  const { source, clock, offerChanged } = dependencies;
  const state: UpdateState = {
    downloaded: false,
    inCall: false,
    offered: false,
  };
  const setOffered = (offered: boolean): void => {
    if (state.offered === offered) return;
    state.offered = offered;
    offerChanged(offered);
  };
  const checkNow = (): void => {
    void source.check();
  };
  const scheduleNextCheck = (): void => {
    state.cancelNextCheck = clock.setTimer(() => {
      checkNow();
      scheduleNextCheck();
    }, UPDATE_CHECK_INTERVAL_MS);
  };
  source.onDownloaded(() => {
    state.downloaded = true;
  });
  return {
    start: (): void => {
      checkNow();
      scheduleNextCheck();
    },
    callChanged: (inCall): void => {
      const callEnded = state.inCall && !inCall;
      state.inCall = inCall;
      if (inCall) setOffered(false);
      else if (callEnded && state.downloaded) setOffered(true);
    },
    stop: (): void => {
      state.cancelNextCheck?.();
      state.cancelNextCheck = undefined;
    },
    readUpdateOffer: () => Promise.resolve(state.offered),
    restartToUpdate: (): Promise<RestartToUpdateResult> => {
      if (state.inCall) return Promise.resolve("in-call");
      if (!state.downloaded) return Promise.resolve("no-update");
      source.restartAndInstall();
      return Promise.resolve("restarting");
    },
  };
}

/** The update calls when the app does not update itself: in development, where Electron itself runs, and in tests. */
export const NO_UPDATES: UpdateApiCalls = {
  readUpdateOffer: () => Promise.resolve(false),
  restartToUpdate: () => Promise.resolve("no-update"),
};

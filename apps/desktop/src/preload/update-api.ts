/** What "restart to update" did; the app never restarts into an update during a Call (12-m5-build step 7). */
export type RestartToUpdateResult = "restarting" | "in-call" | "no-update";

/** Automatic updates from GitHub Releases (#13). */
export interface UpdateApiCalls {
  /** True while a downloaded update waits and this Device is not in a Call: the window offers "restart to update" (D97). */
  readUpdateOffer(): Promise<boolean>;
  /** Quits and installs the downloaded update, unless this Device is in a Call. */
  restartToUpdate(): Promise<RestartToUpdateResult>;
}

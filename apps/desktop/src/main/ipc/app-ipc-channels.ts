import type { CheckedIpcChannel } from "./checked-ipc-handler";

/** Every channel the preload API calls; each one is registered behind the sender and argument checks. */
export const appIpcChannels: readonly CheckedIpcChannel[] = [];

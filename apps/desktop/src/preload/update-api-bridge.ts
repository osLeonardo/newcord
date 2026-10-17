import type { IpcInvoke, IpcSubscribe } from "./desktop-api-bridge";
import {
  desktopApiChannels,
  desktopApiEventChannels,
  type DesktopApi,
} from "./desktop-api";
import type { RestartToUpdateResult, UpdateApiCalls } from "./update-api";

/**
 * The desktop API's update functions on IPC, each passing its own arguments and nothing else.
 * @example const updates = createUpdateApi(invoke, subscribe);
 */
export function createUpdateApi(
  invoke: IpcInvoke,
  subscribe: IpcSubscribe,
): UpdateApiCalls & Pick<DesktopApi, "onUpdateOfferChanged"> {
  return {
    readUpdateOffer: () =>
      invoke(desktopApiChannels.readUpdateOffer) as Promise<boolean>,
    restartToUpdate: () =>
      invoke(
        desktopApiChannels.restartToUpdate,
      ) as Promise<RestartToUpdateResult>,
    onUpdateOfferChanged: (listener) =>
      subscribe(desktopApiEventChannels.onUpdateOfferChanged, (payload) => {
        if (typeof payload === "boolean") listener(payload);
      }),
  };
}

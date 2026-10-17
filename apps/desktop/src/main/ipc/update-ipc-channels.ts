import { Type, type Static } from "typebox";
import { desktopApiChannels } from "../../preload/desktop-api";
import type {
  RestartToUpdateResult,
  UpdateApiCalls,
} from "../../preload/update-api";
import { checkedChannel, type CheckedIpcChannel } from "./checked-ipc-handler";
import { argumentsMatching } from "./typebox-arguments";

const NoArguments = Type.Tuple([]);
type NoArguments = Static<typeof NoArguments>;

/**
 * The update channels, each checked for its sender and arguments.
 * @example createUpdateIpcChannels(updateActions)
 */
export function createUpdateIpcChannels(
  actions: UpdateApiCalls,
): CheckedIpcChannel[] {
  return [
    checkedChannel<NoArguments, boolean>({
      name: desktopApiChannels.readUpdateOffer,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readUpdateOffer(),
    }),
    checkedChannel<NoArguments, RestartToUpdateResult>({
      name: desktopApiChannels.restartToUpdate,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.restartToUpdate(),
    }),
  ];
}

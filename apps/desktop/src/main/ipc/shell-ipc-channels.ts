import { Type, type Static } from "typebox";
import { desktopApiChannels } from "../../preload/desktop-api";
import type { ShellApiCalls } from "../../preload/shell-api";
import { checkedChannel, type CheckedIpcChannel } from "./checked-ipc-handler";
import { argumentsMatching } from "./typebox-arguments";

const NoArguments = Type.Tuple([]);
type NoArguments = Static<typeof NoArguments>;
const CallMediaArguments = Type.Tuple([
  Type.Object(
    { muted: Type.Boolean(), sharing: Type.Boolean() },
    { additionalProperties: false },
  ),
]);
type CallMediaArguments = Static<typeof CallMediaArguments>;

/**
 * The shell channels, each checked for its sender and arguments.
 * @example createShellIpcChannels(shellActions)
 */
export function createShellIpcChannels(
  actions: ShellApiCalls,
): CheckedIpcChannel[] {
  return [
    checkedChannel<NoArguments, boolean>({
      name: desktopApiChannels.readStartupNotice,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.readStartupNotice(),
    }),
    checkedChannel<NoArguments, void>({
      name: desktopApiChannels.dismissStartupNotice,
      expectedArguments: "",
      argumentsMatch: argumentsMatching(NoArguments),
      handle: () => actions.dismissStartupNotice(),
    }),
    checkedChannel<CallMediaArguments, void>({
      name: desktopApiChannels.reportCallMedia,
      expectedArguments: "report: { muted: boolean, sharing: boolean }",
      argumentsMatch: argumentsMatching(CallMediaArguments),
      handle: (report) => actions.reportCallMedia(report),
    }),
  ];
}

import { Type, type Static } from "typebox";
import { desktopApiChannels } from "../../preload/desktop-api";
import type { ShellApiCalls } from "../../preload/shell-api";
import { checkedChannel, type CheckedIpcChannel } from "./checked-ipc-handler";
import { argumentsMatching } from "./typebox-arguments";

const CallMediaArguments = Type.Tuple([
  Type.Object(
    { muted: Type.Boolean(), sharing: Type.Boolean() },
    { additionalProperties: false },
  ),
]);
type CallMediaArguments = Static<typeof CallMediaArguments>;
const ViewedGroupArguments = Type.Tuple([
  Type.Union([Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" }), Type.Null()]),
]);
type ViewedGroupArguments = Static<typeof ViewedGroupArguments>;

/**
 * The shell channels, each checked for its sender and arguments.
 * @example createShellIpcChannels(shellActions)
 */
export function createShellIpcChannels(
  actions: ShellApiCalls,
): CheckedIpcChannel[] {
  return [
    checkedChannel<CallMediaArguments, void>({
      name: desktopApiChannels.reportCallMedia,
      expectedArguments: "report: { muted: boolean, sharing: boolean }",
      argumentsMatch: argumentsMatching(CallMediaArguments),
      handle: (report) => actions.reportCallMedia(report),
    }),
    checkedChannel<ViewedGroupArguments, void>({
      name: desktopApiChannels.setViewedGroup,
      expectedArguments: "groupId: GroupId or null",
      argumentsMatch: argumentsMatching(ViewedGroupArguments),
      handle: (groupId) => actions.setViewedGroup(groupId),
    }),
  ];
}

export interface IpcSenderFrame {
  readonly url: string;
  readonly parent: unknown;
}

export interface IpcInvocation {
  readonly sender: { readonly id: number };
  readonly senderFrame: IpcSenderFrame | null;
}

export type IpcInvokeListener = (
  invocation: IpcInvocation,
  ...args: unknown[]
) => Promise<unknown>;

export interface IpcInvokeRegistry {
  handle(channel: string, listener: IpcInvokeListener): void;
}

export type IpcSenderCheck = (invocation: IpcInvocation) => boolean;

export interface CheckedIpcChannel<
  Arguments extends readonly unknown[] = readonly unknown[],
  Result = unknown,
> {
  readonly name: string;
  readonly expectedArguments: string;
  argumentsMatch(args: readonly unknown[]): args is Arguments;
  handle(...args: Arguments): Promise<Result>;
}

/**
 * Handles the channel's invoke calls, refusing any call from another sender or with arguments that do not match.
 * @example registerCheckedIpcHandler(ipcMain, isTrustedSender, signUpChannel)
 */
export function registerCheckedIpcHandler<
  Arguments extends readonly unknown[],
  Result,
>(
  registry: IpcInvokeRegistry,
  isTrustedSender: IpcSenderCheck,
  channel: CheckedIpcChannel<Arguments, Result>,
): void {
  registry.handle(channel.name, async (invocation, ...args) => {
    const callArguments: readonly unknown[] = args;
    if (!isTrustedSender(invocation)) {
      throw new Error(untrustedSenderMessage(channel.name, invocation));
    }
    if (!channel.argumentsMatch(callArguments)) {
      throw new Error(invalidArgumentsMessage(channel, callArguments));
    }
    return await channel.handle(...callArguments);
  });
}

function untrustedSenderMessage(
  channelName: string,
  invocation: IpcInvocation,
): string {
  const frameUrl = invocation.senderFrame?.url ?? "(no frame)";
  return `IPC call to "${channelName}" refused: it came from web contents ${invocation.sender.id}, frame ${frameUrl}; expected the main frame of the app's own window`;
}

function invalidArgumentsMessage(
  channel: CheckedIpcChannel<readonly unknown[], unknown>,
  args: readonly unknown[],
): string {
  return `IPC call to "${channel.name}" refused: received (${args.map(argumentType).join(", ")}), expected (${channel.expectedArguments})`;
}

function argumentType(argument: unknown): string {
  if (argument === null) return "null";
  return Array.isArray(argument) ? "array" : typeof argument;
}

/**
 * Ties a channel's `handle` to the argument types its schema check guarantees.
 * @example checkedChannel<NoArguments, SessionState>({ name, expectedArguments: "", argumentsMatch, handle })
 */
export function checkedChannel<Arguments extends readonly unknown[], Result>(
  channel: CheckedIpcChannel<Arguments, Result>,
): CheckedIpcChannel<Arguments, Result> {
  return channel;
}

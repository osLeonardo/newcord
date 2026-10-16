import {
  HubErrorCode,
  PROTOCOL_VERSION,
  type BlockEnvelope,
  type BlockListEnvelope,
  type UnblockEnvelope,
} from "@newcord/shared";
import type { AccountStore } from "../accounts/account-store.js";
import type {
  HubContext,
  HubMessenger,
  ReplyOutcome,
} from "../hub/hub-messenger.js";
import type { HubRequestHandlers } from "../hub/hub-requests.js";
import type { BlockStore } from "./block-store.js";

export interface BlockRequestDependencies {
  blockStore: BlockStore;
  accountStore: Pick<AccountStore, "findByUsername">;
  messenger: HubMessenger;
}

/**
 * Creates the handlers of `block` and `unblock` (D57); each change is sent to every connected
 * Device of the Account, so they all hide the same people.
 * Example: `const handlers = createBlockRequestHandlers({ blockStore, accountStore, messenger });`
 */
export function createBlockRequestHandlers(
  dependencies: BlockRequestDependencies,
): Pick<HubRequestHandlers, "block" | "unblock"> {
  return {
    block: (context, envelope): void =>
      changeBlock(dependencies, context, envelope),
    unblock: (context, envelope): void =>
      changeBlock(dependencies, context, envelope),
  };
}

/**
 * Sends a newly authenticated socket its Account's block list.
 * Example: `sendBlockListOnHello(dependencies, context);`
 */
export function sendBlockListOnHello(
  dependencies: Pick<BlockRequestDependencies, "blockStore" | "messenger">,
  context: HubContext,
): void {
  dependencies.messenger.toSocket(
    context.socket,
    blockListOf(dependencies.blockStore, context.owner.userId),
  );
}

function blockListOf(
  blockStore: Pick<BlockStore, "blockedUsernamesOf">,
  userId: number,
): BlockListEnvelope {
  return {
    v: PROTOCOL_VERSION,
    type: "blocks",
    usernames: blockStore.blockedUsernamesOf(userId),
  };
}

function changeBlock(
  dependencies: BlockRequestDependencies,
  context: HubContext,
  envelope: BlockEnvelope | UnblockEnvelope,
): void {
  const outcome = applyBlockChange(dependencies, context, envelope);
  dependencies.messenger.reply(context, envelope.requestId, outcome);
  if (!outcome.ok) return;
  const { userId } = context.owner;
  dependencies.messenger.toAccount(
    userId,
    blockListOf(dependencies.blockStore, userId),
  );
}

function applyBlockChange(
  dependencies: BlockRequestDependencies,
  context: HubContext,
  envelope: BlockEnvelope | UnblockEnvelope,
): ReplyOutcome {
  const target = dependencies.accountStore.findByUsername(envelope.username);
  if (target === undefined) {
    return { ok: false, code: HubErrorCode.AccountNotFound };
  }
  const blocker = context.owner.userId;
  if (target.userId === blocker) {
    return { ok: false, code: HubErrorCode.CannotBlockSelf };
  }
  if (envelope.type === "block") {
    dependencies.blockStore.block(blocker, target.userId);
  } else {
    dependencies.blockStore.unblock(blocker, target.userId);
  }
  return { ok: true };
}

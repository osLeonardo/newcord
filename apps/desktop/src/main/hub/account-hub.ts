import { PROTOCOL_VERSION } from "@newcord/shared";
import type { GroupEvents } from "../groups/group-context";
import { createCallService, type CallService } from "../calls/call-service";
import { createCallState } from "../calls/call-state";
import {
  createBlockList,
  groupIdText,
  type GroupContext,
} from "../groups/group-context";
import { createGroupLanes } from "../groups/group-lanes";
import { createGroupService, type GroupService } from "../groups/group-service";
import type { LocalGroups } from "../local-store/local-groups";
import type { LocalMessages } from "../local-store/local-messages";
import type { VerifiedMarks } from "../local-store/verified-marks";
import type { SettingsStore } from "../local-store/device-settings";
import { createSafetyHalves } from "../safety/safety-numbers";
import type { LocalStore } from "../local-store/local-store";
import { credentialIdentity } from "../mls/credential-identity";
import type { MlsStateStore } from "../local-store/mls-state-store";
import {
  createKeyPackageUpkeep,
  type KeyPackageUpkeep,
} from "../mls/key-package-upkeep";
import type { MlsEngine } from "../mls/mls-engine";
import { openMlsSession, type MlsSession } from "../mls/mls-session";
import type { ServerApiClient } from "../server-api/server-api-client";
import { createAuthenticatedCall } from "../session/authenticated-call";
import type { HubEnvelope, LiveSession } from "../session/live-session";
import type { SessionClock } from "../session/session-clock";
import { createHubInbox } from "./hub-inbox";
import { createHubRequester, type HubRequester } from "./hub-requester";

export interface AccountHubDependencies {
  readonly store: LocalStore;
  readonly mlsStateStore: MlsStateStore;
  readonly localGroups: LocalGroups;
  readonly localMessages: LocalMessages;
  readonly verifiedMarks: VerifiedMarks;
  readonly groupEvents: GroupEvents;
  readonly createEngine: () => MlsEngine;
  readonly server: Pick<
    ServerApiClient,
    "uploadKeyPackages" | "relayCredentials"
  >;
  readonly deviceSettings: SettingsStore;
  readonly liveSession: Pick<LiveSession, "send" | "renewAccessToken">;
  readonly clock: SessionClock;
  /** Told about failures no request can report, such as a Key package upload that threw. */
  readonly reportError: (error: unknown) => void;
}

/** Everything the logged-in Device does with the hub, for the Account stored on this installation. */
export interface AccountHub {
  readonly deviceId: string;
  readonly mls: MlsSession;
  readonly requester: HubRequester;
  readonly groups: GroupService;
  readonly calls: CallService;
  envelopeReceived(envelope: HubEnvelope): void;
  connectionChanged(ready: boolean): void;
}

/**
 * Opens the hub of the stored Account: its MLS session (#6, Step 01), requests and Key packages.
 * Returns undefined when no Account is stored.
 * @example const hub = openAccountHub(dependencies);
 */
export function openAccountHub(
  dependencies: AccountHubDependencies,
): AccountHub | undefined {
  const account = dependencies.store.readAccount();
  const keyPair = dependencies.store.readIdentityKey();
  if (account === undefined || keyPair === undefined) return undefined;
  const mls = openMlsSession({
    stateStore: dependencies.mlsStateStore,
    createEngine: dependencies.createEngine,
    device: { keyPair, ...account },
  });
  const requester = createHubRequester({
    send: (envelope) => dependencies.liveSession.send(envelope),
    clock: dependencies.clock,
  });
  const upkeep = keyPackageUpkeepFor(dependencies, mls);
  const context: GroupContext = {
    mls,
    requester,
    localGroups: dependencies.localGroups,
    localMessages: dependencies.localMessages,
    blockList: createBlockList(),
    verifiedMarks: dependencies.verifiedMarks,
    safetyHalves: createSafetyHalves(),
    lanes: createGroupLanes(),
    calls: createCallState(),
    ownIdentity: credentialIdentity(account),
    sendAck: (groupId, seq) =>
      dependencies.liveSession.send({
        v: PROTOCOL_VERSION,
        type: "ack",
        groupId: groupIdText(groupId),
        seq,
      }),
    events: dependencies.groupEvents,
    reportError: dependencies.reportError,
    now: () => dependencies.clock.now(),
  };
  const groups = createGroupService(context);
  const callAuthenticated = createAuthenticatedCall(dependencies);
  const calls = createCallService(context, {
    credentials: () =>
      callAuthenticated((accessToken) =>
        dependencies.server.relayCredentials(accessToken),
      ),
    hideMyIp: () => dependencies.deviceSettings.read().hideMyIp,
  });
  return {
    deviceId: account.deviceId,
    mls,
    requester,
    groups,
    calls,
    envelopeReceived: createHubInbox({
      ...groups.inboxHandlers,
      reply: (reply) => requester.replyReceived(reply),
      "keypackage.count": (envelope) =>
        void upkeep
          .countReported(envelope.count)
          .catch(dependencies.reportError),
    }),
    connectionChanged: (ready): void => {
      if (!ready) requester.connectionLost();
    },
  };
}

function keyPackageUpkeepFor(
  dependencies: AccountHubDependencies,
  mls: MlsSession,
): KeyPackageUpkeep {
  const callAuthenticated = createAuthenticatedCall(dependencies);
  return createKeyPackageUpkeep({
    mls,
    stateStore: dependencies.mlsStateStore,
    upload: (request) =>
      callAuthenticated((accessToken) =>
        dependencies.server.uploadKeyPackages(accessToken, request),
      ),
  });
}

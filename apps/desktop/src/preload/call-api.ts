import type { CallSignal } from "@newcord/shared";
import type { GroupActionResult, GroupRefusal } from "./group-api";

/** Someone heard in a Group's Call; a person on two Devices is there twice. */
export interface CallParticipantSummary {
  readonly username: string;
  readonly deviceId: string;
  readonly self: boolean;
}

/** A Group's Call as this Device knows it from the MLS messages it received (D18). */
export interface CallSummary {
  readonly groupId: string;
  /** This Device's ID; the lower ID of a pair is the polite side (10-m3-build step 4). */
  readonly ownDeviceId: string;
  readonly joined: boolean;
  /** This Device first when it is in the Call, then the others in the order they joined. */
  readonly participants: readonly CallParticipantSummary[];
  /** Six Participants: one more would see "call full" (D2). */
  readonly full: boolean;
}

export type JoinCallResult =
  | { readonly outcome: "joined"; readonly call: CallSummary }
  | { readonly outcome: "refused"; readonly refusal: GroupRefusal };

/** A decrypted signal for this Device from another Participant, for the window's WebRTC. */
export interface ReceivedCallSignal {
  readonly groupId: string;
  readonly from: string;
  readonly signal: CallSignal;
}

/** The Call functions the window uses; WebRTC itself runs in the window (D42). */
export interface CallApiCalls {
  readCall(groupId: string): Promise<CallSummary>;
  /** Sends call.join through MLS, leaving any other Call first; refused with CALL_FULL, sending nothing. */
  joinCall(groupId: string): Promise<JoinCallResult>;
  leaveCall(groupId: string): Promise<GroupActionResult>;
  /** Encrypts a signal for one Participant's Device; it is never sent in plain form (D18). */
  sendCallSignal(
    groupId: string,
    to: string,
    signal: CallSignal,
  ): Promise<GroupActionResult>;
  /** Takes a Participant off the list after its connection failed or never came up in 30 seconds. */
  dropCallParticipant(groupId: string, deviceId: string): Promise<void>;
}

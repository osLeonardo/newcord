import { Type, type Static } from "typebox";
import { DeviceId, Username } from "./accounts.js";
import { GroupId } from "./groups.js";
import { MlsPayload, ProtocolVersion, RequestId } from "./protocol.js";

/** Ordinary Key packages a Device keeps on the server, plus one last-resort (09-m2-build Settings). */
export const KEY_PACKAGE_TARGET = 20;

/** Below this many ordinary Key packages, the server tells the Device and its app tops up (09-m2-build Settings). */
export const KEY_PACKAGE_LOW_WATERMARK = 5;

/** The body of `POST /keypackages`: up to 20 ordinary Key packages, and a last-resort one that replaces the previous. */
export const KeyPackageUploadRequest = Type.Object(
  {
    keyPackages: Type.Array(MlsPayload, { maxItems: KEY_PACKAGE_TARGET }),
    lastResort: Type.Optional(MlsPayload),
  },
  { additionalProperties: false },
);
export type KeyPackageUploadRequest = Static<typeof KeyPackageUploadRequest>;

/** The `200` body of `POST /keypackages`: how many ordinary Key packages the Device now has. */
export const KeyPackageUploadResponse = Type.Object(
  { count: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export type KeyPackageUploadResponse = Static<typeof KeyPackageUploadResponse>;

/** Sent after `hello`, and whenever the Device's ordinary Key packages drop below 5. */
export const KeyPackageCountEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("keypackage.count"),
    count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type KeyPackageCountEnvelope = Static<typeof KeyPackageCountEnvelope>;

/** Asks for one Key package of each Device of an Account that may be added to the Group. */
export const KeyPackageGetEnvelope = Type.Object(
  {
    v: ProtocolVersion,
    type: Type.Literal("keypackage.get"),
    requestId: RequestId,
    groupId: GroupId,
    username: Username,
  },
  { additionalProperties: false },
);
export type KeyPackageGetEnvelope = Static<typeof KeyPackageGetEnvelope>;

/** One Device's Key package, as `keypackage.get` hands it out. */
export const DeviceKeyPackage = Type.Object(
  { deviceId: DeviceId, keyPackage: MlsPayload },
  { additionalProperties: false },
);
export type DeviceKeyPackage = Static<typeof DeviceKeyPackage>;

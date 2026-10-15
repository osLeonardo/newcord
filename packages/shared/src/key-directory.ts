import { Type, type Static } from "typebox";
import { IdentityKey, Username } from "./accounts.js";

/** The path parameters of `GET /users/:username/keys`, the Key directory (D64). */
export const KeyDirectoryParams = Type.Object(
  { username: Username },
  { additionalProperties: false },
);
export type KeyDirectoryParams = Static<typeof KeyDirectoryParams>;

/** The `200` body of `GET /users/:username/keys`: the identity key of each of the Account's Devices, oldest Device first. */
export const KeyDirectoryResponse = Type.Object(
  { identityKeys: Type.Array(IdentityKey) },
  { additionalProperties: false },
);
export type KeyDirectoryResponse = Static<typeof KeyDirectoryResponse>;

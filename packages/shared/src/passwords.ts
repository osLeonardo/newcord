import { Type, type Static } from "typebox";
import { Password, Username } from "./accounts.js";
import { RecoveryCode, TypedRecoveryCode } from "./recovery-code.js";

/** The body of `POST /password/change`: a logged-in Device sets a new password without the old one (D55). */
export const PasswordChangeRequest = Type.Object(
  { newPassword: Password },
  { additionalProperties: false },
);
export type PasswordChangeRequest = Static<typeof PasswordChangeRequest>;

/** The body of `POST /password/recover`; the Recovery code may be sent as the person typed it. */
export const PasswordRecoveryRequest = Type.Object(
  {
    username: Username,
    recoveryCode: TypedRecoveryCode,
    newPassword: Password,
  },
  { additionalProperties: false },
);
export type PasswordRecoveryRequest = Static<typeof PasswordRecoveryRequest>;

/** The `200` body of `POST /password/recover`: the new Recovery code, shown once (D55); no tokens, so the app logs in next. */
export const PasswordRecoveryResponse = Type.Object(
  { recoveryCode: RecoveryCode },
  { additionalProperties: false },
);
export type PasswordRecoveryResponse = Static<typeof PasswordRecoveryResponse>;

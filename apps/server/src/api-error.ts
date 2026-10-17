import type { ApiErrorCode } from "@newcord/shared";

/**
 * A refusal Fastify answers as `{ statusCode, code, error, message }`.
 * Example: `throw new ApiError(409, ApiErrorCode.UsernameTaken, 'Username "alice" is already taken');`
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;

  constructor(statusCode: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

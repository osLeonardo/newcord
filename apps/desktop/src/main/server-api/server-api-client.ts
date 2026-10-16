import {
  ApiErrorCode,
  LoginResponse,
  RefreshResponse,
  RegisterResponse,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
} from "@newcord/shared";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import type {
  ServerPost,
  ServerReply,
  ServerTransport,
} from "./fetch-transport";

/** Why a server call failed: the server's error code, or a problem reaching or understanding it. */
export type ServerCallFailure =
  ApiErrorCode | "SERVER_UNREACHABLE" | "UNEXPECTED_RESPONSE";

export type ServerCallResult<Body> =
  | { readonly ok: true; readonly body: Body }
  | { readonly ok: false; readonly failure: ServerCallFailure };

/** The server routes the app calls in M1 (#2's contracts), with every reply checked against its schema. */
export interface ServerApiClient {
  register(
    request: RegisterRequest,
  ): Promise<ServerCallResult<RegisterResponse>>;
  logIn(request: LoginRequest): Promise<ServerCallResult<LoginResponse>>;
  refresh(request: RefreshRequest): Promise<ServerCallResult<RefreshResponse>>;
  logOut(accessToken: string): Promise<ServerCallResult<undefined>>;
}

interface ExpectedReply<Schema extends TSchema> {
  readonly status: number;
  readonly schema: Schema;
}

/** Fastify's error body; only its `code` matters to the app. */
const ErrorReplyBody = Type.Object({ code: Type.String() });
const NoBody = Type.Undefined();
const apiErrorCodes: ReadonlySet<string> = new Set(Object.values(ApiErrorCode));

/**
 * Calls the server through the transport, turning refusals and network failures into results.
 * @example const result = await createServerApiClient(transport).logIn({ username, password, identityKey });
 */
export function createServerApiClient(
  transport: ServerTransport,
): ServerApiClient {
  return {
    register: (request) =>
      post(
        transport,
        { path: "/register", body: request },
        { status: 201, schema: RegisterResponse },
      ),
    logIn: (request) =>
      post(
        transport,
        { path: "/login", body: request },
        { status: 200, schema: LoginResponse },
      ),
    refresh: (request) =>
      post(
        transport,
        { path: "/refresh", body: request },
        { status: 200, schema: RefreshResponse },
      ),
    logOut: (accessToken) =>
      post(
        transport,
        { path: "/logout", accessToken },
        { status: 204, schema: NoBody },
      ),
  };
}

async function post<Schema extends TSchema>(
  transport: ServerTransport,
  request: ServerPost,
  expected: ExpectedReply<Schema>,
): Promise<ServerCallResult<Static<Schema>>> {
  const reply = await sendOrUndefined(transport, request);
  if (reply === undefined) return { ok: false, failure: "SERVER_UNREACHABLE" };
  const { body } = reply;
  if (reply.status === expected.status && Value.Check(expected.schema, body)) {
    return { ok: true, body };
  }
  return { ok: false, failure: failureOf(reply) };
}

async function sendOrUndefined(
  transport: ServerTransport,
  request: ServerPost,
): Promise<ServerReply | undefined> {
  try {
    return await transport.post(request);
  } catch {
    // The transport rejects only when the server cannot be reached; there is nothing more to tell.
    return undefined;
  }
}

function failureOf(reply: ServerReply): ServerCallFailure {
  if (!Value.Check(ErrorReplyBody, reply.body)) return "UNEXPECTED_RESPONSE";
  return isApiErrorCode(reply.body.code)
    ? reply.body.code
    : "UNEXPECTED_RESPONSE";
}

function isApiErrorCode(code: string): code is ApiErrorCode {
  return apiErrorCodes.has(code);
}

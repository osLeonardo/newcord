import fastifyJwt from "@fastify/jwt";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accessTokenPluginOptions,
  createAccessTokenSigner,
  createAccessTokenVerifier,
  type AccessTokenVerifier,
} from "../src/sessions/access-tokens.js";
import {
  TEST_JWT_SECRET,
  buildTestJwt,
  hmacSignature,
  nowInSeconds,
} from "./support/server-test-kit.js";

const DEVICE_ID = "AbCd-_0123456789xyzXYZ";

let app: FastifyInstance;
let verifier: AccessTokenVerifier;

beforeAll(async () => {
  app = Fastify();
  await app.register(fastifyJwt, accessTokenPluginOptions(TEST_JWT_SECRET));
  await app.ready();
  verifier = createAccessTokenVerifier(app.jwt);
});

afterAll(async () => {
  await app.close();
});

const hs256 = (claims: Record<string, unknown>): string =>
  buildTestJwt({
    header: { alg: "HS256", typ: "JWT" },
    claims,
    sign: hmacSignature(TEST_JWT_SECRET),
  });

describe("createAccessTokenVerifier", () => {
  it("returns the Account and Device a signed access token names", () => {
    const token = createAccessTokenSigner(app.jwt).sign({
      userId: 42,
      deviceId: DEVICE_ID,
    });

    expect(verifier.verify(token)).toEqual({ userId: 42, deviceId: DEVICE_ID });
  });

  it.each([
    ["the empty string", ""],
    ["text that is not a JWT", "not-a-jwt"],
    [
      "an expired token",
      hs256({ sub: "1", deviceId: DEVICE_ID, exp: nowInSeconds() - 1 }),
    ],
    ["a token without an expiry", hs256({ sub: "1", deviceId: DEVICE_ID })],
    [
      "an Account ID of zero",
      hs256({ sub: "0", deviceId: DEVICE_ID, exp: nowInSeconds() + 60 }),
    ],
    [
      "an Account ID sent as a number",
      hs256({ sub: 1, deviceId: DEVICE_ID, exp: nowInSeconds() + 60 }),
    ],
    [
      "an Account ID beyond the safe integers",
      hs256({
        sub: "9007199254740993",
        deviceId: DEVICE_ID,
        exp: nowInSeconds() + 60,
      }),
    ],
  ])("returns undefined for %s", (_case, token) => {
    expect(verifier.verify(token)).toBeUndefined();
  });
});

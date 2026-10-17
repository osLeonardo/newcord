import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  KeyPackageCountEnvelope,
  KeyPackageGetEnvelope,
  KeyPackageUploadRequest,
  MlsPayload,
  ReplyEnvelope,
} from "../src/index.js";

const keyPackage = "AAECAwQFBgcICQ==";

describe("MlsPayload", () => {
  it.each(["AAAA", "AAE=", "AA==", keyPackage])("accepts %s", (payload) => {
    expect(Value.Check(MlsPayload, payload)).toBe(true);
  });

  it.each(["", "AAA", "AA-_", "AA=A", "A==="])("rejects %j", (payload) => {
    expect(Value.Check(MlsPayload, payload)).toBe(false);
  });
});

describe("KeyPackageUploadRequest", () => {
  it("accepts up to 20 ordinary packages and an optional last-resort one", () => {
    expect(
      Value.Check(KeyPackageUploadRequest, {
        keyPackages: Array.from({ length: 20 }, () => keyPackage),
        lastResort: keyPackage,
      }),
    ).toBe(true);
    expect(Value.Check(KeyPackageUploadRequest, { keyPackages: [] })).toBe(
      true,
    );
  });

  it.each([
    ["21 ordinary packages", { keyPackages: Array(21).fill(keyPackage) }],
    ["a package that is not base64", { keyPackages: ["not base64!"] }],
    ["no list", { lastResort: keyPackage }],
    ["a field not in the schema", { keyPackages: [], deviceId: "x" }],
  ])("rejects %s", (_case, body) => {
    expect(Value.Check(KeyPackageUploadRequest, body)).toBe(false);
  });
});

describe("keypackage.get and its reply", () => {
  it("names the Group and the Account to add", () => {
    expect(
      Value.Check(KeyPackageGetEnvelope, {
        v: 1,
        type: "keypackage.get",
        requestId: "r-1",
        groupId: "MgZoqEdt4EEfhsMd_7xNqw",
        username: "bruno",
      }),
    ).toBe(true);
  });

  it("answers with one package per Device", () => {
    expect(
      Value.Check(ReplyEnvelope, {
        v: 1,
        type: "reply",
        requestId: "r-1",
        ok: true,
        keyPackages: [{ deviceId: "mJMEbgts33NWbvGmNqkuEw", keyPackage }],
      }),
    ).toBe(true);
  });

  it("tells a Device how many ordinary packages it has left", () => {
    expect(
      Value.Check(KeyPackageCountEnvelope, {
        v: 1,
        type: "keypackage.count",
        count: 4,
      }),
    ).toBe(true);
  });
});

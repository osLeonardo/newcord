import { describe, expect, it } from "vitest";
import { iceConfigurationOf } from "../src/main/calls/ice-configuration";

const relay = {
  urls: [
    "stun:relay.example:3478",
    "turn:relay.example:3478",
    "turns:relay.example:443",
  ],
  username: "1760003600:mJMEbgts33NWbvGmNqkuEw",
  password: "c2VjcmV0",
  lifetimeSeconds: 3600,
} as const;

describe("iceConfigurationOf (10-m3-build step 5)", () => {
  it("uses the app's own relay for STUN, and for TURN with the fresh password", () => {
    expect(
      iceConfigurationOf({ ...relay, urls: [...relay.urls] }, false),
    ).toEqual({
      iceServers: [
        { urls: ["stun:relay.example:3478"] },
        {
          urls: ["turn:relay.example:3478", "turns:relay.example:443"],
          username: relay.username,
          credential: relay.password,
        },
      ],
      iceTransportPolicy: "all",
    });
  });

  it("allows only relayed connections with Hide my IP on (D14)", () => {
    expect(
      iceConfigurationOf({ ...relay, urls: [...relay.urls] }, true)
        .iceTransportPolicy,
    ).toBe("relay");
  });

  it("leaves out an empty STUN or TURN entry", () => {
    expect(
      iceConfigurationOf({ ...relay, urls: ["turn:relay.example:3478"] }, false)
        .iceServers,
    ).toHaveLength(1);
  });
});

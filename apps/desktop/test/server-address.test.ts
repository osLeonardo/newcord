import { describe, expect, it } from "vitest";
import {
  builtInServerAddresses,
  checkServerAddress,
  isAllowedServerAddress,
  serverAddressForMode,
} from "../src/build-config/server-address";

const releaseAddress = "https://newcord.example";
const developmentAddress = "http://localhost:3000";
const addresses = { development: developmentAddress, release: releaseAddress };

describe("isAllowedServerAddress", () => {
  it.each([
    "http://localhost:3000",
    "ws://localhost:3000/ws",
    "http://127.0.0.1:3000",
    "ws://127.0.0.1:3000/ws",
    "http://[::1]:3000",
    "HTTP://LOCALHOST:3000",
    "https://newcord.duckdns.org",
    "wss://newcord.duckdns.org/ws",
    "https://localhost:3000",
  ])("accepts %s", (address) => {
    expect(isAllowedServerAddress(address)).toBe(true);
  });

  it.each([
    "http://newcord.duckdns.org",
    "ws://newcord.duckdns.org/ws",
    "http://192.168.1.20:3000",
    "ws://10.0.0.5:3000",
    "http://localhost.example.com:3000",
    "http://localhost@example.com:3000",
    "http://127.0.0.1.nip.io:3000",
    "ftp://localhost:3000",
    "file:///C:/server",
    "localhost:3000",
    "not an address",
    "",
  ])("rejects %s", (address) => {
    expect(isAllowedServerAddress(address)).toBe(false);
  });
});

describe("checkServerAddress", () => {
  it("returns an allowed address unchanged", () => {
    expect(checkServerAddress(releaseAddress)).toBe(releaseAddress);
  });

  it("names the refused address and the allowed forms", () => {
    expect(() => checkServerAddress("http://newcord.duckdns.org")).toThrow(
      /"http:\/\/newcord\.duckdns\.org".*https.*wss/,
    );
  });
});

describe("serverAddressForMode", () => {
  it("uses the development address in development mode", () => {
    expect(serverAddressForMode("development", addresses)).toBe(
      developmentAddress,
    );
  });

  it.each(["production", "staging"])(
    "uses the release address in %s mode",
    (mode) => {
      expect(serverAddressForMode(mode, addresses)).toBe(releaseAddress);
    },
  );
});

describe("the built-in server addresses", () => {
  it("point development builds at the local server", () => {
    expect(builtInServerAddresses.development).toBe("http://localhost:3000");
  });

  it("are both allowed", () => {
    expect(isAllowedServerAddress(builtInServerAddresses.development)).toBe(
      true,
    );
    expect(isAllowedServerAddress(builtInServerAddresses.release)).toBe(true);
  });

  it("use https in release builds", () => {
    expect(builtInServerAddresses.release).toMatch(/^https:\/\//);
  });
});

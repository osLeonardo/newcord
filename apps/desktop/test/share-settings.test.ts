import { describe, expect, it } from "vitest";
import {
  preferCodec,
  screenShareEncoding,
} from "../src/renderer/src/calls/share-settings";

const codecs = [
  { mimeType: "video/VP8", clockRate: 90000 },
  { mimeType: "video/rtx", clockRate: 90000 },
  {
    mimeType: "video/H264",
    clockRate: 90000,
    sdpFmtpLine: "profile-level-id=42e01f",
  },
  { mimeType: "video/VP9", clockRate: 90000 },
  {
    mimeType: "video/H264",
    clockRate: 90000,
    sdpFmtpLine: "profile-level-id=640c1f",
  },
  { mimeType: "video/red", clockRate: 90000 },
];

describe("preferCodec (D11b, 10-m3-build step 8)", () => {
  it("puts every entry of the chosen codec first, in the order they came", () => {
    const ordered = preferCodec(codecs, "H264");

    expect(ordered.slice(0, 2)).toEqual([codecs[2], codecs[4]]);
  });

  it("keeps every other codec after it, so a viewer who cannot decode the first still sees the share", () => {
    const ordered = preferCodec(codecs, "VP9");

    expect(ordered[0]).toBe(codecs[3]);
    expect(ordered).toHaveLength(codecs.length);
    expect(new Set(ordered)).toEqual(new Set(codecs));
  });

  it("matches mime types without caring about case", () => {
    expect(
      preferCodec(
        [{ mimeType: "video/vp8" }, { mimeType: "video/h264" }],
        "H264",
      )[0],
    ).toEqual({ mimeType: "video/h264" });
  });

  it("leaves the order alone when the chosen codec is missing", () => {
    expect(preferCodec([codecs[0], codecs[3]], "H264")).toEqual([
      codecs[0],
      codecs[3],
    ]);
  });
});

describe("screenShareEncoding (10-m3-build Settings)", () => {
  it("caps each viewer at 1.5 Mbps and 30 frames per second", () => {
    expect(screenShareEncoding()).toEqual({
      maxBitrate: 1_500_000,
      maxFramerate: 30,
    });
  });
});

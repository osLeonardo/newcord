import { describe, expect, it } from "vitest";
import { createShareChooser } from "../src/main/calls/screen-share";

const sources = [
  {
    id: "screen:0:0",
    name: "Entire screen",
    thumbnail: "data:image/png;base64,AA",
    source: "S0",
  },
  {
    id: "window:1234:0",
    name: "Code editor",
    thumbnail: "data:image/png;base64,BB",
    source: "W1",
  },
];

function chooser(): ReturnType<typeof createShareChooser<string>> {
  return createShareChooser({ list: () => Promise.resolve(sources) });
}

describe("the share chooser (10-m3-build step 7)", () => {
  it("lists screens and windows with their thumbnails", async () => {
    expect(await chooser().listSources()).toEqual([
      {
        id: "screen:0:0",
        name: "Entire screen",
        kind: "screen",
        thumbnail: "data:image/png;base64,AA",
      },
      {
        id: "window:1234:0",
        name: "Code editor",
        kind: "window",
        thumbnail: "data:image/png;base64,BB",
      },
    ]);
  });

  it("answers the next screen-share request with the chosen source, once", async () => {
    const shares = chooser();
    await shares.listSources();

    expect(shares.choose("window:1234:0")).toBe(true);

    expect(shares.take()).toBe("W1");
    expect(shares.take()).toBeUndefined();
  });

  it("refuses a request nobody chose a source for, or a source that was not listed", async () => {
    const shares = chooser();
    expect(shares.take()).toBeUndefined();

    await shares.listSources();
    expect(shares.choose("screen:9:0")).toBe(false);
    expect(shares.take()).toBeUndefined();
  });

  it("forgets a choice when the sources are listed again", async () => {
    const shares = chooser();
    await shares.listSources();
    shares.choose("screen:0:0");

    await shares.listSources();

    expect(shares.take()).toBeUndefined();
  });
});

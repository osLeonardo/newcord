import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createKeyPackageStore,
  type KeyPackageStore,
} from "../src/key-packages/key-package-store.js";
import { openGroupTestDatabase } from "./support/group-test-database.js";

let database: Database.Database;
let keyPackages: KeyPackageStore;

beforeEach(() => {
  database = openGroupTestDatabase();
  keyPackages = createKeyPackageStore(database);
});

afterEach(() => {
  database.close();
});

const packageNamed = (name: string): Buffer => Buffer.from(name);

describe("store", () => {
  it("adds ordinary packages and returns the Device's ordinary count", () => {
    expect(
      keyPackages.store(
        "bruno-phone",
        [packageNamed("a"), packageNamed("b")],
        packageNamed("last"),
      ),
    ).toBe(2);
    expect(
      keyPackages.store("bruno-phone", [packageNamed("c")], undefined),
    ).toBe(3);
    expect(keyPackages.ordinaryCount("carla-phone")).toBe(0);
  });

  it("keeps one last-resort package, the newest", () => {
    keyPackages.store("bruno-phone", [], packageNamed("old"));
    keyPackages.store("bruno-phone", [], packageNamed("new"));

    expect(keyPackages.takeOne("bruno-phone")).toEqual({
      data: packageNamed("new"),
      lastResort: true,
    });
  });
});

describe("takeOne", () => {
  it("hands out ordinary packages oldest first, each once", () => {
    keyPackages.store(
      "bruno-phone",
      [packageNamed("a"), packageNamed("b")],
      packageNamed("last"),
    );

    expect(keyPackages.takeOne("bruno-phone")?.data).toEqual(packageNamed("a"));
    expect(keyPackages.takeOne("bruno-phone")?.data).toEqual(packageNamed("b"));
    expect(keyPackages.ordinaryCount("bruno-phone")).toBe(0);
  });

  it("hands out the last-resort package when no ordinary one is left, and keeps it", () => {
    keyPackages.store("bruno-phone", [], packageNamed("last"));

    expect(keyPackages.takeOne("bruno-phone")).toEqual({
      data: packageNamed("last"),
      lastResort: true,
    });
    expect(keyPackages.takeOne("bruno-phone")?.data).toEqual(
      packageNamed("last"),
    );
  });

  it("hands out nothing for a Device without packages", () => {
    expect(keyPackages.takeOne("carla-phone")).toBeUndefined();
  });
});

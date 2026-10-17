import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBlockStore,
  type BlockStore,
} from "../src/blocks/block-store.js";
import {
  GROUP_TEST_ACCOUNTS as accounts,
  openGroupTestDatabase,
} from "./support/group-test-database.js";

const alice = accounts.alice.userId;
const bruno = accounts.bruno.userId;
const carla = accounts.carla.userId;

let database: Database.Database;
let blocks: BlockStore;

beforeEach(() => {
  database = openGroupTestDatabase();
  blocks = createBlockStore(database);
});

afterEach(() => {
  database.close();
});

describe("the block store", () => {
  it("records a block in one direction only", () => {
    blocks.block(alice, bruno);

    expect(blocks.isBlocked(alice, bruno)).toBe(true);
    expect(blocks.isBlocked(bruno, alice)).toBe(false);
  });

  it("lists the blocked usernames, sorted", () => {
    blocks.block(alice, carla);
    blocks.block(alice, bruno);

    expect(blocks.blockedUsernamesOf(alice)).toEqual(["bruno", "carla"]);
    expect(blocks.blockedUsernamesOf(bruno)).toEqual([]);
  });

  it("is unchanged by blocking twice or unblocking someone not blocked", () => {
    blocks.block(alice, bruno);
    blocks.block(alice, bruno);
    blocks.unblock(alice, carla);

    expect(blocks.blockedUsernamesOf(alice)).toEqual(["bruno"]);
  });

  it("removes a block", () => {
    blocks.block(alice, bruno);

    blocks.unblock(alice, bruno);

    expect(blocks.isBlocked(alice, bruno)).toBe(false);
  });
});

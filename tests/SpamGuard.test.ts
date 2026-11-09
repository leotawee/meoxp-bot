import assert from "node:assert/strict";
import test from "node:test";
import { createSpamGuard } from "../src/lib/SpamGuard";

const base = { userId: "u1", guildId: "g1", imageCount: 4 };

test("one channel with 4 images does not trigger", () => {
  const guard = createSpamGuard();
  assert.equal(guard.check({ ...base, channelId: "c1", messageId: "m1", ts: 0 }), null);
});

test("4 images in 2 channels within window triggers and returns both messages", () => {
  const guard = createSpamGuard();
  guard.check({ ...base, channelId: "c1", messageId: "m1", ts: 0 });
  const hit = guard.check({ ...base, channelId: "c2", messageId: "m2", ts: 1000 });
  assert.deepEqual(hit?.map((e) => e.messageId), ["m1", "m2"]);
});

test("fewer than 4 images is ignored", () => {
  const guard = createSpamGuard();
  guard.check({ ...base, imageCount: 3, channelId: "c1", messageId: "m1", ts: 0 });
  assert.equal(guard.check({ ...base, imageCount: 3, channelId: "c2", messageId: "m2", ts: 1 }), null);
});

test("second channel after window expires does not trigger", () => {
  const guard = createSpamGuard();
  guard.check({ ...base, channelId: "c1", messageId: "m1", ts: 0 });
  assert.equal(guard.check({ ...base, channelId: "c2", messageId: "m2", ts: 61_000 }), null);
});

test("stale entries of other users are swept, not kept forever", () => {
  const guard = createSpamGuard();
  // Two users post albums once; neither trips the 2-channel threshold.
  guard.check({ ...base, channelId: "c1", messageId: "m1", ts: 0 });
  guard.check({ ...base, userId: "u2", channelId: "c1", messageId: "m2", ts: 0 });
  // Later activity by u3 sweeps u1/u2's stale entries out of the map.
  guard.check({ ...base, userId: "u3", channelId: "c1", messageId: "m3", ts: 61_000 });
  // u1's old entry is gone: second channel posted now (within window of this msg) can't revive it.
  const hit = guard.check({ ...base, userId: "u1", channelId: "c2", messageId: "m4", ts: 61_100 });
  assert.equal(hit, null);
});

test("different users are tracked separately", () => {
  const guard = createSpamGuard();
  guard.check({ ...base, channelId: "c1", messageId: "m1", ts: 0 });
  assert.equal(guard.check({ ...base, userId: "u2", channelId: "c2", messageId: "m2", ts: 1 }), null);
});

test("window is shared across guilds for the same user", () => {
  const guard = createSpamGuard();
  guard.check({ ...base, channelId: "c1", messageId: "m1", ts: 0 });
  const hit = guard.check({ ...base, guildId: "g2", channelId: "c9", messageId: "m2", ts: 1 });
  assert.equal(hit?.length, 2);
});

test("after a hit the window resets", () => {
  const guard = createSpamGuard();
  guard.check({ ...base, channelId: "c1", messageId: "m1", ts: 0 });
  guard.check({ ...base, channelId: "c2", messageId: "m2", ts: 1 });
  assert.equal(guard.check({ ...base, channelId: "c3", messageId: "m3", ts: 2 }), null);
});

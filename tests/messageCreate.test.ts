import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { Collection } from "discord.js";
import event from "../src/events/messageCreate";

function setup(opts: { inGuild: boolean; dm?: boolean }) {
  const ran: string[] = [];
  const command = {
    name: "server",
    description: "",
    dm: opts.dm,
    execute: () => void ran.push("server"),
  };
  const client = {
    commands: new Map([["server", command]]),
    aliases: new Map(),
  };
  const message = {
    author: { bot: false, id: "u1" },
    attachments: new Map(),
    id: "m1",
    channel: { id: "c1" },
    guild: opts.inGuild ? { id: "g1" } : null,
    content: "!!server",
    reply: () => {},
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal fakes for the handler
  (event.execute as any)(message, client);
  return ran;
}

test("DM runs a command that opts in with dm: true", () => {
  assert.deepEqual(setup({ inGuild: false, dm: true }), ["server"]);
});

test("DM ignores a command without dm opt-in", () => {
  assert.deepEqual(setup({ inGuild: false }), []);
});

test("guild message runs commands regardless of dm flag", () => {
  assert.deepEqual(setup({ inGuild: true }), ["server"]);
});

async function runCleanup(cleanup?: number) {
  const deleted: string[] = [];
  const fakeMsg = (id: string, authorId: string, refId?: string) => ({
    id,
    author: { id: authorId },
    reference: refId ? { messageId: refId } : null,
    delete: async () => void deleted.push(id),
  });
  const cache = new Collection([
    ["r1", fakeMsg("r1", "bot", "m1")], // bot reply to the command -> delete
    ["r2", fakeMsg("r2", "bot", "other")], // bot reply to something else -> keep
    ["r3", fakeMsg("r3", "u2", "m1")], // someone else's reply -> keep
  ]);
  const client = {
    user: { id: "bot" },
    commands: new Map([
      ["help", { name: "help", description: "", cleanup, execute: () => {} }],
    ]),
    aliases: new Map(),
  };
  const message = {
    ...fakeMsg("m1", "u1"),
    author: { bot: false, id: "u1" },
    attachments: new Map(),
    channel: { id: "c1", messages: { cache } },
    guild: { id: "g1" },
    content: "!!help",
    reply: () => {},
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal fakes for the handler
  (event.execute as any)(message, client);
  await new Promise((r) => setImmediate(r)); // let execute() settle
  mock.timers.tick(60_000);
  await new Promise((r) => setImmediate(r)); // let deletes run
  return deleted.sort();
}

test("cleanup deletes the command and only the bot's replies to it", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    assert.deepEqual(await runCleanup(60), ["m1", "r1"]);
  } finally {
    mock.timers.reset();
  }
});

test("commands without cleanup are left alone", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    assert.deepEqual(await runCleanup(undefined), []);
  } finally {
    mock.timers.reset();
  }
});

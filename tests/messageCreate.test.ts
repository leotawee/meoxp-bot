import assert from "node:assert/strict";
import test from "node:test";
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

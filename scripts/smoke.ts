// Smoke test: imports every module, calls pure functions, boots the API server.
// Run: node --import tsx scripts/smoke.ts
import assert from "node:assert";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dirname, "..", "src");
let passed = 0;
let failed = 0;
const step = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      failed++;
      console.error(`✖ ${name}: ${err?.message ?? err}`);
    });

const main = async () => {
  // 1. Every command module imports and has the Command shape
  const commands = readdirSync(join(src, "commands")).filter((f) => f.endsWith(".ts"));
  for (const file of commands) {
    await step(`command ${file}`, async () => {
      const mod = await import(join(src, "commands", file));
      const cmd = mod.default;
      assert(cmd, "missing default export");
      assert(typeof cmd.name === "string" && cmd.name, "missing name");
      assert(typeof cmd.execute === "function", "missing execute()");
      if (cmd.slash) {
        const json = cmd.slash.toJSON();
        assert(json.name === cmd.name, "slash name mismatch");
      }
    });
  }

  // 2. Every event module imports and has name + execute
  const events = readdirSync(join(src, "events")).filter((f) => f.endsWith(".ts"));
  for (const file of events) {
    await step(`event ${file}`, async () => {
      const mod = await import(join(src, "events", file));
      const ev = mod.default;
      assert(ev, "missing default export");
      assert(ev.name != null, "missing event name");
      assert(typeof ev.execute === "function", "missing execute()");
    });
  }

  // 3. Lib modules import + pure functions behave
  const lib = readdirSync(join(src, "lib")).filter((f) => f.endsWith(".ts"));
  for (const file of lib) {
    await step(`lib ${file}`, async () => {
      const mod = await import(join(src, "lib", file));
      assert(Object.keys(mod).length > 0, "no exports");
    });
  }

  await step("slashCommands: getSlashCommandDefinitions", async () => {
    const { getSlashCommandDefinitions } = await import(join(src, "lib", "slashCommands"));
    const defs = getSlashCommandDefinitions();
    assert(Array.isArray(defs) && defs.length > 0, "empty definitions");
    const json = defs.map((d) => d.toJSON());
    assert(json.every((j) => j.name && typeof j.description === "string"));
  });

  await step("helpMenu: embed + row build", async () => {
    const { createHelpEmbed, createHelpRow } = await import(join(src, "lib", "helpMenu"));
    assert(createHelpEmbed(), "no embed");
    assert(createHelpRow(), "no row");
  });

  await step("MoodenglinkManager: formatDuration/progressBar/trackToSong", async () => {
    const { formatDuration, createProgressBar, trackToSong } = await import(
      join(src, "lib", "MoodenglinkManager")
    );
    assert(typeof formatDuration(65_000) === "string", "formatDuration");
    assert(typeof createProgressBar(0.5) === "string", "createProgressBar");
    const song = trackToSong({ title: "t", duration: 65_000 } as any);
    assert(song.title === "t" && song.duration === 65, "trackToSong mapping");
  });

  await step("TtsManager: sanitize/detect/voice/url", async () => {
    const m = await import(join(src, "lib", "TtsManager"));
    assert(m.sanitizeTtsText("hi @everyone") === "hi", "sanitizeTtsText");
    assert(m.detectLanguage("สวัสดี") === "th", "detectLanguage");
    assert(typeof m.normalizeVoice("th-th") === "string", "normalizeVoice");
    const url = m.buildTtsServiceUrl({ text: "hi", voice: "th" } as any);
    assert(url.startsWith("http"), "buildTtsServiceUrl");
    assert(m.ttsManager, "ttsManager singleton");
  });

  await step("ThailandPostTracker: normalizeTrackingNumber", async () => {
    const { normalizeThailandPostTrackingNumber } = await import(
      join(src, "lib", "ThailandPostTracker")
    );
    const out = normalizeThailandPostTrackingNumber(" ey145587896th ");
    assert(out === "EY145587896TH", `got ${out}`);
  });

  await step("manager singletons constructed", async () => {
    const mods = await Promise.all([
      import(join(src, "lib", "AutoRoleManager")),
      import(join(src, "lib", "GoldPriceManager")),
      import(join(src, "lib", "ReactionRoleManager")),
    ]);
    for (const m of mods) assert(Object.values(m).some((v) => v && typeof v === "object"));
  });

  // 4. API server boots and serves all endpoints with a stub client
  await step("api: startApiServer + endpoints", async () => {
    const api = await import(join(src, "api"));
    const { Collection } = await import("discord.js");
    const stub: any = {
      uptime: 123_456,
      isReady: () => true,
      ping: 42,
      user: { tag: "smoke#0001", username: "smoke", displayAvatarURL: () => "http://x/y.png" },
      guilds: { cache: new Collection() },
      ws: { ping: 42 },
      manager: { players: new Map(), nodes: new Map(), get: () => null },
    };
    api.startApiServer(stub, 4599);
    const base = "http://127.0.0.1:4599";
    for (const path of ["/api/health", "/api/status", "/api/stats", "/api/queues", "/api/queue/g1"]) {
      const res = await fetch(base + path);
      assert(res.ok, `${path} -> ${res.status}`);
      await res.json();
    }
    const payload = api.getQueuePayload(stub, "g1");
    assert.deepStrictEqual(payload, { exists: false, nowPlaying: null, songs: [] });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main();

import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import { join } from "path";
import { readdirSync } from "fs";
import "dotenv/config";

import { ExtendedClient, Command, AnyEvent } from "./types";
import { createManager } from "./lib/MoodenglinkManager";
import { startApiServer } from "./api";

// Create Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
  // WHY: default caches grow unbounded on busy servers; sweep old entries to cap memory.
  // A sweeper filter returns true for entries to REMOVE. Never remove the bot's own member
  // (guild.members.me: autorole, hierarchy checks, GuildMember.manageable/moderatable throw
  // without it) or anyone in voice (channel.members drives the auto-leave logic).
  sweepers: {
    messages: { interval: 300, lifetime: 900 },
    users: { interval: 3600, filter: () => (user) => user.id !== user.client.user?.id },
    guildMembers: {
      interval: 3600,
      filter: () => (member) =>
        member.id !== member.client.user?.id && !member.voice.channelId,
    },
  },
}) as ExtendedClient;

// Initialize collections
client.commands = new Collection<string, Command>();

// Initialize Moodenglink (Lavalink)
client.manager = createManager(client);
client.on("raw", (d) => client.manager.updateVoiceState(d));
client.once(Events.ClientReady, () => client.manager.init(client.user!.id));

// Aliases collection
const aliases = new Collection<string, string>();

// Load Commands
const loadCommands = (): void => {
  const commandsPath = join(__dirname, "commands");

  try {
    const commandFiles = readdirSync(commandsPath).filter(
      (file) =>
        (file.endsWith(".ts") || file.endsWith(".js")) &&
        !file.endsWith(".d.ts"),
    );

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command: Command = require(filePath).default || require(filePath);

      if (command.name) {
        client.commands.set(command.name, command);
        console.log(`✅ Command loaded: ${command.name}`);

        if (command.aliases && Array.isArray(command.aliases)) {
          command.aliases.forEach((alias) => {
            aliases.set(alias, command.name);
          });
        }
      }
    }

    // Store aliases on client for access in messageCreate
    client.aliases = aliases;
  } catch (error) {
    console.error("Error loading commands:", error);
  }
};

// Load Events
const loadEvents = (): void => {
  const eventsPath = join(__dirname, "events");

  try {
    const eventFiles = readdirSync(eventsPath).filter(
      (file) =>
        (file.endsWith(".ts") || file.endsWith(".js")) &&
        !file.endsWith(".d.ts"),
    );

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const loadedModule = require(filePath);
      const event: AnyEvent = loadedModule.default || loadedModule;

      if (event.name) {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args, client));
        } else {
          client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`✅ Event loaded: ${event.name}`);
      }
    }
  } catch (error) {
    console.error("Error loading events:", error);
  }
};

// Start
(async () => {
  loadCommands();

  // Initialize NoSQL Managers first to ensure data is ready before events fire
  const { reactionRoleManager } = require("./lib/ReactionRoleManager");
  const { autoRoleManager } = require("./lib/AutoRoleManager");
  const { goldPriceManager } = require("./lib/GoldPriceManager");
  const { ttsManager } = require("./lib/TtsManager");
  try {
    await reactionRoleManager.init();
    await autoRoleManager.init();
    await goldPriceManager.init();
    await ttsManager.init();
    console.log("✅ NoSQL managers initialized successfully.");
  } catch (err) {
    console.error("❌ Failed to init managers:", err);
  }

  // Load events only after managers are ready
  loadEvents();

  if (!process.env.TOKEN) {
    console.error("❌ Error: TOKEN not found in .env");
    process.exit(1);
  }

  console.log("🚀 Starting bot...");
  await client.login(process.env.TOKEN);

  // Start API server for dashboard
  startApiServer(client, 4000);
})();

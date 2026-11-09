import { Events, type Message, PermissionFlagsBits } from "discord.js";
import { type ExtendedClient, defineEvent } from "../types";
import { punish, spamGuard } from "../lib/SpamGuard";
import { ttsManager } from "../lib/TtsManager";

const PREFIX = "!!";

// Deletes the command message and the bot's replies to it. Deleting the user's message needs
// ManageMessages; without it that delete just fails and the bot's replies still go.
function cleanupCommand(message: Message, client: ExtendedClient) {
  const replies = message.channel.messages.cache.filter(
    (m) => m.author.id === client.user?.id && m.reference?.messageId === message.id,
  );
  void Promise.allSettled([message.delete(), ...replies.map((m) => m.delete())]);
}

const event = defineEvent({
  name: Events.MessageCreate,
  execute(message: Message, client: ExtendedClient) {
    if (message.author.bot) return;

    // WHY: trusted staff are exempt; everyone else is checked for hacked-account image spam.
    if (
      message.guild &&
      !message.member?.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      const imageCount = [...message.attachments.values()].filter((a) =>
        a.contentType?.startsWith("image/"),
      ).length;
      const hit = spamGuard.check({
        userId: message.author.id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        ts: Date.now(),
        imageCount,
      });
      if (hit) {
        punish(client, message.author.id, hit).catch((err) =>
          console.error("[SpamGuard] punish error:", err),
        );
        return;
      }
    }

    // Handle bot commands
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const commandName = args.shift()?.toLowerCase();

      if (!commandName) return;

      // Get command from commands or aliases
      const aliasCommandName = client.aliases.get(commandName);
      const command =
        client.commands.get(commandName) ||
        (aliasCommandName ? client.commands.get(aliasCommandName) : undefined);

      if (!command) return;
      // WHY: most commands assume a guild (voice, roles, TTS); DMs reach only opt-in commands.
      if (!message.guild && !command.dm) return;

      try {
        const result = command.execute(message, args, client);
        const { cleanup } = command;
        if (cleanup && message.guild) {
          // WHY: start the timer after execute settles so slow commands' replies are caught.
          // unref(): a pending cleanup timer must not keep the process alive.
          Promise.resolve(result)
            .catch((error) => console.error("Command error:", error))
            .finally(() =>
              setTimeout(() => cleanupCommand(message, client), cleanup * 1000).unref(),
            );
        }
      } catch (error) {
        console.error("Command error:", error);
        message.reply("❌ เกิดข้อผิดพลาดค่ะ 🥺");
      }
      return;
    }

    if (!message.guild) return;

    // Auto-read TTS for non-command messages
    const guildId = message.guild.id;
    const guildConfig = ttsManager.getGuildConfig(guildId);
    const activeVoiceChannelId = ttsManager.getActiveVoiceChannel(guildId);

    if (
      guildConfig?.boundChannelId === message.channel.id &&
      activeVoiceChannelId
    ) {
      // WHY: Only read messages if sender is in the same voice channel as the bot
      const member = message.member;
      if (member?.voice.channelId === activeVoiceChannelId) {
        ttsManager
          .enqueue(client, {
            guildId,
            voiceChannelId: activeVoiceChannelId,
            textChannelId: message.channel.id,
            userId: message.author.id,
            text: message.content,
          })
          .catch((err) => {
            console.error("[TTS] Auto-read enqueue error:", err);
          });
      }
    }
  },
});

export default event;

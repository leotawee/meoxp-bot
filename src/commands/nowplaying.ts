import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { ExtendedClient, Command } from "../types";
import {
  trackToSong,
  formatDuration,
  createProgressBar,
} from "../lib/MoodenglinkManager";

const command: Command = {
  name: "nowplaying",
  cleanup: 120,
  aliases: ["np"],
  description: "Show the currently playing song with controls",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const player = client.manager.get(message.guild!.id);

    if (!player || !player.queue.current) {
      message.reply("❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ~");
      return;
    }

    const song = trackToSong(player.queue.current);
    const loopModes = ["➡️ ปิด", "🔂 เพลงเดียว", "🔁 ทั้ง Queue"];
    const loopEmojis = ["➡️", "🔂", "🔁"];

    // Get current position from player
    const position = player.position || 0;
    const duration = song.duration * 1000 || 0;
    const progressBar = createProgressBar(position, duration);
    const currentTime = formatDuration(position / 1000);
    const totalTime = song.durationInfo || formatDuration(song.duration);

    const embed = new EmbedBuilder()
      .setTitle("🎵 Now Playing")
      .setDescription(
        `**${song.title}**\n\n${progressBar}\n\`${currentTime} / ${totalTime}\``
      )
      .setColor(0x00ff88)
      .addFields(
        { name: "🎤 Artist", value: song.uploader || "Unknown", inline: true },
        {
          name: "👤 Requested by",
          value: song.requester || "Unknown",
          inline: true,
        },
        {
          name: "🔄 Loop",
          value: loopModes[player.repeatMode] || loopModes[0],
          inline: true,
        },
        {
          name: "📋 Queue",
          value: `${player.queue.length} songs`,
          inline: true,
        },
        { name: "🔊 Quality", value: "`OPUS • 128kbps`", inline: true }
      )
      .setFooter({ text: "💕 Use buttons below to control playback" });

    if (song.thumbnail) embed.setThumbnail(song.thumbnail);

    // Control buttons
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("np_prev")
        .setEmoji("⏮️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true), // No previous for now
      new ButtonBuilder()
        .setCustomId("np_pause")
        .setEmoji(player.paused ? "▶️" : "⏸️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("np_skip")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("np_stop")
        .setEmoji("⏹️")
        .setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("np_shuffle")
        .setEmoji("🔀")
        .setLabel("Shuffle")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("np_loop")
        .setEmoji(loopEmojis[player.repeatMode] || loopEmojis[0])
        .setLabel("Loop")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("np_queue")
        .setEmoji("📋")
        .setLabel("Queue")
        .setStyle(ButtonStyle.Secondary)
    );

    const reply = await message.reply({
      embeds: [embed],
      components: [row1, row2],
    });

    // Button collector
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000, // 2 minutes
    });

    collector.on("collect", async (interaction: ButtonInteraction) => {
      // Check if user is in voice channel
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member?.voice.channel) {
        await interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงค่ะ~",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const currentPlayer = client.manager.get(message.guild!.id);
      if (!currentPlayer || !currentPlayer.queue.current) {
        await interaction.reply({
          content: "❌ ไม่มีเพลงที่กำลังเล่นค่ะ~",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      switch (interaction.customId) {
        case "np_pause": {
          const isPaused = currentPlayer.paused;
          await currentPlayer.pause(!isPaused);
          await interaction.reply({
            content: isPaused
              ? "▶️ เล่นต่อแล้วค่ะ~"
              : "⏸️ หยุดชั่วคราวแล้วค่ะ~",
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        case "np_skip":
          await currentPlayer.skip();
          await interaction.reply({
            content: "⏭️ ข้ามเพลงแล้วค่ะ~",
            flags: MessageFlags.Ephemeral,
          });
          break;

        case "np_stop":
          await currentPlayer.stop();
          await interaction.reply({
            content: "⏹️ หยุดเล่นและล้าง Queue แล้วค่ะ~",
            flags: MessageFlags.Ephemeral,
          });
          break;

        case "np_shuffle":
          if (currentPlayer.queue.length > 1) {
            currentPlayer.queue.shuffle();
            await interaction.reply({
              content: "🔀 สับ Queue แล้วค่ะ~",
              flags: MessageFlags.Ephemeral,
            });
          } else {
            await interaction.reply({
              content: "❌ Queue มีไม่พอสับค่ะ~",
              flags: MessageFlags.Ephemeral,
            });
          }
          break;

        case "np_loop": {
          currentPlayer.setRepeatMode((currentPlayer.repeatMode + 1) % 3);
          const modes = [
            "➡️ ปิด Loop",
            "🔂 Loop เพลงเดียว",
            "🔁 Loop ทั้ง Queue",
          ];
          await interaction.reply({
            content: `${modes[currentPlayer.repeatMode]}`,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }

        case "np_queue": {
          const queueList = currentPlayer.queue
            .slice(0, 5)
            .map((item) => trackToSong(item as any));
          let queueText = "📋 **Queue:**\n";
          if (queueList.length === 0) {
            queueText += "ว่างเปล่าค่ะ~";
          } else {
            queueList.forEach((s, i) => {
              queueText += `${i + 1}. ${s.title}\n`;
            });
            if (currentPlayer.queue.length > 5) {
              queueText += `...และอีก ${currentPlayer.queue.length - 5} เพลง`;
            }
          }
          await interaction.reply({
            content: queueText,
            flags: MessageFlags.Ephemeral,
          });
          break;
        }
      }
    });

    collector.on("end", () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};

export default command;

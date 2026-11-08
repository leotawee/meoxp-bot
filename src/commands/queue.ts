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
import { ExtendedClient, Command, Song } from "../types";
import { trackToSong, formatDuration } from "../lib/MoodenglinkManager";
import type { Player } from "moodenglink";

// Calculate total duration of queue
function getTotalDuration(songs: Song[]): string {
  const total = songs.reduce((acc, song) => acc + (song.duration || 0), 0);
  return formatDuration(total);
}

// Live Song view of the player's queue
function getSongs(player: Player): Song[] {
  return player.queue.map((item) => trackToSong(item as any));
}

const SONGS_PER_PAGE = 10;

const command: Command = {
  name: "queue",
  cleanup: 120,
  aliases: ["q"],
  description: "Show the queue with pagination",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const player = client.manager.get(message.guild!.id);

    if (!player || (!player.queue.current && player.queue.length === 0)) {
      message.reply("❌ Queue ว่างเปล่าค่ะ~");
      return;
    }

    const loopModes = ["➡️ Off", "🔂 Song", "🔁 Queue"];
    let currentPage = 0;

    const createEmbed = (page: number) => {
      const songs = getSongs(player);
      const nowPlaying = player.queue.current
        ? trackToSong(player.queue.current)
        : null;
      const totalPages = Math.max(1, Math.ceil(songs.length / SONGS_PER_PAGE));

      const start = page * SONGS_PER_PAGE;
      const end = start + SONGS_PER_PAGE;
      const songsToShow = songs.slice(start, end);

      let description = "";

      // Now playing
      if (nowPlaying) {
        description += `🎵 **NOW PLAYING**\n`;
        description += `╰➤ [${nowPlaying.title}](${nowPlaying.url})\n`;
        description += `    └ \`${nowPlaying.durationInfo}\` • ${nowPlaying.requester}\n\n`;
      }

      // Queue
      if (songs.length > 0) {
        description += `📋 **QUEUE** (${songs.length} songs)\n`;
        description += `━━━━━━━━━━━━━━━\n`;

        songsToShow.forEach((song, index) => {
          const position = start + index + 1;
          const title =
            song.title.length > 40
              ? song.title.substring(0, 40) + "..."
              : song.title;
          description += `\`${position}.\` ${title}\n`;
          description += `    └ \`${song.durationInfo}\` • ${song.requester}\n`;
        });

        if (songs.length > SONGS_PER_PAGE) {
          description += `━━━━━━━━━━━━━━━\n`;
        }
      } else {
        description += `\n*Queue ว่างเปล่าค่ะ~ ใช้ \`!!play\` เพื่อเพิ่มเพลง*`;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Music Queue")
        .setDescription(description)
        .setColor(0xff69b4)
        .addFields(
          {
            name: "🔄 Loop",
            value: loopModes[player.repeatMode] || loopModes[0],
            inline: true,
          },
          {
            name: "⏱️ Total",
            value: getTotalDuration(songs),
            inline: true,
          },
          { name: "📄 Page", value: `${page + 1}/${totalPages}`, inline: true }
        )
        .setFooter({ text: "💕 Enjoy your music~" });

      if (nowPlaying?.thumbnail) {
        embed.setThumbnail(nowPlaying.thumbnail);
      }

      return embed;
    };

    const createButtons = (page: number) => {
      const totalPages = Math.max(
        1,
        Math.ceil(player.queue.length / SONGS_PER_PAGE)
      );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("queue_first")
          .setEmoji("⏮️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("queue_prev")
          .setEmoji("◀️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("queue_page")
          .setLabel(`${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("queue_next")
          .setEmoji("▶️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId("queue_last")
          .setEmoji("⏭️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1)
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("queue_shuffle")
          .setEmoji("🔀")
          .setLabel("Shuffle")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("queue_clear")
          .setEmoji("🗑️")
          .setLabel("Clear")
          .setStyle(ButtonStyle.Danger)
      );

      return player.queue.length > SONGS_PER_PAGE ? [row, row2] : [row2];
    };

    const reply = await message.reply({
      embeds: [createEmbed(currentPage)],
      components: createButtons(currentPage),
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
    });

    collector.on("collect", async (interaction: ButtonInteraction) => {
      const totalPages = Math.max(
        1,
        Math.ceil(player.queue.length / SONGS_PER_PAGE)
      );

      switch (interaction.customId) {
        case "queue_first":
          currentPage = 0;
          break;
        case "queue_prev":
          currentPage = Math.max(0, currentPage - 1);
          break;
        case "queue_next":
          currentPage = Math.min(totalPages - 1, currentPage + 1);
          break;
        case "queue_last":
          currentPage = totalPages - 1;
          break;
        case "queue_shuffle":
          if (player.queue.length > 1) {
            player.queue.shuffle();
            await interaction.reply({
              content: "🔀 Shuffled!",
              flags: MessageFlags.Ephemeral,
            });
            await reply.edit({
              embeds: [createEmbed(currentPage)],
              components: createButtons(currentPage),
            });
            return;
          }
          await interaction.reply({
            content: "❌ ไม่พอสับค่ะ~",
            flags: MessageFlags.Ephemeral,
          });
          return;
        case "queue_clear":
          player.queue.clear();
          await interaction.reply({
            content: "🗑️ ล้าง Queue แล้วค่ะ~",
            flags: MessageFlags.Ephemeral,
          });
          await reply.edit({
            embeds: [createEmbed(0)],
            components: [],
          });
          return;
      }

      await interaction.update({
        embeds: [createEmbed(currentPage)],
        components: createButtons(currentPage),
      });
    });

    collector.on("end", () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};

export default command;

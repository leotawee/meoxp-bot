import { type Message, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import type { Command, ExtendedClient } from "../types";
import {
  ttsManager,
  MIN_TTS_SPEED,
  MAX_TTS_SPEED,
  DEFAULT_TTS_SPEED,
  normalizeVoice,
} from "../lib/TtsManager";
import { getPlayer, destroyPlayer, isLavalinkReady } from "../lib/MoodenglinkManager";

const command: Command = {
  name: "tts",
  cleanup: 60,
  aliases: ["discordtts", "autotts"],
  description: "ระบบ Text-to-Speech และ Auto-read ประจำห้อง",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const guild = message.guild;
    if (!guild) return;

    const sub = args[0]?.toLowerCase();

    // 1. !!tts setup [#channel]
    if (sub === "setup") {
      const member = message.member;
      if (
        !member?.permissions.has(PermissionFlagsBits.ManageChannels) &&
        !member?.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        message.reply("❌ นายท่านต้องมีสิทธิ์ **Manage Channels** หรือ **Manage Server** ในการตั้งค่าห้องนี้นะคะ~");
        return;
      }

      const targetChannel =
        message.mentions.channels.first() ||
        (args[1] ? guild.channels.cache.get(args[1]) : message.channel);

      if (!targetChannel || !("isTextBased" in targetChannel) || !targetChannel.isTextBased()) {
        message.reply("❌ กรุณาระบุห้องข้อความที่ถูกต้องนะคะนายท่าน~");
        return;
      }

      await ttsManager.setBoundChannel(guild.id, targetChannel.id);
      message.reply(
        `✅ ผูกห้อง Auto-read TTS กับ <#${targetChannel.id}> เรียบร้อยแล้วค่ะ!\n💡 เมื่อนายท่านเข้าห้องเสียง ให้พิมพ์ \`!!tts join\` เพื่อเริ่มให้อ่านข้อความนะคะ~`
      );
      return;
    }

    // 2. !!tts disable / unset
    if (sub === "disable" || sub === "unset") {
      const member = message.member;
      if (
        !member?.permissions.has(PermissionFlagsBits.ManageChannels) &&
        !member?.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        message.reply("❌ นายท่านต้องมีสิทธิ์ **Manage Channels** หรือ **Manage Server** ในการตั้งค่าห้องนี้นะคะ~");
        return;
      }

      await ttsManager.setBoundChannel(guild.id, undefined);
      message.reply("⏹️ ยกเลิกการผูกห้อง Auto-read TTS ของเซิร์ฟเวอร์นี้เรียบร้อยค่ะ~");
      return;
    }

    // 3. !!tts join
    if (sub === "join") {
      const member = message.member;
      if (!member?.voice.channel) {
        message.reply("🎤 นายท่านต้องเข้าห้องเสียงก่อนนะคะ ถึงจะเรียกหนูไปอ่านได้~");
        return;
      }

      const guildConfig = ttsManager.getGuildConfig(guild.id);
      const boundChannelId = guildConfig?.boundChannelId || message.channel.id;

      // If no channel was explicitly bound yet, default to this channel
      if (!guildConfig?.boundChannelId) {
        await ttsManager.setBoundChannel(guild.id, message.channel.id);
      }

      if (!isLavalinkReady(client)) {
        message.reply("⏳ ระบบเสียงยังไม่พร้อมค่ะ กำลังเชื่อมต่อ Lavalink กรุณารอสักครู่นะคะ~ 🔧");
        return;
      }

      const player = await getPlayer(
        client,
        guild.id,
        member.voice.channel.id,
        boundChannelId
      );

      if (!player) {
        message.reply("😢 หนูเข้าห้องเสียงไม่ได้ค่ะนายท่าน รบกวนตรวจสอบสิทธิ์การเชื่อมต่อห้องเสียงนะคะ~");
        return;
      }

      ttsManager.setActiveVoiceChannel(guild.id, member.voice.channel.id);
      message.reply(
        `🎙️ เข้าห้องเสียง **${member.voice.channel.name}** แล้วค่ะ!\n💬 หนูจะคอยอ่านข้อความที่ส่งใน <#${boundChannelId}> โดยคนที่อยู่ในห้องเสียงเดียวกันให้อัตโนมัตินะคะ~`
      );
      return;
    }

    // 4. !!tts leave / stop
    if (sub === "leave" || sub === "stop") {
      const activeVoice = ttsManager.getActiveVoiceChannel(guild.id);
      const player = client.manager.get(guild.id);

      if (!activeVoice && !player) {
        message.reply("หนูไม่ได้อยู่ในห้องเสียงเพื่ออ่าน TTS อยู่แล้วค่ะนายท่าน~");
        return;
      }

      ttsManager.clearGuildSession(guild.id);
      destroyPlayer(client, guild.id);
      message.reply("👋 ออกจากห้องเสียงและปิดระบบ Auto-read เรียบร้อยแล้วค่ะ~ ไว้เรียกหนูใหม่นะคะ 💕");
      return;
    }

    // 5. !!tts voice [voice_name]
    if (sub === "voice") {
      const targetVoice = args[1]?.toLowerCase();
      if (!targetVoice) {
        const userConfig = ttsManager.getUserConfig(message.author.id);
        const currentVoice = userConfig?.voice || "Auto (ตรวจจับภาษาอัตโนมัติ)";
        message.reply(
          `🗣️ เสียงที่คุณใช้งานอยู่คือ: **${currentVoice}**\n💡 ภาษาที่รองรับ: \`th\` (ไทย), \`en\` (อังกฤษ), \`ja\` (ญี่ปุ่น), \`zh\` (จีน)\nเช่น \`!!tts voice ja\` หรือ \`!!tts voice auto\` เพื่อกลับไปตรวจจับอัตโนมัติค่ะ~`
        );
        return;
      }

      if (targetVoice === "auto" || targetVoice === "default" || targetVoice === "reset") {
        await ttsManager.setUserVoice(message.author.id, "");
        message.reply("✅ รีเซ็ตการตั้งค่าเสียงของคุณกลับเป็น **Auto (ตรวจจับภาษาอัตโนมัติ)** เรียบร้อยแล้วค่ะ~");
        return;
      }

      const normalized = normalizeVoice(targetVoice);
      await ttsManager.setUserVoice(message.author.id, normalized);
      message.reply(`✅ บันทึกเสียงพูดของคุณเป็น **${normalized}** เรียบร้อยแล้วค่ะ~`);
      return;
    }

    // 6. !!tts speed [value]
    if (sub === "speed") {
      const speedArg = args[1];
      if (!speedArg) {
        const userConfig = ttsManager.getUserConfig(message.author.id);
        const currentSpeed = userConfig?.speed ?? DEFAULT_TTS_SPEED;
        message.reply(
          `⚡ ความเร็วเสียงของคุณปัจจุบันคือ: **${currentSpeed}x**\n💡 ปรับความเร็วได้ตั้งแต่ \`${MIN_TTS_SPEED}\` ถึง \`${MAX_TTS_SPEED}\` เช่น \`!!tts speed 1.2\``
        );
        return;
      }

      const speedVal = parseFloat(speedArg);
      if (Number.isNaN(speedVal) || speedVal < MIN_TTS_SPEED || speedVal > MAX_TTS_SPEED) {
        message.reply(
          `❌ กรุณาระบุความเร็วระหว่าง **${MIN_TTS_SPEED}** ถึง **${MAX_TTS_SPEED}** นะคะ เช่น \`!!tts speed 1.2\``
        );
        return;
      }

      await ttsManager.setUserSpeed(message.author.id, speedVal);
      message.reply(`⚡ ปรับความเร็วเสียงของคุณเป็น **${speedVal}x** เรียบร้อยแล้วค่ะ~`);
      return;
    }

    // Default: Help menu
    const guildConfig = ttsManager.getGuildConfig(guild.id);
    const userConfig = ttsManager.getUserConfig(message.author.id);

    const embed = new EmbedBuilder()
      .setTitle("🎙️ ระบบ Text-to-Speech (Discord-TTS)")
      .setDescription(
        "ระบบอ่านข้อความในห้องแชทอัตโนมัติลงห้องเสียง และคำสั่งปรับแต่งเสียงส่วนตัวค่ะ"
      )
      .setColor(0x5865f2)
      .addFields(
        {
          name: "📌 การใช้งาน Auto-Read",
          value:
            "`!!tts setup [#channel]` - ผูกห้องข้อความสำหรับอ่าน TTS\n" +
            "`!!tts join` - ให้บอทเข้าห้องเสียงและเริ่มอ่าน\n" +
            "`!!tts leave` - สั่งให้บอทออกจากห้องและหยุดอ่าน\n" +
            "`!!tts disable` - ยกเลิกการผูกห้อง TTS",
        },
        {
          name: "⚙️ การตั้งค่าส่วนตัว",
          value:
            "`!!tts voice [th/en/ja/zh/auto]` - ตั้งค่าภาษาหรือเสียงพูดของคุณ\n" +
            "`!!tts speed [0.5-2.0]` - ปรับความเร็วในการพูดของคุณ\n" +
            "`!!say <ข้อความ>` - สั่งให้บอทพูดภาษาไทย\n" +
            "`!!saye <ข้อความ>` - สั่งให้บอทพูดภาษาอังกฤษ\n" +
            "`!!sayj <ข้อความ>` - สั่งให้บอทพูดภาษาญี่ปุ่น\n" +
            "`!!sayc <ข้อความ>` - สั่งให้บอทพูดภาษาจีน",
        },
        {
          name: "📊 สถานะปัจจุบันของเซิร์ฟเวอร์",
          value:
            `• ห้องที่ผูกไว้: ${guildConfig?.boundChannelId ? `<#${guildConfig.boundChannelId}>` : "*ยังไม่ได้ตั้งค่า*"}\n` +
            `• เสียงของคุณ: \`${userConfig?.voice || "Auto"}\` | ความเร็ว: \`${userConfig?.speed ?? DEFAULT_TTS_SPEED}x\``,
        }
      )
      .setFooter({ text: "meoxp-bot • Discord-TTS Powered" });

    message.reply({ embeds: [embed] });
  },
};

export default command;

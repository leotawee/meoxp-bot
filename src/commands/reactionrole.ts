import { Message, PermissionsBitField, EmbedBuilder } from "discord.js";
import { Command, ExtendedClient } from "../types";
import { reactionRoleManager } from "../lib/ReactionRoleManager";

function parseEmoji(emojiStr: string): string {
  const customMatch = emojiStr.match(/<a?:.+?:(\d+)>/);
  if (customMatch) return customMatch[1];
  return emojiStr;
}

const command: Command = {
  name: "reactionrole",
  cleanup: 60,
  aliases: ["rr"],
  description: "จัดการระบบ Reaction Role (ให้ยศจากอีโมจิ, เฉพาะ Admin)",
  execute: async (message: Message, args: string[], client: ExtendedClient) => {
    // 1. ตรวจสอบสิทธิ์ว่ามี Admin หรือไม่
    if (
      !message.member?.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      message.reply("❌ คุณไม่มีสิทธิ์ (Administrator) ในการใช้คำสั่งนี้ค่ะ");
      return;
    }

    if (!message.guild || !message.channel) return;

    const action = args[0]?.toLowerCase();

    if (!action || !["add", "remove", "list"].includes(action)) {
      message.reply(
        "❌ กรุณาระบุรูปคำสั่งให้ถูกต้อง:\n" +
          "`!!rr add <messageId> <emoji> <@role>`\n" +
          "`!!rr remove <messageId> <emoji>`\n" +
          "`!!rr list`",
      );
      return;
    }

    if (action === "add") {
      const messageId = args[1];
      const emojiArg = args[2];
      const roleArg = args[3];

      if (!messageId || !emojiArg || !roleArg) {
        message.reply(
          "❌ ข้อมูลไม่ครบถ้วน! รูปแบบ: `!!rr add <messageId> <emoji> <@role>`",
        );
        return;
      }

      const roleIdMatch = roleArg.match(/<@&(\d+)>/);
      const roleId = roleIdMatch ? roleIdMatch[1] : roleArg;

      const role = message.guild.roles.cache.get(roleId);
      if (!role) {
        message.reply(
          "❌ ไม่พบยศดังกล่าว (โปรดตรวจสอบอีกครั้งหรือใช้วิธี Mention) !",
        );
        return;
      }

      // ตรวจสอบ hierarchy เพื่อไม่ให้บอทติด error ตอนให้ยศ
      const botMember = message.guild.members.me;
      if (botMember) {
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          message.reply(
            "❌ บอทไม่มีสิทธิ์ Manage Roles กรุณาให้สิทธิ์แก่บอทในเซิร์ฟเวอร์ก่อนใช้งาน!",
          );
          return;
        }
        if (botMember.roles.highest.position <= role.position) {
          message.reply(
            "❌ ไม่สามารถจ่ายยศนี้ได้ เนื่องจากยศของบอทอยู่ต่ำกว่าหรือเท่ากับยศเป้าหมาย",
          );
          return;
        }
      }

      // เช็คว่ามีข้อความอยู่ในห้องนี้ไหม
      let targetMessage: Message;
      try {
        targetMessage = await message.channel.messages.fetch(messageId);
      } catch (err) {
        message.reply(
          "❌ ไม่พบข้อความดังกล่าวในห้องแชทนี้ (Message Not Found)",
        );
        return;
      }

      const parsedEmoji = parseEmoji(emojiArg);

      // ให้บอทลองกด react ด้วยอีโมจินั้น เพื่อให้ผู้ใช้กดตามได้ง่ายๆ และเป็นการเช็คว่าอีโมจิถูกต้อง
      try {
        await targetMessage.react(parsedEmoji);
      } catch (err) {
        message.reply(
          "❌ ไม่สามารถ react อีโมจินี้ได้ โปรดตรวจสอบว่าเป็นรูปที่ถูกต้องหรือไม่ (หรืออาจเป็นอีโมจิจากเซิร์ฟเวอร์อื่นที่บอทไม่มีสิทธิ์)",
        );
        return;
      }

      const success = await reactionRoleManager.addMapping({
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: messageId,
        emojiIdOrName: parsedEmoji,
        roleId: role.id,
      });

      if (success) {
        message.reply(
          `✅ ห้อยอีโมจิ ${emojiArg} เข้ากับข้อความ ${messageId} เพื่อมอบยศ ${role.name} สำเร็จ! (บันทึกข้อมูลลง NoSQL แล้ว)`,
        );
      } else {
        message.reply("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง NoSQL ค่ะ");
      }
    } else if (action === "remove") {
      const messageId = args[1];
      const emojiArg = args[2];

      if (!messageId || !emojiArg) {
        message.reply(
          "❌ ข้อมูลไม่ครบถ้วน! รูปแบบ: `!!rr remove <messageId> <emoji>`",
        );
        return;
      }

      const parsedEmoji = parseEmoji(emojiArg);
      const success = await reactionRoleManager.removeMapping(
        messageId,
        parsedEmoji,
      );

      if (success) {
        message.reply(
          `✅ นำการตั้งค่าสำหรับอีโมจิ ${emojiArg} ที่มีกับข้อความ ${messageId} ออกเรียบร้อยแล้ว (อัปเดต NoSQL แล้ว)`,
        );
      } else {
        message.reply("❌ ไม่พบการตั้งค่านี้ (หรืออาจจะถูกลบไปแล้ว)");
      }
    } else if (action === "list") {
      const mappings = reactionRoleManager.getGuildMappings(message.guild.id);

      if (mappings.length === 0) {
        message.reply("ℹ️ ห้องนี้ยังไม่มีการตั้งค่า Reaction Role เลยค่ะ");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Reaction Roles of ${message.guild.name}`)
        .setColor("Blue")
        .setDescription(
          mappings
            .map((m, i) => {
              // ถ้ายาวกว่า 16 น่าจะเป็น ID (Custom Emoji), ถ้าสั้นๆ คือ Unicode
              const displayEmoji =
                m.emojiIdOrName.length > 15
                  ? `<:emoji:${m.emojiIdOrName}>`
                  : m.emojiIdOrName;
              return `**${i + 1}.** MSG: \`${m.messageId}\` • Emoji: ${displayEmoji} ➡️ Role: <@&${m.roleId}>`;
            })
            .join("\n"),
        );

      message.reply({ embeds: [embed] });
    }
  },
};

export default command;

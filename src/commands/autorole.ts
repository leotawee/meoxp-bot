import { Message, PermissionsBitField, Role } from "discord.js";
import { Command, ExtendedClient } from "../types";
import { autoRoleManager } from "../lib/AutoRoleManager";

const command: Command = {
  name: "setup",
  cleanup: 60,
  aliases: ["autorole", "arole", "autojoin"],
  description: "ตั้งค่าให้บอทมอบยศอัตโนมัติให้สมาชิกใหม่",
  execute: async (message: Message, args: string[], client: ExtendedClient) => {
    if (
      !message.member?.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      message.reply("❌ คุณไม่มีสิทธิ์ (Administrator) ในการใช้คำสั่งนี้ค่ะ");
      return;
    }

    if (!message.guild) return;

    const action = args[0]?.toLowerCase();

    if (!action) {
      message.reply(
        "❌ กรุณาระบุรูปคำสั่งให้ถูกต้อง:\n" +
          "`!!setup <@role>`\n" +
          "`!!setup remove`\n" +
          "`!!setup list`",
      );
      return;
    }

    if (action === "remove") {
      const success = await autoRoleManager.removeConfig(message.guild.id);

      if (success) {
        message.reply("✅ ปิด Auto Role เรียบร้อยแล้วค่ะ");
      } else {
        message.reply("ℹ️ เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่า Auto Role ไว้");
      }
      return;
    }

    if (action === "list") {
      const config = autoRoleManager.getConfig(message.guild.id);

      if (!config) {
        message.reply("ℹ️ เซิร์ฟเวอร์นี้ยังไม่มีการตั้งค่า Auto Role เลยค่ะ");
        return;
      }

      message.reply(`📌 Auto Role ปัจจุบัน: <@&${config.roleId}>`);
      return;
    }

    const roleArg = args[0];

    if (!roleArg) {
      message.reply("❌ ข้อมูลไม่ครบถ้วน! รูปแบบ: `!!setup <@role>`");
      return;
    }

    const roleIdMatch = roleArg.match(/<@&(\d+)>/);
    const roleId = roleIdMatch ? roleIdMatch[1] : roleArg;
    const role: Role | undefined = message.guild.roles.cache.get(roleId);

    if (!role) {
      message.reply(
        "❌ ไม่พบยศดังกล่าว (โปรดตรวจสอบอีกครั้งหรือใช้วิธี Mention) !",
      );
      return;
    }

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

    const success = await autoRoleManager.setConfig({
      guildId: message.guild.id,
      roleId: role.id,
    });

    if (success) {
      message.reply(
        `✅ ตั้งค่า Auto Role สำเร็จแล้วค่ะ สมาชิกใหม่จะได้รับยศ <@&${role.id}> อัตโนมัติ`,
      );
    } else {
      message.reply("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง NoSQL ค่ะ");
    }
  },
};

export default command;

import { Message, PermissionsBitField, TextChannel } from "discord.js";
import { Command, ExtendedClient } from "../types";
import { goldPriceManager } from "../lib/GoldPriceManager";
import { fetchGoldPrice } from "../lib/GoldPriceFetcher";

const command: Command = {
  name: "setupgold",
  cleanup: 60,
  aliases: ["goldsetup", "goldprice"],
  description: "ตั้งค่าแจ้งเตือนราคาทองคำ 96.5% เมื่อราคาเปลี่ยนแปลง",
  execute: async (message: Message, args: string[], _client: ExtendedClient) => {
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
        "❌ กรุณาระบุรูปแบบคำสั่งให้ถูกต้อง:\n" +
          "`!!setupgold set <#channel> [@role]`\n" +
          "`!!setupgold remove`\n" +
          "`!!setupgold status`",
      );
      return;
    }

    if (action === "remove") {
      const success = await goldPriceManager.removeConfig(message.guild.id);
      message.reply(
        success
          ? "✅ ยกเลิกการแจ้งเตือนราคาทองเรียบร้อยแล้วค่ะ"
          : "ℹ️ เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าการแจ้งเตือนราคาทองไว้",
      );
      return;
    }

    if (action === "status") {
      const config = goldPriceManager.getConfig(message.guild.id);
      if (!config) {
        message.reply(
          "ℹ️ ยังไม่ได้ตั้งค่าการแจ้งเตือนราคาทองในเซิร์ฟเวอร์นี้ค่ะ\nใช้ `!!setupgold set <#channel>` เพื่อตั้งค่า",
        );
        return;
      }

      const price = await fetchGoldPrice();
      const priceText = price
        ? `\n💰 ราคาปัจจุบัน (96.5%): ซื้อ **${price.buy.toLocaleString("th-TH")}** / ขาย **${price.sell.toLocaleString("th-TH")}** บาท`
        : "";
      const roleText = config.roleId
        ? `\n📢 Mention: ${config.roleId === "everyone" ? "@everyone" : `<@&${config.roleId}>`}`
        : "";

      message.reply(
        `📌 ช่องแจ้งเตือน: <#${config.channelId}>${roleText}${priceText}`,
      );
      return;
    }

    if (action === "set") {
      const channelArg = args[1];
      if (!channelArg) {
        message.reply(
          "❌ กรุณาระบุช่องทาง: `!!setupgold set <#channel> [@role]`",
        );
        return;
      }

      const channelIdMatch = channelArg.match(/<#(\d+)>/);
      const channelId = channelIdMatch ? channelIdMatch[1] : channelArg;
      const channel = message.guild.channels.cache.get(channelId);

      if (!channel || !(channel instanceof TextChannel)) {
        message.reply("❌ ไม่พบช่องดังกล่าว หรือไม่ใช่ Text Channel ค่ะ");
        return;
      }

      let roleId: string | undefined;
      const roleArg = args[2];
      if (roleArg) {
        const isEveryone =
          roleArg === "@everyone" || roleArg === "everyone";
        if (isEveryone) {
          roleId = "everyone";
        } else {
          const roleIdMatch = roleArg.match(/<@&(\d+)>/);
          const rid = roleIdMatch ? roleIdMatch[1] : roleArg;
          const role = message.guild.roles.cache.get(rid);
          if (!role) {
            message.reply("❌ ไม่พบยศดังกล่าวค่ะ");
            return;
          }
          roleId = role.id;
        }
      }

      const success = await goldPriceManager.setConfig({
        guildId: message.guild.id,
        channelId: channel.id,
        ...(roleId ? { roleId } : {}),
      });

      const roleText =
        roleId === "everyone"
          ? " และจะ mention @everyone"
          : roleId
            ? ` และจะ mention <@&${roleId}>`
            : "";
      message.reply(
        success
          ? `✅ ตั้งค่าแจ้งเตือนราคาทองคำ 96.5% สำเร็จค่ะ\nจะส่งการแจ้งเตือนไปที่ <#${channel.id}>${roleText} เมื่อราคาเปลี่ยนแปลง`
          : "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลค่ะ",
      );
      return;
    }

    message.reply(
      "❌ คำสั่งไม่ถูกต้อง:\n" +
        "`!!setupgold set <#channel> [@role]`\n" +
        "`!!setupgold remove`\n" +
        "`!!setupgold status`",
    );
  },
};

export default command;

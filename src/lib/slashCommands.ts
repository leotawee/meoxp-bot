import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Message,
  PermissionsBitField,
  SlashCommandBuilder,
  MessageFlags,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { ExtendedClient } from "../types";
import { autoRoleManager } from "./AutoRoleManager";
import { goldPriceManager } from "./GoldPriceManager";
import { fetchGoldPrice } from "./GoldPriceFetcher";
import {
  fetchThailandPostTracking,
  ThailandPostTrackingError,
  type ThailandPostTrackingErrorCode,
} from "./ThailandPostTracker";
import {
  fetchFlashTracking,
  FlashTrackingError,
  type FlashTrackingErrorCode,
} from "./FlashTracker";
import {
  attachHelpCollector,
  createHelpEmbed,
  createHelpRow,
} from "./helpMenu";

export function getSlashCommandDefinitions(): (
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
)[] {
  return [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Open the help menu"),
    new SlashCommandBuilder()
      .setName("posttrack")
      .setDescription("ตรวจสอบสถานะพัสดุไปรษณีย์ไทย")
      .addStringOption((option) =>
        option
          .setName("tracking")
          .setDescription("หมายเลขพัสดุ เช่น EY145587896TH")
          .setRequired(true)
          .setMinLength(13)
          .setMaxLength(13),
      ),
    new SlashCommandBuilder()
      .setName("flashtrack")
      .setDescription("ตรวจสอบสถานะพัสดุ Flash Express")
      .addStringOption((option) =>
        option
          .setName("tracking")
          .setDescription("หมายเลขพัสดุ Flash Express")
          .setRequired(true)
          .setMinLength(6)
          .setMaxLength(20),
      ),
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Configure auto role for new members")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("Set the auto role for new members")
          .addRoleOption((option) =>
            option
              .setName("role")
              .setDescription("Role to assign automatically")
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("remove").setDescription("Remove auto role"),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("list").setDescription("Show current auto role"),
      ),
    new SlashCommandBuilder()
      .setName("setupgold")
      .setDescription("ตั้งค่าแจ้งเตือนราคาทองคำ 96.5% เมื่อราคาเปลี่ยนแปลง")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("ตั้งค่าช่องทางรับแจ้งเตือนราคาทอง")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("ช่องที่จะส่งการแจ้งเตือนราคาทอง")
              .setRequired(true),
          )
          .addRoleOption((option) =>
            option
              .setName("role")
              .setDescription("ยศที่จะถูก mention เมื่อราคาเปลี่ยน (optional)")
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("remove").setDescription("ยกเลิกการแจ้งเตือนราคาทอง"),
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("ดูการตั้งค่าแจ้งเตือนราคาทองปัจจุบัน"),
      ),
  ];
}

export async function registerSlashCommands(client: Client) {
  if (!client.application) return;

  const commands = getSlashCommandDefinitions().map((command) =>
    command.toJSON(),
  );

  const guildId = process.env.GUILD_ID;

  if (guildId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      await guild.commands.set(commands);
      return;
    }
  }

  await client.application.commands.set(commands);
}

async function sendHelpMenu(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [createHelpEmbed("home")],
    components: [createHelpRow()],
  });

  const reply = (await interaction.fetchReply()) as Message<boolean>;
  attachHelpCollector(reply, interaction.user.id);
}

async function handleAutoRoleSlash(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (
    !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
  ) {
    await interaction.reply({
      content: "❌ คุณไม่มีสิทธิ์ (Administrator) ในการใช้คำสั่งนี้ค่ะ",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "remove") {
    const success = await autoRoleManager.removeConfig(interaction.guild.id);

    await interaction.reply({
      content: success
        ? "✅ ปิด Auto Role เรียบร้อยแล้วค่ะ"
        : "ℹ️ เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่า Auto Role ไว้",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "list") {
    const config = autoRoleManager.getConfig(interaction.guild.id);

    await interaction.reply({
      content: config
        ? `📌 Auto Role ปัจจุบัน: <@&${config.roleId}>`
        : "ℹ️ เซิร์ฟเวอร์นี้ยังไม่มีการตั้งค่า Auto Role เลยค่ะ",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role = interaction.options.getRole("role", true);

  const botMember = interaction.guild.members.me;
  if (botMember) {
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      await interaction.reply({
        content:
          "❌ บอทไม่มีสิทธิ์ Manage Roles กรุณาให้สิทธิ์แก่บอทในเซิร์ฟเวอร์ก่อนใช้งาน!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (botMember.roles.highest.position <= role.position) {
      await interaction.reply({
        content:
          "❌ ไม่สามารถจ่ายยศนี้ได้ เนื่องจากยศของบอทอยู่ต่ำกว่าหรือเท่ากับยศเป้าหมาย",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const success = await autoRoleManager.setConfig({
    guildId: interaction.guild.id,
    roleId: role.id,
  });

  await interaction.reply({
    content: success
      ? `✅ ตั้งค่า Auto Role สำเร็จแล้วค่ะ สมาชิกใหม่จะได้รับยศ <@&${role.id}> อัตโนมัติ`
      : "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง NoSQL ค่ะ",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleGoldSetupSlash(
  interaction: ChatInputCommandInteraction,
) {
  if (!interaction.guild) return;

  if (
    !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
  ) {
    await interaction.reply({
      content: "❌ คุณไม่มีสิทธิ์ (Administrator) ในการใช้คำสั่งนี้ค่ะ",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "remove") {
    const success = await goldPriceManager.removeConfig(interaction.guild.id);
    await interaction.reply({
      content: success
        ? "✅ ยกเลิกการแจ้งเตือนราคาทองเรียบร้อยแล้วค่ะ"
        : "ℹ️ เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าการแจ้งเตือนราคาทองไว้",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "status") {
    const config = goldPriceManager.getConfig(interaction.guild.id);
    if (!config) {
      await interaction.reply({
        content: "ℹ️ ยังไม่ได้ตั้งค่าการแจ้งเตือนราคาทองในเซิร์ฟเวอร์นี้ค่ะ\nใช้ `/setupgold set` เพื่อตั้งค่า",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const price = await fetchGoldPrice();
    const priceText = price
      ? `\n\n💰 ราคาปัจจุบัน (96.5%): ซื้อ **${price.buy.toLocaleString("th-TH")}** / ขาย **${price.sell.toLocaleString("th-TH")}** บาท`
      : "";

    const roleText = config.roleId
      ? `\n📢 Mention: ${config.roleId === "everyone" ? "@everyone" : `<@&${config.roleId}>`}`
      : "";
    await interaction.editReply({
      content:
        `📌 ช่องแจ้งเตือน: <#${config.channelId}>${roleText}${priceText}`,
    });
    return;
  }

  // subcommand === "set"
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role");

  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "❌ กรุณาเลือกช่องข้อความ (Text Channel) เท่านั้นค่ะ",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const success = await goldPriceManager.setConfig({
    guildId: interaction.guild.id,
    channelId: channel.id,
    ...(role ? { roleId: role.id } : {}),
  });

  const roleText = role ? ` และจะ mention <@&${role.id}>` : "";
  await interaction.reply({
    content: success
      ? `✅ ตั้งค่าแจ้งเตือนราคาทองคำ 96.5% สำเร็จค่ะ\nจะส่งการแจ้งเตือนไปที่ <#${channel.id}>${roleText} เมื่อราคาเปลี่ยนแปลง`
      : "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลค่ะ",
    flags: MessageFlags.Ephemeral,
  });
}

const TRACKING_ERROR_MESSAGES: Record<ThailandPostTrackingErrorCode, string> = {
  INVALID_TRACKING_NUMBER:
    "❌ รูปแบบหมายเลขพัสดุไม่ถูกต้อง ตัวอย่าง: `EY145587896TH`",
  MISSING_TOKEN: "❌ ระบบยังไม่ได้ตั้งค่า `THAILAND_POST_TOKEN`",
  UNAUTHORIZED: "❌ Thailand Post ไม่ยอมรับโทเค็นของระบบ กรุณาแจ้งผู้ดูแล",
  RATE_LIMITED: "⏳ โควตา Thailand Post API วันนี้เต็มแล้ว กรุณาลองใหม่ภายหลัง",
  NOT_FOUND: "🔎 ไม่พบข้อมูลของหมายเลขพัสดุนี้",
  TIMEOUT: "⏳ Thailand Post API ตอบกลับช้าเกินไป กรุณาลองใหม่อีกครั้ง",
  UPSTREAM_FAILURE: "❌ ไม่สามารถตรวจสอบสถานะพัสดุได้ในขณะนี้",
  INVALID_RESPONSE: "❌ Thailand Post API ส่งข้อมูลกลับมาไม่ถูกต้อง",
};

const FLASH_TRACKING_ERROR_MESSAGES: Record<FlashTrackingErrorCode, string> = {
  INVALID_TRACKING_NUMBER: "❌ กรุณาระบุหมายเลขพัสดุ",
  RATE_LIMITED: "⏳ ระบบ Flash tracking ถูกจำกัดการใช้งานชั่วคราว ลองใหม่ภายหลัง",
  NOT_FOUND: "🔎 ไม่พบข้อมูลของหมายเลขพัสดุนี้",
  TIMEOUT: "⏳ Flash tracking API ตอบกลับช้าเกินไป กรุณาลองใหม่อีกครั้ง",
  UPSTREAM_FAILURE: "❌ ไม่สามารถตรวจสอบสถานะพัสดุได้ในขณะนี้",
  INVALID_RESPONSE: "❌ Flash tracking API ส่งข้อมูลกลับมาไม่ถูกต้อง",
};

async function handleFlashTrackSlash(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await fetchFlashTracking(
      interaction.options.getString("tracking", true),
    );
    const history = result.events
      .slice(-5)
      .reverse()
      .map((event) => `**${event.routedAt ?? "ไม่ระบุเวลา"}**\n${event.message ?? "ไม่มีรายละเอียด"}`)
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0xfacc15)
      .setTitle(`📦 ${result.trackingNo}`)
      .setDescription(
        `${result.srcProvince ?? "ไม่ระบุ"} ➜ ${result.dstProvince ?? "ไม่ระบุ"}`,
      )
      .addFields(
        {
          name: "สถานะ",
          value: truncate(result.statusText ?? "ไม่ระบุ", 1_024),
          inline: true,
        },
        {
          name: "ผู้รับพัสดุ",
          value: truncate(result.signer ?? "รอนำส่ง", 1_024),
          inline: true,
        },
        { name: "📋 ประวัติล่าสุด", value: truncate(history || "ไม่มีข้อมูล", 1_024) },
      )
      .setFooter({ text: "ข้อมูลจาก Flash Express" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const code =
      error instanceof FlashTrackingError ? error.code : "UPSTREAM_FAILURE";
    // WHY: log only the error class; tracking numbers may be PII.
    console.error(`[FlashTracker] request failed: ${code}`);
    await interaction.editReply({ content: FLASH_TRACKING_ERROR_MESSAGES[code] });
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}

async function handlePostTrackSlash(
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await fetchThailandPostTracking(
      interaction.options.getString("tracking", true),
    );
    const latest = result.events.at(-1)!;
    const latestDetail =
      latest.detail ?? latest.statusDescription ?? latest.status ?? "ไม่มีรายละเอียด";
    const location = [latest.location, latest.postcode]
      .filter(Boolean)
      .join(" ");
    const history = result.events
      .slice(-5)
      .reverse()
      .map((event) => {
        const detail =
          event.detail ?? event.statusDescription ?? event.status ?? "ไม่มีรายละเอียด";
        return `**${event.statusDate ?? "ไม่ระบุเวลา"}**\n${detail}`;
      })
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0xed1c24)
      .setTitle(`📦 ${result.barcode}`)
      .setURL(
        `https://track.thailandpost.co.th/?trackNumber=${encodeURIComponent(result.barcode)}`,
      )
      .setDescription(truncate(latestDetail, 4_096))
      .addFields(
        {
          name: "📍 สถานที่",
          value: truncate(location || "ไม่ระบุ", 1_024),
          inline: true,
        },
        {
          name: "🕐 อัปเดตล่าสุด",
          value: truncate(latest.statusDate ?? "ไม่ระบุ", 1_024),
          inline: true,
        },
        {
          name: "📋 ประวัติล่าสุด",
          value: truncate(history, 1_024),
        },
      )
      .setFooter({
        text: result.quota
          ? `Thailand Post API วันนี้ ${result.quota.used}/${result.quota.limit}`
          : "ข้อมูลจาก Thailand Post",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const code =
      error instanceof ThailandPostTrackingError
        ? error.code
        : "UPSTREAM_FAILURE";
    // WHY: log only the error class; tracking numbers and upstream bodies may contain PII.
    console.error(`[ThailandPostTracker] request failed: ${code}`);
    await interaction.editReply({ content: TRACKING_ERROR_MESSAGES[code] });
  }
}

export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  _client: ExtendedClient,
) {
  if (interaction.commandName === "help") {
    await sendHelpMenu(interaction);
    return;
  }

  if (interaction.commandName === "setup") {
    await handleAutoRoleSlash(interaction);
    return;
  }

  if (interaction.commandName === "setupgold") {
    await handleGoldSetupSlash(interaction);
    return;
  }

  if (interaction.commandName === "posttrack") {
    await handlePostTrackSlash(interaction);
  }

  if (interaction.commandName === "flashtrack") {
    await handleFlashTrackSlash(interaction);
  }
}

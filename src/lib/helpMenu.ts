import {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  Message,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  MessageFlags,
} from "discord.js";

export const helpCategories: Record<
  string,
  { title: string; description: string; fields?: any[] }
> = {
  home: {
    title: "Help Menu",
    description: "เลือกหมวดด้านล่างเพื่อดูคำสั่งที่ใช้บ่อยที่สุดแบบสั้น ๆ",
    fields: [
      {
        name: "Start here",
        value: "ใช้ `!!help` หรือ `/help` เพื่อเปิดเมนูนี้",
        inline: false,
      },
      {
        name: "Quick actions",
        value: "`!!play` `!!skip` `!!queue` `!!say` `!!status`",
        inline: false,
      },
    ],
  },
  music: {
    title: "Music",
    description: "คำสั่งหลักสำหรับเปิดเพลงและควบคุมการเล่น",
    fields: [
      { name: "Play", value: "`!!play <name/URL>`", inline: true },
      { name: "Control", value: "`!!skip` `!!stop` `!!resume`", inline: true },
      { name: "Queue", value: "`!!queue` `!!np` `!!shuffle`", inline: true },
      {
        name: "Extras",
        value: "`!!loop` `!!clear` `!!join` `!!leave` `!!panel`",
        inline: false,
      },
    ],
  },
  tts: {
    title: "TTS",
    description: "ระบบอ่านข้อความ Text-to-Speech และ Auto-read ประจำห้องแชท",
    fields: [
      { name: "Auto-read", value: "`!!tts setup` `!!tts join` `!!tts leave`", inline: true },
      { name: "Customization", value: "`!!tts voice` `!!tts speed`", inline: true },
      { name: "Quick Speak", value: "`!!say <ไทย>` `!!saye <English>` `!!sayj <日本語>` `!!sayc <中文>`", inline: false },
    ],
  },
  admin: {
    title: "Admin",
    description: "คำสั่งสำหรับตั้งค่าระบบและเครื่องมือดูแลเซิร์ฟเวอร์",
    fields: [
      { name: "Moderation", value: "`!!purge <count>`", inline: true },
      { name: "Bot status", value: "`!!status`", inline: true },
      {
        name: "Reaction roles",
        value: "`!!rr add/remove/list`",
        inline: false,
      },
      {
        name: "Auto role",
        value: "`!!setup <role>` / `!!setup remove` / `!!setup list`\n`/setup set` / `/setup remove` / `/setup list`",
        inline: false,
      },
      {
        name: "Gold price alert (ราคาทอง 96.5%)",
        value:
          "`!!setupgold set <#channel> [@role]` / `!!setupgold remove` / `!!setupgold status`\n" +
          "`/setupgold set` / `/setupgold remove` / `/setupgold status`",
        inline: false,
      },
    ],
  },
};

export function createHelpEmbed(category: string): EmbedBuilder {
  const data = helpCategories[category] || helpCategories.home;

  const embed = new EmbedBuilder()
    .setTitle(data.title)
    .setDescription(data.description)
    .setColor(0x1f2937)
    .setFooter({ text: "Prefix: !! | Slash: /" });

  if (data.fields) {
    embed.addFields(data.fields);
  }

  return embed;
}

export function createHelpRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help_menu")
      .setPlaceholder("Select a category")
      .addOptions([
        { label: "Home", value: "home" },
        { label: "Music", value: "music" },
        { label: "TTS", value: "tts" },
        { label: "Admin", value: "admin" },
      ]),
  );
}

export function attachHelpCollector(reply: Message<boolean>, ownerId: string) {
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60000,
  });

  collector.on("collect", async (interaction: StringSelectMenuInteraction) => {
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "❌ นี่ไม่ใช่เมนูของคุณค่ะ",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const category = interaction.values[0];
    await interaction.update({ embeds: [createHelpEmbed(category)] });
  });

  collector.on("end", () => {
    reply.edit({ components: [] }).catch(() => {});
  });
}

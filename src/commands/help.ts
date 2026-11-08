import { Message } from "discord.js";
import { Command, ExtendedClient } from "../types";
import {
  attachHelpCollector,
  createHelpEmbed,
  createHelpRow,
} from "../lib/helpMenu";

const command: Command = {
  name: "help",
  cleanup: 60,
  description: "Show the bot help menu",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient,
  ): Promise<void> {
    const reply = await message.reply({
      embeds: [createHelpEmbed("home")],
      components: [createHelpRow()],
    });

    attachHelpCollector(reply, message.author.id);
  },
};

export default command;

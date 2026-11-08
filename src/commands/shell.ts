import { Message } from "discord.js";
import { exec } from "child_process";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "shell",
  cleanup: 60,
  aliases: ["exec", "sh"],
  description: "Execute shell command",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    // Owner check
    if (!process.env.OWNER_ID || message.author.id !== process.env.OWNER_ID) {
      message.reply("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏");
      return;
    }

    const cmd = args.join(" ");
    if (!cmd) {
      message.reply("❌ กรุณาระบุคำสั่งค่ะ~");
      return;
    }

    const msg = await message.reply("⏳ กำลังรันคำสั่ง...");

    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      let output = stdout || stderr || "No output";
      if (error) {
        output = `Error: ${error.message}\n${output}`;
      }

      // Truncate if too long
      if (output.length > 1900) {
        output = output.substring(0, 1900) + "\n...truncated";
      }

      msg.edit(`\`\`\`\n${output}\n\`\`\``);
    });
  },
};

export default command;

import { readFile } from "node:fs/promises";
import { Message, EmbedBuilder } from "discord.js";
import * as si from "systeminformation";
import { ExtendedClient, Command } from "../types";

// os-release values are shell-style: double-quoted (with backslash escapes),
// single-quoted, or bare.
export function parsePrettyName(osRelease: string): string | undefined {
  const m = osRelease.match(
    /^PRETTY_NAME=(?:"((?:[^"\\\n]|\\.)*)"|'([^'\n]*)'|([^\s"']*))\s*$/m,
  );
  const value = m?.[1]?.replace(/\\(.)/g, "$1") ?? m?.[2] ?? m?.[3];
  return value || undefined;
}

// WHY: the bot runs in Docker, so si.osInfo() reports the container (container-ID
// hostname, base-image distro). docker-compose mounts the host's files under /host;
// fall back to the container values when they are absent (e.g. local dev).
async function hostInfo(fallback: { hostname: string; distro: string }) {
  const read = (path: string) => readFile(path, "utf8").catch(() => "");
  const [hostname, osRelease] = await Promise.all([
    read("/host/hostname"),
    read("/host/os-release"),
  ]);
  return {
    hostname: hostname.trim() || fallback.hostname,
    distro: parsePrettyName(osRelease) || fallback.distro,
  };
}

const command: Command = {
  name: "server",
  cleanup: 60,
  aliases: ["status", "sysinfo", "sys"],
  description: "Show detailed server status",
  dm: true,
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    // Owner check
    if (message.author.id !== process.env.OWNER_ID) {
      message.reply("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏");
      return;
    }

    const msg = await message.reply("🔄 กำลังเก็บข้อมูล Server...");

    try {
      // WHY: si.currentLoad() diffs /proc/stat against its previous call; the first
      // call measures since boot (or since the last !!server run). Prime it, then
      // sample over 500ms to get the actual current load.
      // ponytail: si keeps one module-level baseline, so two !!server runs within
      // 500ms skew each other's reading. Owner-only command → accepted; share one
      // in-flight sample promise if anything else starts calling currentLoad().
      await si.currentLoad();
      await si.disksIO();
      await si.networkStats();
      await new Promise((resolve) => setTimeout(resolve, 500));

      const [cpu, cpuInfo, mem, osInfo, disk, load, net, netIface, io] = await Promise.all([
        si.cpuCurrentSpeed(),
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.fsSize(),
        si.currentLoad(),
        si.networkStats(),
        si.networkInterfaceDefault(),
        si.disksIO(),
      ]);
      // WHY: net[0] can be a VPN tunnel (utun); prefer the default route's NIC
      const net0 = net.find((n) => n.iface === netIface) || net[0];
      const host = await hostInfo(osInfo);

      const uptime = si.time().uptime;
      const processUptime = process.uptime();

      // Format uptime
      function formatUptime(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return days > 0 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
      }

      // Progress bar
      function createProgressBar(
        current: number,
        total: number,
        length: number
      ): string {
        // Clamp: a negative or >length fill would make String.repeat throw RangeError.
        const ratio = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0;
        const filled = Math.round(ratio * length);
        const empty = length - filled;
        return "█".repeat(filled) + "░".repeat(empty);
      }

      const ramUsed = (mem.active / 1024 / 1024 / 1024).toFixed(2);
      const ramTotal = (mem.total / 1024 / 1024 / 1024).toFixed(2);
      const cpuPercent = load.currentLoad.toFixed(1);
      // WHY: host RAM above is the whole machine; show the bot's own usage separately
      // since the container is capped (docker-compose memory limit).
      const botRssMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);

      const diskUsed = (disk[0]?.used || 0) / 1024 / 1024 / 1024;
      const diskTotal = (disk[0]?.size || 1) / 1024 / 1024 / 1024;

      // Bot stats
      const guilds = client.guilds.cache.size;
      const activeQueues = client.manager?.players.size || 0;

      const fmtRate = (b: number) =>
        b > 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${(b / 1024).toFixed(0)} KB/s`;
      const fmtTotal = (b: number) =>
        b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`;
      const heap = process.memoryUsage();
      const lavalink = client.manager
        ? [...client.manager.nodes.values()].map(
            (n) => `${n.id}: ${n.connected ? "🟢" : "🔴"}`,
          ).join(" ") || "—"
        : "—";

      const embed = new EmbedBuilder()
        .setTitle(`🖥️ Server Status`)
        .setColor(0x00ff88)
        .setDescription(`**${host.hostname}** • ${host.distro}`)
        .addFields(
          {
            name: "💻 CPU",
            value: `\`\`\`${cpuInfo.manufacturer} ${cpuInfo.brand}\n${
              cpuInfo.cores
            } cores @ ${cpu.avg || cpu.min} GHz\n${createProgressBar(
              load.currentLoad,
              100,
              10
            )} ${cpuPercent}%\`\`\``,
            inline: false,
          },
          {
            name: "🧠 RAM (host)",
            value: `\`\`\`${ramUsed} / ${ramTotal} GB\n${createProgressBar(
              mem.active,
              mem.total,
              10
            )}\nSwap: ${(mem.swapused / 1024 / 1024 / 1024).toFixed(2)} / ${(mem.swaptotal / 1024 / 1024 / 1024).toFixed(2)} GB\nBot: RSS ${botRssMb} MB • Heap ${((heap.heapUsed / 1024 / 1024) | 0)}/${((heap.heapTotal / 1024 / 1024) | 0)} MB\`\`\``,
            inline: false,
          },
          {
            name: "💾 Disk",
            value: `\`\`\`${diskUsed.toFixed(1)} / ${diskTotal.toFixed(
              1
            )} GB\n${createProgressBar(diskUsed, diskTotal, 10)}\nR: ${(io?.rIO_sec ?? 0).toFixed(0)} KB/s  W: ${(io?.wIO_sec ?? 0).toFixed(0)} KB/s\`\`\``,
            inline: false,
          },
          {
            name: "🌐 Network",
            value: `\`\`\`↑ ${fmtRate(net0?.tx_sec || 0)}  ↓ ${fmtRate(net0?.rx_sec || 0)}\nTotal ↑ ${fmtTotal(net0?.tx_bytes || 0)}  ↓ ${fmtTotal(net0?.rx_bytes || 0)}\`\`\``,
            inline: false,
          },
          {
            name: "⏱️ Uptime",
            value: `Server: \`${formatUptime(uptime)}\`\nBot: \`${formatUptime(
              processUptime
            )}\``,
            inline: true,
          },
          {
            name: "🤖 Bot",
            value: `Servers: \`${guilds}\`\nQueues: \`${activeQueues}\`\nAPI: \`${client.ws.ping ?? "?"}ms\`\nLavalink: \`${lavalink}\``,
            inline: true,
          },
          {
            name: "🔧 Runtime",
            value: `Node.js ${process.version}`,
            inline: true,
          }
        )
        .setFooter({ text: "🟢 Server Online" })
        .setTimestamp();

      await msg.edit({ content: "", embeds: [embed] });
    } catch (error) {
      console.error(error);
      msg.edit(`❌ เกิดข้อผิดพลาด: ${(error as Error).message}`);
    }
  },
};

export default command;

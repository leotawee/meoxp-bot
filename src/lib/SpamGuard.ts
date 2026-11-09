import type { Client } from "discord.js";

export interface SpamEntry {
  userId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  ts: number;
}

interface Options {
  windowMs?: number;
  minChannels?: number;
  minImages?: number;
}

const TIMEOUT_MS = 60 * 60 * 1000;

// WHY: a hacked account blasts N images into every channel it can reach. Real users
// rarely post a 4-image album into 2+ channels within a minute, so that is the signal.
// Keyed by userId across guilds so the second server is caught on its first message.
// TECH DEBT: in-memory, lost on restart; fine for a single instance.
export function createSpamGuard({
  windowMs = 60_000,
  minChannels = 2,
  minImages = 4,
}: Options = {}) {
  const byUser = new Map<string, SpamEntry[]>();

  return {
    /** Returns the user's tracked messages when the pattern is hit, else null. */
    check(input: SpamEntry & { imageCount: number }): SpamEntry[] | null {
      if (input.imageCount < minImages) return null;

      const { imageCount: _, ...entry } = input;
      // WHY: users who post albums once and never trip the threshold otherwise
      // keep entries forever; sweep the whole map so it can't grow unbounded.
      for (const [userId, entries] of byUser) {
        const kept = entries.filter((e) => entry.ts - e.ts <= windowMs);
        if (kept.length === 0) byUser.delete(userId);
        else byUser.set(userId, kept);
      }
      const fresh = (byUser.get(entry.userId) ?? []).slice();
      fresh.push(entry);

      if (new Set(fresh.map((e) => e.channelId)).size >= minChannels) {
        byUser.delete(entry.userId);
        return fresh;
      }
      byUser.set(entry.userId, fresh);
      return null;
    },
  };
}

export const spamGuard = createSpamGuard();

/** Delete tracked messages, time the user out in every guild the bot shares, log. */
export async function punish(client: Client, userId: string, hit: SpamEntry[]) {
  const dryRun = process.env.SPAM_GUARD_DRY_RUN === "1";
  const guildIds = [...new Set(hit.map((e) => e.guildId))];
  const results: string[] = [];

  if (!dryRun) {
    for (const e of hit) {
      const channel = client.channels.cache.get(e.channelId);
      if (channel?.isTextBased()) {
        await channel.messages.delete(e.messageId).catch(() => {});
      }
    }
  }

  for (const guildId of guildIds) {
    const member = await client.guilds.cache
      .get(guildId)
      ?.members.fetch(userId)
      .catch(() => null);
    if (!member?.moderatable) {
      results.push(`${guildId}: skipped (not moderatable)`);
      continue;
    }
    if (dryRun) {
      results.push(`${guildId}: dry-run, would timeout`);
      continue;
    }
    try {
      await member.timeout(TIMEOUT_MS, "SpamGuard: multi-channel image spam");
      results.push(`${guildId}: timed out 1h`);
    } catch (err) {
      console.error("[SpamGuard] timeout failed:", err);
      results.push(`${guildId}: timeout failed`);
    }
  }

  const channels = new Set(hit.map((e) => e.channelId)).size;
  const summary = `[SpamGuard]${dryRun ? " (dry-run)" : ""} user ${userId}: ${hit.length} msgs / ${channels} channels\n${results.join("\n")}`;
  console.warn(summary);

  const logId = process.env.SPAM_LOG_CHANNEL_ID;
  if (!logId) return;
  const logChannel = await client.channels.fetch(logId).catch(() => null);
  if (logChannel?.isSendable()) {
    await logChannel
      .send({ content: summary, allowedMentions: { parse: [] } })
      .catch((err) => console.error("[SpamGuard] log send failed:", err));
  }
}

import { Client, ClientEvents, Collection, Message } from "discord.js";
import { Moodenglink } from "moodenglink";

// Extended Discord Client with Moodenglink
export interface ExtendedClient extends Client {
  manager: Moodenglink;
  commands: Collection<string, Command>;
  aliases: Collection<string, string>;
  io?: any;
}

// Command interface
export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  /** Allow running from DMs. Only for commands that never touch message.guild/member. */
  dm?: boolean;
  /** Seconds after the command finishes to delete it and the bot's replies to it (guild only). */
  cleanup?: number;
  execute: (
    message: Message,
    args: string[],
    client: ExtendedClient
  ) => Promise<void> | void;
}

export type EventArgs<K extends keyof ClientEvents> = [
  ...ClientEvents[K],
  ExtendedClient,
];

// Event interface - the last argument is always the ExtendedClient
export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: EventArgs<K>) => Promise<void> | void;
}

export interface AnyEvent {
  name: keyof ClientEvents;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void> | void;
}

export function defineEvent<K extends keyof ClientEvents>(event: Event<K>): AnyEvent {
  return event as unknown as AnyEvent;
}

// Song view derived from a moodenglink Track — used by embeds and the dashboard API
export interface Song {
  title: string;
  url: string;
  duration: number;
  durationInfo: string;
  thumbnail: string | null;
  requester: string;
  uploader: string;
  identifier: string;
}

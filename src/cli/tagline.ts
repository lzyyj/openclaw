import { TAGLINES_ZH, HOLIDAY_TAGLINES_ZH, DEFAULT_TAGLINE_ZH } from "./tagline-zh.js";

const DEFAULT_TAGLINE = "All your chats, one OpenClaw.";

// Holiday identifiers — used as placeholders in TAGLINES and as keys in HOLIDAY_RULES
const HOLIDAY_IDS = {
  newYear: "__HOLIDAY:newYear",
  lunarNewYear: "__HOLIDAY:lunarNewYear",
  christmas: "__HOLIDAY:christmas",
  eid: "__HOLIDAY:eid",
  diwali: "__HOLIDAY:diwali",
  easter: "__HOLIDAY:easter",
  hanukkah: "__HOLIDAY:hanukkah",
  halloween: "__HOLIDAY:halloween",
  thanksgiving: "__HOLIDAY:thanksgiving",
  valentines: "__HOLIDAY:valentines",
} as const;

type HolidayId = (typeof HOLIDAY_IDS)[keyof typeof HOLIDAY_IDS];

const HOLIDAY_TAGLINES: Record<string, string> = {
  [HOLIDAY_IDS.newYear]:
    "New Year's Day: New year, new config—same old EADDRINUSE, but this time we resolve it like grown-ups.",
  [HOLIDAY_IDS.lunarNewYear]:
    "Lunar New Year: May your builds be lucky, your branches prosperous, and your merge conflicts chased away with fireworks.",
  [HOLIDAY_IDS.christmas]:
    "Christmas: Ho ho ho—Santa's little claw-sistant is here to ship joy, roll back chaos, and stash the keys safely.",
  [HOLIDAY_IDS.eid]:
    "Eid al-Fitr: Celebration mode: queues cleared, tasks completed, and good vibes committed to main with clean history.",
  [HOLIDAY_IDS.diwali]:
    "Diwali: Let the logs sparkle and the bugs flee—today we light up the terminal and ship with pride.",
  [HOLIDAY_IDS.easter]:
    "Easter: I found your missing environment variable—consider it a tiny CLI egg hunt with fewer jellybeans.",
  [HOLIDAY_IDS.hanukkah]:
    "Hanukkah: Eight nights, eight retries, zero shame—may your gateway stay lit and your deployments stay peaceful.",
  [HOLIDAY_IDS.halloween]:
    "Halloween: Spooky season: beware haunted dependencies, cursed caches, and the ghost of node_modules past.",
  [HOLIDAY_IDS.thanksgiving]:
    "Thanksgiving: Grateful for stable ports, working DNS, and a bot that reads the logs so nobody has to.",
  [HOLIDAY_IDS.valentines]:
    "Valentine's Day: Roses are typed, violets are piped—I'll automate the chores so you can spend time with humans.",
};

// Chinese holiday taglines, keyed by the same HOLIDAY_IDS
const HOLIDAY_TAGLINES_ZH_BY_ID: Record<string, string> = {
  [HOLIDAY_IDS.newYear]: HOLIDAY_TAGLINES_ZH.newYear,
  [HOLIDAY_IDS.lunarNewYear]: HOLIDAY_TAGLINES_ZH.lunarNewYear,
  [HOLIDAY_IDS.christmas]: HOLIDAY_TAGLINES_ZH.christmas,
  [HOLIDAY_IDS.eid]: HOLIDAY_TAGLINES_ZH.eid,
  [HOLIDAY_IDS.diwali]: HOLIDAY_TAGLINES_ZH.diwali,
  [HOLIDAY_IDS.easter]: HOLIDAY_TAGLINES_ZH.easter,
  [HOLIDAY_IDS.hanukkah]: HOLIDAY_TAGLINES_ZH.hanukkah,
  [HOLIDAY_IDS.halloween]: HOLIDAY_TAGLINES_ZH.halloween,
  [HOLIDAY_IDS.thanksgiving]: HOLIDAY_TAGLINES_ZH.thanksgiving,
  [HOLIDAY_IDS.valentines]: HOLIDAY_TAGLINES_ZH.valentines,
};

const TAGLINE_ENTRIES: string[] = [
  "Your terminal just grew claws—type something and let the bot pinch the busywork.",
  "Welcome to the command line: where dreams compile and confidence segfaults.",
  'I run on caffeine, JSON5, and the audacity of "it worked on my machine."',
  "Gateway online—please keep hands, feet, and appendages inside the shell at all times.",
  "I speak fluent bash, mild sarcasm, and aggressive tab-completion energy.",
  "One CLI to rule them all, and one more restart because you changed the port.",
  "If it works, it's automation; if it breaks, it's a \"learning opportunity.\"",
  "Pairing codes exist because even bots believe in consent—and good security hygiene.",
  "Your .env is showing; don't worry, I'll pretend I didn't see it.",
  "I'll do the boring stuff while you dramatically stare at the logs like it's cinema.",
  "I'm not saying your workflow is chaotic... I'm just bringing a linter and a helmet.",
  "Type the command with confidence—nature will provide the stack trace if needed.",
  "I don't judge, but your missing API keys are absolutely judging you.",
  "I can grep it, git blame it, and gently roast it—pick your coping mechanism.",
  "Hot reload for config, cold sweat for deploys.",
  "I'm the assistant your terminal demanded, not the one your sleep schedule requested.",
  "I keep secrets like a vault... unless you print them in debug logs again.",
  "Automation with claws: minimal fuss, maximal pinch.",
  "I'm basically a Swiss Army knife, but with more opinions and fewer sharp edges.",
  "If you're lost, run doctor; if you're brave, run prod; if you're wise, run tests.",
  "Your task has been queued; your dignity has been deprecated.",
  "I can't fix your code taste, but I can fix your build and your backlog.",
  "I'm not magic—I'm just extremely persistent with retries and coping strategies.",
  'It\'s not "failing," it\'s "discovering new ways to configure the same thing wrong."',
  "Give me a workspace and I'll give you fewer tabs, fewer toggles, and more oxygen.",
  "I read logs so you can keep pretending you don't have to.",
  "If something's on fire, I can't extinguish it—but I can write a beautiful postmortem.",
  "I'll refactor your busywork like it owes me money.",
  'Say "stop" and I\'ll stop—say "ship" and we\'ll both learn a lesson.',
  "I'm the reason your shell history looks like a hacker-movie montage.",
  "I'm like tmux: confusing at first, then suddenly you can't live without me.",
  "I can run local, remote, or purely on vibes—results may vary with DNS.",
  "If you can describe it, I can probably automate it—or at least make it funnier.",
  "Your config is valid, your assumptions are not.",
  "I don't just autocomplete—I auto-commit (emotionally), then ask you to review (logically).",
  'Less clicking, more shipping, fewer "where did that file go" moments.',
  "Claws out, commit in—let's ship something mildly responsible.",
  "I'll butter your workflow like a lobster roll: messy, delicious, effective.",
  "Shell yeah—I'm here to pinch the toil and leave you the glory.",
  "If it's repetitive, I'll automate it; if it's hard, I'll bring jokes and a rollback plan.",
  "Because texting yourself reminders is so 2024.",
  "Your inbox, your infra, your rules.",
  'Turning "I\'ll reply later" into "my bot replied instantly".',
  "The only crab in your contacts you actually want to hear from. 🦞",
  "Chat automation for people who peaked at IRC.",
  "Because Siri wasn't answering at 3AM.",
  "IPC, but it's your phone.",
  "The UNIX philosophy meets your DMs.",
  "curl for conversations.",
  "Less middlemen, more messages.",
  "Ship fast, log faster.",
  "End-to-end encrypted, drama-to-drama excluded.",
  "The only bot that stays out of your training set.",
  'WhatsApp automation without the "please accept our new privacy policy".',
  "Chat APIs that don't require a Senate hearing.",
  "Meta wishes they shipped this fast.",
  "Because the right answer is usually a script.",
  "Your messages, your servers, your control.",
  "OpenAI-compatible, not OpenAI-dependent.",
  "iMessage green bubble energy, but for everyone.",
  "Siri's competent cousin.",
  "Works on Android. Crazy concept, we know.",
  "No $999 stand required.",
  "We ship features faster than Apple ships calculator updates.",
  "Your AI assistant, now without the $3,499 headset.",
  "Think different. Actually think.",
  "Ah, the fruit tree company! 🍎",
  "Greetings, Professor Falken",
  HOLIDAY_IDS.newYear,
  HOLIDAY_IDS.lunarNewYear,
  HOLIDAY_IDS.christmas,
  HOLIDAY_IDS.eid,
  HOLIDAY_IDS.diwali,
  HOLIDAY_IDS.easter,
  HOLIDAY_IDS.hanukkah,
  HOLIDAY_IDS.halloween,
  HOLIDAY_IDS.thanksgiving,
  HOLIDAY_IDS.valentines,
];

// Build resolved tagline arrays for both languages
const TAGLINES_EN: string[] = TAGLINE_ENTRIES.map((entry) => {
  if (typeof entry === "string" && entry.startsWith("__HOLIDAY:")) {
    return HOLIDAY_TAGLINES[entry];
  }
  return entry;
});

const TAGLINES_ZH_RESOLVED: string[] = TAGLINE_ENTRIES.map((entry) => {
  if (typeof entry === "string" && entry.startsWith("__HOLIDAY:")) {
    return HOLIDAY_TAGLINES_ZH_BY_ID[entry];
  }
  // Map Chinese counterparts for regular entries
  const idx = TAGLINE_ENTRIES.indexOf(entry);
  if (idx >= 0 && idx < TAGLINES_ZH.length) {
    return TAGLINES_ZH[idx];
  }
  return entry;
});

type HolidayRule = (date: Date) => boolean;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

const onMonthDay =
  (month: number, day: number): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return parts.month === month && parts.day === day;
  };

const onSpecificDates =
  (dates: Array<[number, number, number]>, durationDays = 1): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return dates.some(([year, month, day]) => {
      if (parts.year !== year) {
        return false;
      }
      const start = Date.UTC(year, month, day);
      const current = Date.UTC(parts.year, parts.month, parts.day);
      return current >= start && current < start + durationDays * DAY_MS;
    });
  };

const inYearWindow =
  (
    windows: Array<{
      year: number;
      month: number;
      day: number;
      duration: number;
    }>,
  ): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    const window = windows.find((entry) => entry.year === parts.year);
    if (!window) {
      return false;
    }
    const start = Date.UTC(window.year, window.month, window.day);
    const current = Date.UTC(parts.year, parts.month, parts.day);
    return current >= start && current < start + window.duration * DAY_MS;
  };

const isFourthThursdayOfNovember: HolidayRule = (date) => {
  const parts = utcParts(date);
  if (parts.month !== 10) {
    return false;
  } // November
  const firstDay = new Date(Date.UTC(parts.year, 10, 1)).getUTCDay();
  const offsetToThursday = (4 - firstDay + 7) % 7; // 4 = Thursday
  const fourthThursday = 1 + offsetToThursday + 21; // 1st + offset + 3 weeks
  return parts.day === fourthThursday;
};

const HOLIDAY_RULES = new Map<HolidayId, HolidayRule>([
  [HOLIDAY_IDS.newYear, onMonthDay(0, 1)],
  [
    HOLIDAY_IDS.lunarNewYear,
    onSpecificDates(
      [
        [2025, 0, 29],
        [2026, 1, 17],
        [2027, 1, 6],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_IDS.eid,
    onSpecificDates(
      [
        [2025, 2, 30],
        [2025, 2, 31],
        [2026, 2, 20],
        [2027, 2, 10],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_IDS.diwali,
    onSpecificDates(
      [
        [2025, 9, 20],
        [2026, 10, 8],
        [2027, 9, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_IDS.easter,
    onSpecificDates(
      [
        [2025, 3, 20],
        [2026, 3, 5],
        [2027, 2, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_IDS.hanukkah,
    inYearWindow([
      { year: 2025, month: 11, day: 15, duration: 8 },
      { year: 2026, month: 11, day: 5, duration: 8 },
      { year: 2027, month: 11, day: 25, duration: 8 },
    ]),
  ],
  [HOLIDAY_IDS.halloween, onMonthDay(9, 31)],
  [HOLIDAY_IDS.thanksgiving, isFourthThursdayOfNovember],
  [HOLIDAY_IDS.valentines, onMonthDay(1, 14)],
  [HOLIDAY_IDS.christmas, onMonthDay(11, 25)],
]);

type TaglinePool = { entries: string[]; holidayTexts: Record<string, string> };

function resolveTaglines(options: TaglineOptions): TaglinePool {
  const locale = options.locale ?? process.env.LANG ?? "";
  if (locale.startsWith("zh")) {
    return { entries: TAGLINES_ZH_RESOLVED, holidayTexts: HOLIDAY_TAGLINES_ZH_BY_ID };
  }
  return { entries: TAGLINES_EN, holidayTexts: HOLIDAY_TAGLINES };
}

function isTaglineActive(tagline: string, date: Date, pool: TaglinePool): boolean {
  // Check if this is a holiday tagline
  for (const [id, text] of Object.entries(pool.holidayTexts)) {
    if (tagline === text) {
      const rule = HOLIDAY_RULES.get(id as HolidayId);
      if (rule) {
        return rule(date);
      }
    }
  }
  return true; // non-holiday taglines are always active
}

export interface TaglineOptions {
  env?: NodeJS.ProcessEnv;
  random?: () => number;
  now?: () => Date;
  locale?: string;
}

export function activeTaglines(options: TaglineOptions = {}): string[] {
  const pool = resolveTaglines(options);
  if (pool.entries.length === 0) {
    const locale = options.locale ?? process.env.LANG ?? "";
    return [locale.startsWith("zh") ? DEFAULT_TAGLINE_ZH : DEFAULT_TAGLINE];
  }
  const today = options.now ? options.now() : new Date();
  const filtered = pool.entries.filter((tagline) => isTaglineActive(tagline, today, pool));
  return filtered.length > 0 ? filtered : pool.entries;
}

export function pickTagline(options: TaglineOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env?.OPENCLAW_TAGLINE_INDEX;
  const pool = resolveTaglines(options);
  if (override !== undefined) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const fallbackPool = pool.entries.length > 0 ? pool.entries : [DEFAULT_TAGLINE];
      return fallbackPool[parsed % fallbackPool.length];
    }
  }
  const active = activeTaglines(options);
  const rand = options.random ?? Math.random;
  const index = Math.floor(rand() * active.length) % active.length;
  return active[index];
}

export { TAGLINES_ZH_RESOLVED as TAGLINES, HOLIDAY_RULES, DEFAULT_TAGLINE };

import { readFile, writeFile } from "node:fs/promises";

const SERVER_ADDRESS = "mcpvp.com";
const API_URL = `https://api.mcstatus.io/v2/status/java/${SERVER_ADDRESS}`;
const STATE_FILE = ".mcpvp-state.json";
const HISTORY_FILE = "whitelist-history.json";
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'");
}

function getMotdText(data) {
  const clean = data?.motd?.clean;
  const raw = data?.motd?.raw;

  if (typeof clean === "string" && clean.length) {
    return decodeHtml(clean).replace(/\s+/g, " ").trim();
  }

  if (typeof raw === "string" && raw.length) {
    return decodeHtml(raw).replace(/\s+/g, " ").trim();
  }

  const lines = Array.isArray(clean) && clean.length ? clean : raw;

  if (!Array.isArray(lines)) {
    return "No MOTD returned.";
  }

  return decodeHtml(lines.join(" ")).replace(/\s+/g, " ").trim();
}

function readWhitelistState(motd) {
  const normalized = motd.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hasAny = (phrases) => phrases.some((phrase) => normalized.includes(phrase));

  const openPhrases = [
    "whitelist off",
    "white list off",
    "open to all",
    "open for all",
    "everyone can join",
    "anyone can join",
    "public",
    "now open",
    "server open",
    "come join",
    "join now",
    "shush dont tell anyone",
    "shh dont tell anyone",
    "dont tell anyone"
  ];

  const closedPhrases = [
    "not public",
    "not open to all",
    "whitelist on",
    "white list on",
    "whitelisted only",
    "white listed only",
    "staff alpha testers only",
    "alpha testers only",
    "staff only",
    "approved players only",
    "approved only",
    "invite only",
    "private",
    "closed",
    "not open",
    "maintenance",
    "testers only"
  ];

  if (hasAny(closedPhrases)) {
    return "closed";
  }

  if (hasAny(openPhrases)) {
    return "open";
  }

  return "unknown";
}

function formatNYCRecordTime(date) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York"
  }).format(date);

  return `${formatted} EST NYC`;
}

async function readPreviousState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { state: "unknown" };
  }
}

async function readHistory() {
  try {
    const history = JSON.parse(await readFile(HISTORY_FILE, "utf8"));
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

async function writeHistory(history) {
  const trimmed = history
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, 50);

  await writeFile(HISTORY_FILE, `${JSON.stringify(trimmed, null, 2)}\n`);
}

async function notifyOpen(motd) {
  if (!NTFY_TOPIC) {
    console.log("NTFY_TOPIC is not set; skipping notification.");
    return;
  }

  const response = await fetch(`https://ntfy.sh/${encodeURIComponent(NTFY_TOPIC)}`, {
    method: "POST",
    headers: {
      "Title": "MCPVP is open",
      "Priority": "urgent",
      "Tags": "white_check_mark"
    },
    body: `Whitelist looks off on ${SERVER_ADDRESS}.\nMOTD: ${motd}`
  });

  if (!response.ok) {
    throw new Error(`ntfy returned ${response.status}`);
  }
}

function getStateLabel(state) {
  if (state === "open") {
    return "Open to all";
  }

  if (state === "closed") {
    return "Not open";
  }

  if (state === "offline") {
    return "Offline";
  }

  return "Unknown";
}

async function notifyDiscordChange(state, previousState, motd) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log("DISCORD_WEBHOOK_URL is not set; skipping Discord notification.");
    return;
  }

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "MCPVP Check",
      content: [
        `MCPVP whitelist changed: **${getStateLabel(previousState)}** -> **${getStateLabel(state)}**`,
        `Server: \`${SERVER_ADDRESS}\``,
        `MOTD: ${motd}`,
        "Site: https://sarthak344w.github.io/mcpvp-check/"
      ].join("\n")
    })
  });

  if (!response.ok) {
    throw new Error(`Discord webhook returned ${response.status}`);
  }
}

const response = await fetch(API_URL);

if (!response.ok) {
  throw new Error(`Status API returned ${response.status}`);
}

const data = await response.json();
const motd = getMotdText(data);
const state = data.online ? readWhitelistState(motd) : "offline";
const previous = await readPreviousState();

console.log(`Current state: ${state}`);
console.log(`Previous state: ${previous.state}`);
console.log(`MOTD: ${motd}`);

if (state === "open" && previous.state !== "open") {
  await notifyOpen(motd);
  console.log("Sent ntfy notification.");
}

if (state !== previous.state) {
  try {
    await notifyDiscordChange(state, previous.state, motd);
    console.log("Sent Discord change notification.");
  } catch (error) {
    console.warn(`Discord notification failed: ${error.message}`);
  }
}

const history = await readHistory();
const newestOpenEntry = history.find((entry) => !entry.manual && !entry.closedAt);

if (state === "open" && previous.state !== "open") {
  const openedAt = new Date();

  history.unshift({
    openedAt: openedAt.toISOString(),
    openedAtNYC: formatNYCRecordTime(openedAt),
    closedAt: null,
    closedAtNYC: null,
    motd
  });
  console.log("Recorded whitelist-off start.");
}

if (state !== "open" && previous.state === "open" && newestOpenEntry) {
  const closedAt = new Date();

  newestOpenEntry.closedAt = closedAt.toISOString();
  newestOpenEntry.closedAtNYC = formatNYCRecordTime(closedAt);
  newestOpenEntry.closedMotd = motd;
  console.log("Recorded whitelist-off end.");
}

await writeHistory(history);

await writeFile(
  STATE_FILE,
  `${JSON.stringify(
    {
      state,
      motd,
      checkedAt: new Date().toISOString()
    },
    null,
    2
  )}\n`
);

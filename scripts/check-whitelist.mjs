import { readFile, writeFile } from "node:fs/promises";

const SERVER_ADDRESS = "mcpvp.com";
const API_URL = `https://api.mcstatus.io/v2/status/java/${SERVER_ADDRESS}`;
const STATE_FILE = ".mcpvp-state.json";
const NTFY_TOPIC = process.env.NTFY_TOPIC;

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

  if (/(white\s*list|whitelist)\s*on/.test(normalized) || normalized.includes("staff alpha testers only")) {
    return "closed";
  }

  if (
    /(white\s*list|whitelist)\s*off/.test(normalized) ||
    normalized.includes("open to all") ||
    normalized.includes("public")
  ) {
    return "open";
  }

  return "unknown";
}

async function readPreviousState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { state: "unknown" };
  }
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

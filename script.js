const SERVER_ADDRESS = "mcpvp.com";
const PRIMARY_SOURCE = {
  name: "mcstatus.io",
  url: `https://api.mcstatus.io/v2/status/java/${SERVER_ADDRESS}`,
  normalize(data) {
    return {
      source: "mcstatus.io",
      online: Boolean(data?.online),
      motd: getMotdText(data),
      players: data?.players,
      version: data?.version?.name_clean || data?.version?.name || data?.version || data?.protocol?.name || "Unknown"
    };
  }
};

const FALLBACK_SOURCE = {
  name: "mcsrvstat.us",
  url: `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`,
  normalize(data) {
    return {
      source: "mcsrvstat.us",
      online: Boolean(data?.online),
      motd: getMotdText(data),
      players: data?.players,
      version: data?.version || data?.protocol?.name || "Unknown"
    };
  }
};

const statusCard = document.querySelector("#status-card");
const statusIcon = document.querySelector("#status-icon");
const statusKicker = document.querySelector("#status-kicker");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const motdValue = document.querySelector("#motd");
const playersValue = document.querySelector("#players");
const versionValue = document.querySelector("#version");
const checkedAtValue = document.querySelector("#checked-at");
const historyList = document.querySelector("#history-list");
const refreshButton = document.querySelector("#refresh-button");
const copyAddressButton = document.querySelector("#copy-address");
const serverAddressValue = document.querySelector("#server-address");
const POLL_INTERVAL_MS = 30_000;
let checking = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

if ("caches" in window) {
  caches.keys().then((keys) => {
    keys.forEach((key) => caches.delete(key));
  });
}

const OPEN_PHRASES = [
  "alpha testing in progress unlocked",
  "unlocked",
  "whitelist off",
  "whitelist temporarily off",
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
  "shhh dont tell anyone",
  "shh dont tell anyone",
  "dont tell anyone"
];

const CLOSED_PHRASES = [
  "alpha testing in progress locked",
  "locked",
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

const RANK_GATE_PATTERN = /(?:LT|HT)[1-5]\+/i;
const ACTIVE_STATES = new Set(["open", "limited"]);

function decodeHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
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

function getRankGate(motd) {
  return motd.match(RANK_GATE_PATTERN)?.[0].toUpperCase() || null;
}

function getHistoryAccessState(entry) {
  if (entry?.accessState) {
    return entry.accessState;
  }

  if (entry?.rankGate || getRankGate(entry?.motd || "")) {
    return "limited";
  }

  return "open";
}

function getHistoryAccessLabel(entry) {
  const accessState = getHistoryAccessState(entry);

  if (accessState === "limited") {
    return `Open to some (${entry.rankGate || getRankGate(entry?.motd || "") || "rank"})`;
  }

  return "Open to all";
}

function readWhitelistState(motd) {
  const normalized = motd.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hasAny = (phrases) => phrases.some((phrase) => normalized.includes(phrase));

  if (/\bunlocked\b/.test(normalized)) {
    return "open";
  }

  if (/\blocked\b/.test(normalized)) {
    return "closed";
  }

  if (getRankGate(motd)) {
    return "limited";
  }

  if (hasAny(CLOSED_PHRASES)) {
    return "closed";
  }

  if (hasAny(OPEN_PHRASES)) {
    return "open";
  }

  return "unknown";
}

function formatNYCTime(date) {
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York"
  }).format(date);

  return `${time} EST NYC`;
}

function formatNYCDateTime(value) {
  if (!value) {
    return "Still open";
  }

  const date = new Date(value);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  }).format(date);

  return `${formatted} EST NYC`;
}

async function fetchStatusSource(source) {
  const response = await fetch(`${source.url}?t=${Date.now()}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${source.name} returned ${response.status}`);
  }

  return source.normalize(await response.json());
}

async function fetchServerStatus() {
  const primary = await fetchStatusSource(PRIMARY_SOURCE).catch((error) => ({ error: error.message }));

  if (!primary.error) {
    const primaryState = readWhitelistState(primary.motd);

    if (primaryState !== "unknown") {
      return primary;
    }

    const fallback = await fetchStatusSource(FALLBACK_SOURCE).catch((error) => ({ error: error.message }));

    if (!fallback.error) {
      const fallbackState = readWhitelistState(fallback.motd);

      if (fallbackState !== "unknown") {
        return fallback;
      }
    }

    return primary;
  }

  const fallback = await fetchStatusSource(FALLBACK_SOURCE).catch((error) => ({ error: error.message }));

  if (!fallback.error) {
    return fallback;
  }

  throw new Error([primary.error, fallback.error].filter(Boolean).join(" | ") || "All status APIs failed.");
}

function renderHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    historyList.textContent = "No whitelist-off times recorded yet.";
    return;
  }

  historyList.replaceChildren(
    ...history.slice(0, 12).map((entry) => {
      const item = document.createElement("article");
      item.className = "history-item";

      const opened = document.createElement("p");
      opened.className = "history-time";
      opened.textContent = `${getHistoryAccessLabel(entry)} · ${entry.openedAtNYC || formatNYCDateTime(entry.openedAt)}`;

      const closed = document.createElement("p");
      closed.className = "history-detail";
      closed.textContent = entry.closedAt
        ? `Closed again: ${entry.closedAtNYC || formatNYCDateTime(entry.closedAt)}`
        : getHistoryAccessState(entry) === "limited"
          ? "Still recorded as open to some"
          : entry.manual
          ? "Closed time not recorded"
          : "Still recorded as open";

      item.append(opened, closed);
      return item;
    })
  );
}

async function loadHistory() {
  try {
    const response = await fetch(`whitelist-history.json?t=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`History returned ${response.status}`);
    }

    renderHistory(await response.json());
  } catch {
    historyList.textContent = "Could not load history yet.";
  }
}

function setStatus(state, data) {
  statusCard.className = `status-card ${state}`;
  motdValue.textContent = data.motd;
  playersValue.textContent = data?.players
    ? `${data.players.online ?? "--"} / ${data.players.max ?? "--"}`
    : "-- / --";
  versionValue.textContent = data.version || "Unknown";
  checkedAtValue.textContent = formatNYCTime(new Date());

  if (state === "closed") {
    statusIcon.textContent = "X";
    statusIcon.classList.remove("rank");
    statusKicker.textContent = "Locked";
    statusTitle.textContent = "Not Open";
    statusDetail.textContent = "The server MOTD says locked.";
    return;
  }

  if (state === "open") {
    statusIcon.textContent = "✓";
    statusIcon.classList.remove("rank");
    statusKicker.textContent = "Unlocked";
    statusTitle.textContent = "Open to all";
    statusDetail.textContent = "The server MOTD says unlocked.";
    return;
  }

  if (state === "limited") {
    const rank = getRankGate(data.motd) || "Ranked";
    statusIcon.textContent = rank;
    statusIcon.classList.add("rank");
    statusKicker.textContent = `Rank gate: ${rank}`;
    statusTitle.textContent = "Open to some";
    const detail = document.createElement("span");
    detail.textContent = `Only players with ${rank} or better can join.`;
    statusDetail.replaceChildren(
      detail,
      createHelpIcon()
    );
    return;
  }

  statusIcon.textContent = "?";
  statusIcon.classList.remove("rank");
  statusKicker.textContent = data?.online ? "Server online" : "No ping";
  statusTitle.textContent = data?.online ? "MOTD unclear" : "Offline";
  statusDetail.textContent = data?.online
    ? "The server replied, but the MOTD did not clearly say whitelist on or off."
    : "The status APIs could not confirm that the server is online.";
}

function createHelpIcon() {
  const help = document.createElement("button");
  help.type = "button";
  help.className = "help-icon";
  help.textContent = "?";
  const tooltip = "I am the rank the MOTD says but I cannot join. You must have gotten that rank before April on MC Tiers or PvP Tiers.";
  help.setAttribute(
    "aria-label",
    tooltip
  );
  help.title = tooltip;
  help.dataset.tooltip = "If you are this rank but cannot join, you must have gotten that rank before April on MC Tiers or PvP Tiers.";
  return help;
}

async function checkServer() {
  if (checking) {
    return;
  }

  checking = true;
  refreshButton.disabled = true;
  refreshButton.querySelector("span").textContent = "...";
  statusKicker.textContent = "Checking MOTD";
  statusTitle.textContent = "Loading...";
  statusDetail.textContent = "Contacting the Minecraft status API.";

  try {
    const data = await fetchServerStatus();
    const state = data.online ? readWhitelistState(data.motd) : "unknown";
    setStatus(state, data);
  } catch (error) {
    statusCard.className = "status-card unknown";
    statusIcon.textContent = "!";
    statusKicker.textContent = "Checker error";
    statusTitle.textContent = "Try Again";
    statusDetail.textContent = "Could not reach the status APIs from this browser.";
    motdValue.textContent = error.message;
    playersValue.textContent = "-- / --";
    versionValue.textContent = "Unknown";
    checkedAtValue.textContent = formatNYCTime(new Date());
  } finally {
    checking = false;
    refreshButton.disabled = false;
    refreshButton.querySelector("span").textContent = "↻";
  }
}

async function copyServerAddress() {
  let copied = false;

  try {
    await navigator.clipboard.writeText(SERVER_ADDRESS);
    copied = true;
  } catch {
    const input = document.createElement("input");
    input.value = SERVER_ADDRESS;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    input.select();
    copied = document.execCommand("copy");
    input.remove();
  } finally {
    serverAddressValue.textContent = copied ? "Copied" : SERVER_ADDRESS;
    copyAddressButton.classList.toggle("copied", copied);

    window.setTimeout(() => {
      serverAddressValue.textContent = SERVER_ADDRESS;
      copyAddressButton.classList.remove("copied");
    }, 1200);
  }
}

refreshButton.addEventListener("click", checkServer);
copyAddressButton.addEventListener("click", copyServerAddress);
checkServer();
loadHistory();
window.setInterval(checkServer, POLL_INTERVAL_MS);
window.setInterval(loadHistory, POLL_INTERVAL_MS);

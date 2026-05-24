const SERVER_ADDRESS = "mcpvp.com";
const API_URL = `https://api.mcstatus.io/v2/status/java/${SERVER_ADDRESS}`;

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
      opened.textContent = entry.openedAtNYC || formatNYCDateTime(entry.openedAt);

      const closed = document.createElement("p");
      closed.className = "history-detail";
      closed.textContent = entry.closedAt
        ? `Closed again: ${entry.closedAtNYC || formatNYCDateTime(entry.closedAt)}`
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

function setStatus(state, data, motd) {
  statusCard.className = `status-card ${state}`;
  motdValue.textContent = motd;
  playersValue.textContent = data?.players
    ? `${data.players.online ?? "--"} / ${data.players.max ?? "--"}`
    : "-- / --";
  versionValue.textContent = data?.version?.name_clean || data?.version?.name || data?.version || data?.protocol?.name || "Unknown";
  checkedAtValue.textContent = formatNYCTime(new Date());

  if (state === "closed") {
    statusIcon.textContent = "X";
    statusKicker.textContent = "Whitelist detected";
    statusTitle.textContent = "Not Open";
    statusDetail.textContent = "The server MOTD says whitelist is on.";
    return;
  }

  if (state === "open") {
    statusIcon.textContent = "✓";
    statusKicker.textContent = "Whitelist off";
    statusTitle.textContent = "Open to all";
    statusDetail.textContent = "The server MOTD says whitelist is off or public, so anyone should be able to join.";
    return;
  }

  statusIcon.textContent = "?";
  statusKicker.textContent = data?.online ? "Server online" : "No ping";
  statusTitle.textContent = data?.online ? "MOTD unclear" : "Offline";
  statusDetail.textContent = data?.online
    ? "The server replied, but the MOTD did not clearly say whitelist on or off."
    : "The status API could not confirm that the server is online.";
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
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const motd = getMotdText(data);
    const state = data.online ? readWhitelistState(motd) : "unknown";
    setStatus(state, data, motd);
  } catch (error) {
    statusCard.className = "status-card unknown";
    statusIcon.textContent = "!";
    statusKicker.textContent = "Checker error";
    statusTitle.textContent = "Try Again";
    statusDetail.textContent = "Could not reach the status API from this browser.";
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

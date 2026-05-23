const SERVER_ADDRESS = "mcpvp.com";
const API_URL = `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`;

const statusCard = document.querySelector("#status-card");
const statusIcon = document.querySelector("#status-icon");
const statusKicker = document.querySelector("#status-kicker");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const motdValue = document.querySelector("#motd");
const playersValue = document.querySelector("#players");
const versionValue = document.querySelector("#version");
const checkedAtValue = document.querySelector("#checked-at");
const refreshButton = document.querySelector("#refresh-button");
const copyAddressButton = document.querySelector("#copy-address");
const serverAddressValue = document.querySelector("#server-address");

function decodeHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function getMotdText(data) {
  const clean = data?.motd?.clean;
  const raw = data?.motd?.raw;
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

function setStatus(state, data, motd) {
  statusCard.className = `status-card ${state}`;
  motdValue.textContent = motd;
  playersValue.textContent = data?.players
    ? `${data.players.online ?? "--"} / ${data.players.max ?? "--"}`
    : "-- / --";
  versionValue.textContent = data?.version || data?.protocol?.name || "Unknown";
  checkedAtValue.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());

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
    checkedAtValue.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());
  } finally {
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

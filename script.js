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
const notifyButton = document.querySelector("#notify-button");
const copyAddressButton = document.querySelector("#copy-address");
const serverAddressValue = document.querySelector("#server-address");
const NOTIFY_KEY = "mcpvp-notify-enabled";
const LAST_STATE_KEY = "mcpvp-last-whitelist-state";
const POLL_INTERVAL_MS = 60_000;
let checking = false;

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
    await maybeNotifyOpen(state, motd);
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

function notificationSupported() {
  return "Notification" in window && window.isSecureContext;
}

function notificationsEnabled() {
  return notificationSupported() && localStorage.getItem(NOTIFY_KEY) === "true" && Notification.permission === "granted";
}

function updateNotifyButton() {
  if (!notificationSupported()) {
    notifyButton.textContent = "Use live site";
    notifyButton.disabled = true;
    return;
  }

  if (Notification.permission === "denied") {
    notifyButton.textContent = "Blocked";
    notifyButton.disabled = true;
    return;
  }

  notifyButton.textContent = notificationsEnabled() ? "Notifications on" : "Notify me";
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.isSecureContext) {
    return navigator.serviceWorker.register("sw.js");
  }

  return null;
}

async function requestNotifications() {
  if (!notificationSupported()) {
    updateNotifyButton();
    return;
  }

  const permission = await Notification.requestPermission();
  localStorage.setItem(NOTIFY_KEY, permission === "granted" ? "true" : "false");
  await registerServiceWorker();
  updateNotifyButton();
}

async function showNotification(title, body) {
  const registration = await navigator.serviceWorker?.ready.catch(() => null);

  if (registration?.showNotification) {
    await registration.showNotification(title, {
      body,
      tag: "mcpvp-whitelist-open",
      requireInteraction: true,
      data: { url: window.location.href }
    });
    return;
  }

  new Notification(title, { body, tag: "mcpvp-whitelist-open" });
}

async function maybeNotifyOpen(state, motd) {
  const previousState = localStorage.getItem(LAST_STATE_KEY);
  localStorage.setItem(LAST_STATE_KEY, state);

  if (state === "open" && previousState !== "open" && notificationsEnabled()) {
    await showNotification("MCPVP is open", `Whitelist looks off. ${SERVER_ADDRESS} is ready.`);
  }
}

refreshButton.addEventListener("click", checkServer);
copyAddressButton.addEventListener("click", copyServerAddress);
notifyButton.addEventListener("click", requestNotifications);
registerServiceWorker();
updateNotifyButton();
checkServer();
window.setInterval(checkServer, POLL_INTERVAL_MS);

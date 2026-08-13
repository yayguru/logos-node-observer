const elements = {
  homeView: document.querySelector("#home-view"),
  nodeView: document.querySelector("#node-view"),
  lookupForm: document.querySelector("#lookup-form"),
  registerForm: document.querySelector("#register-form"),
  registrationResult: document.querySelector("#registration-result"),
  publicNodes: document.querySelector("#public-nodes"),
  refreshList: document.querySelector("#refresh-list"),
  refreshNode: document.querySelector("#refresh-node"),
  toast: document.querySelector("#toast"),
};

let currentNodeId = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({ error: "Invalid server response." }));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function relativeTime(value) {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 10) return "Now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function duration(seconds) {
  if (!seconds) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function dataRows(rows) {
  return rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join("");
}

async function loadPublicNodes() {
  elements.publicNodes.innerHTML = '<div class="empty-row">Loading registry...</div>';
  try {
    const { nodes } = await api("/api/nodes");
    if (!nodes.length) {
      elements.publicNodes.innerHTML = '<div class="empty-row">No public nodes are reporting yet.</div>';
      return;
    }
    elements.publicNodes.innerHTML = nodes.map((node) => `
      <a class="node-row" href="#/node/${encodeURIComponent(node.nodeId)}">
        <strong>${escapeHtml(node.displayName)}</strong>
        <span class="status-word ${escapeHtml(node.health.level)}">${escapeHtml(node.health.label)}</span>
        <span>${escapeHtml(node.mode || "Unknown")}</span>
        <span>H ${escapeHtml(compactNumber(node.height))}</span>
        <span>${escapeHtml(relativeTime(node.lastSeen))}</span>
      </a>
    `).join("");
  } catch (error) {
    elements.publicNodes.innerHTML = `<div class="empty-row">${escapeHtml(error.message)}</div>`;
  }
}

function renderPending(record) {
  setText("#node-title", record.displayName);
  setText("#rail-node-name", record.displayName);
  setText("#rail-node-id", record.nodeId);
  setText("#node-id-label", record.nodeId);
  setText("#health-sentence", record.health.sentence);
  const chip = document.querySelector("#health-chip");
  chip.className = `health-chip ${record.health.level}`;
  chip.textContent = record.health.label;
}

function renderNode(record) {
  renderPending(record);
  if (!record.snapshot) return;

  const snapshot = record.snapshot;
  const loadedModules = snapshot.modules.filter((module) => module.status === "loaded").length;
  setText("#metric-mode", snapshot.blockchain.mode || "Unknown");
  setText("#metric-height", compactNumber(snapshot.blockchain.height));
  setText("#metric-peers", String(snapshot.network.peers));
  setText("#metric-disk", `${snapshot.host.diskUsedPercent}%`);
  setText("#metric-modules", `${loadedModules}/${snapshot.modules.length}`);
  setText("#metric-seen", relativeTime(record.lastSeen));

  document.querySelector("#runtime-data").innerHTML = dataRows([
    ["Service", snapshot.services.node],
    ["Daemon", snapshot.daemon.status],
    ["Daemon version", snapshot.daemon.version || "--"],
    ["Slot", snapshot.blockchain.slot.toLocaleString()],
    ["LIB slot", snapshot.blockchain.libSlot.toLocaleString()],
    ["Tip", snapshot.blockchain.tip || "--"],
  ]);

  document.querySelector("#network-data").innerHTML = dataRows([
    ["Peer ID", snapshot.network.peerId || "--"],
    ["Peers", snapshot.network.peers],
    ["Connections", snapshot.network.connections],
    ["Pending", snapshot.network.pendingConnections],
    ["Blend declaration", snapshot.blend.declared ? "Present" : "Not detected"],
    ["Blend listener", snapshot.blend.listening ? "Listening" : "Inactive"],
    ["Host uptime", duration(snapshot.host.uptimeSeconds)],
    ["Memory used", `${snapshot.host.memoryUsedPercent}%`],
  ]);

  document.querySelector("#modules-data").innerHTML = snapshot.modules.length
    ? snapshot.modules.map((module) => `
        <div class="module-row">
          <span>${escapeHtml(module.name)}</span>
          <span>${escapeHtml(module.status)}</span>
          <span>${escapeHtml(module.version || "--")}</span>
          <span>${escapeHtml(duration(module.uptimeSeconds))}</span>
        </div>
      `).join("")
    : '<div class="empty-row">No module data received.</div>';

  const listeners = [
    ["P2P / UDP 3000", snapshot.listeners.p2pUdp],
    ["Blend / UDP 3400", snapshot.listeners.blendUdp],
    ["Storage / UDP 8090", snapshot.listeners.storageUdp],
    ["Storage / TCP 8091", snapshot.listeners.storageTcp],
    ["Delivery / UDP 9000", snapshot.listeners.deliveryUdp],
    ["Delivery / TCP 30303", snapshot.listeners.deliveryTcp],
  ];
  document.querySelector("#listeners-data").innerHTML = listeners.map(([label, up]) => `
    <div class="listener"><span>${escapeHtml(label)}</span><b class="${up ? "up" : ""}">${up ? "LISTEN" : "DOWN"}</b></div>
  `).join("");
}

function resetNodeView() {
  setText("#node-title", "Loading node");
  setText("#rail-node-name", "Loading...");
  setText("#rail-node-id", currentNodeId);
  setText("#node-id-label", currentNodeId);
  setText("#health-sentence", "Retrieving the latest snapshot.");
  ["mode", "height", "peers", "disk", "modules", "seen"].forEach((metric) => {
    setText(`#metric-${metric}`, "--");
  });
  const chip = document.querySelector("#health-chip");
  chip.className = "health-chip pending";
  chip.textContent = "Waiting";
  document.querySelector("#runtime-data").innerHTML = "";
  document.querySelector("#network-data").innerHTML = "";
  document.querySelector("#modules-data").innerHTML = '<div class="empty-row">Waiting for snapshot...</div>';
  document.querySelector("#listeners-data").innerHTML = "";
}

async function loadNode(nodeId) {
  currentNodeId = nodeId;
  resetNodeView();
  elements.refreshNode.disabled = true;
  try {
    renderNode(await api(`/api/node?id=${encodeURIComponent(nodeId)}`));
  } catch (error) {
    showToast(error.message);
    window.location.hash = "#/";
  } finally {
    elements.refreshNode.disabled = false;
  }
}

function route() {
  const match = window.location.hash.match(/^#\/node\/(node_[A-Za-z0-9_-]{12})$/);
  const isNode = Boolean(match);
  elements.homeView.hidden = isNode;
  elements.nodeView.hidden = !isNode;
  if (isNode) loadNode(match[1]);
  else loadPublicNodes();
}

elements.lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nodeId = new FormData(event.currentTarget).get("nodeId").trim();
  window.location.hash = `#/node/${encodeURIComponent(nodeId)}`;
});

elements.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const form = new FormData(event.currentTarget);
  button.disabled = true;
  try {
    const result = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ displayName: form.get("displayName"), visibility: form.get("visibility") }),
    });
    const installCommand = `sudo bash agent/install.sh --api ${result.ingestUrl.replace(/\/api\/ingest$/, "")} --node-id ${result.nodeId} --token ${result.token}`;
    elements.registrationResult.hidden = false;
    elements.registrationResult.innerHTML = `
      <h3>Credentials created</h3>
      <p>The write token is shown once. Run the installer from a cloned repository on the node, then remove this browser history if the machine is shared.</p>
      <div class="secret-grid"><span>Node ID</span><code>${escapeHtml(result.nodeId)}</code><button class="copy-button" data-copy="${escapeHtml(result.nodeId)}">Copy</button></div>
      <div class="secret-grid"><span>Token</span><code>${escapeHtml(result.token)}</code><button class="copy-button" data-copy="${escapeHtml(result.token)}">Copy</button></div>
      <div class="secret-grid"><span>Install</span><code>${escapeHtml(installCommand)}</code><button class="copy-button" data-copy="${escapeHtml(installCommand)}">Copy</button></div>
      <div class="secret-grid"><span>Console</span><code>${escapeHtml(result.dashboardUrl)}</code><a class="copy-button" href="#/node/${encodeURIComponent(result.nodeId)}">Open</a></div>
    `;
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("click", async (event) => {
  const railButton = event.target.closest("[data-scroll]");
  if (railButton) {
    document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("active", item === railButton));
    document.getElementById(railButton.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const copyButton = event.target.closest("[data-copy]");
  if (!copyButton) return;
  await navigator.clipboard.writeText(copyButton.dataset.copy);
  showToast("Copied to clipboard.");
});

elements.refreshList.addEventListener("click", loadPublicNodes);
elements.refreshNode.addEventListener("click", () => loadNode(currentNodeId));
window.addEventListener("hashchange", route);
route();

#!/usr/bin/env bash
set -euo pipefail

AGENT_VERSION="0.1.0"
CONFIG_FILE="${LOGOS_OBSERVER_CONFIG:-/etc/logos-observer/agent.env}"

if [[ ! -r "$CONFIG_FILE" ]]; then
  echo "Observer config is not readable: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${OBSERVER_API_URL:?OBSERVER_API_URL is required}"
: "${OBSERVER_NODE_ID:?OBSERVER_NODE_ID is required}"
: "${OBSERVER_TOKEN:?OBSERVER_TOKEN is required}"

LOGOS_USER="${LOGOS_USER:-logos}"
LOGOS_HOME="${LOGOS_HOME:-/var/lib/logos-node}"
LOGOSCORE="${LOGOSCORE:-/usr/local/bin/logoscore}"
LOCAL_API="${LOGOS_LOCAL_API:-http://127.0.0.1:8080}"

for command in jq curl runuser systemctl ss df awk; do
  command -v "$command" >/dev/null || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

service_state() {
  local unit="$1"
  local result
  result=$(systemctl is-active "$unit" 2>/dev/null || true)
  case "$result" in
    active|inactive|failed) printf '%s' "$result" ;;
    *) printf 'unknown' ;;
  esac
}

run_logoscore() {
  runuser -u "$LOGOS_USER" -- env HOME="$LOGOS_HOME" \
    bash -c 'cd "$1"; shift; exec "$@"' _ "$LOGOS_HOME" "$LOGOSCORE" "$@"
}

module_call_json() {
  local method="$1"
  local raw
  raw=$(run_logoscore call blockchain_module "$method" 2>/dev/null || printf '{}')
  jq -c '
    (.result.value // {}) as $value |
    if ($value | type) == "string" then ($value | fromjson? // {}) else $value end
  ' <<<"$raw" 2>/dev/null || printf '{}'
}

localhost_json() {
  local path="$1"
  curl --fail --silent --show-error --max-time 5 "$LOCAL_API$path" 2>/dev/null || printf '{}'
}

is_udp_listening() {
  local port="$1"
  ss -H -lun 2>/dev/null | awk -v suffix=":$port" '$4 ~ suffix "$" { found=1 } END { exit !found }'
}

is_tcp_listening() {
  local port="$1"
  ss -H -ltn 2>/dev/null | awk -v suffix=":$port" '$4 ~ suffix "$" { found=1 } END { exit !found }'
}

bool_json() {
  if "$@"; then printf 'true'; else printf 'false'; fi
}

STATUS=$(run_logoscore status --json 2>/dev/null || printf '{"daemon":{"status":"unknown"},"modules":[]}')
CRYPTARCHIA=$(localhost_json "/cryptarchia/info")
if ! jq -e 'type == "object" and has("mode")' >/dev/null 2>&1 <<<"$CRYPTARCHIA"; then
  CRYPTARCHIA=$(module_call_json "get_cryptarchia_info")
fi

NETWORK=$(localhost_json "/network/info")
if ! jq -e 'type == "object" and has("peer_id")' >/dev/null 2>&1 <<<"$NETWORK"; then
  NETWORK=$(module_call_json "get_network_info")
fi
DECLARATIONS=$(localhost_json "/mantle/sdp/declarations")

NODE_SERVICE=$(service_state "logos-node.service")
BOOTSTRAP_SERVICE=$(service_state "logos-node-bootstrap.service")
P2P_LISTENING=$(bool_json is_udp_listening 3000)
BLEND_LISTENING=$(bool_json is_udp_listening 3400)
STORAGE_UDP_LISTENING=$(bool_json is_udp_listening 8090)
STORAGE_TCP_LISTENING=$(bool_json is_tcp_listening 8091)
DELIVERY_UDP_LISTENING=$(bool_json is_udp_listening 9000)
DELIVERY_TCP_LISTENING=$(bool_json is_tcp_listening 30303)

BLEND_DECLARED=false
BLEND_ACTIVE_EPOCH=0
BLEND_ZK_ID="${OBSERVER_BLEND_ZK_ID:-}"
if [[ -z "$BLEND_ZK_ID" && -r "$LOGOS_HOME/user_config.yaml" ]]; then
  # This is a public KMS identifier used only for local declaration matching.
  BLEND_ZK_ID=$(awk '
    /^blend:/ { in_blend=1; next }
    in_blend && /^[^[:space:]]/ { exit }
    in_blend && /secret_key_kms_id:/ { print $2; exit }
  ' "$LOGOS_HOME/user_config.yaml")
fi

if [[ -n "$BLEND_ZK_ID" ]] && jq -e 'type == "array"' >/dev/null 2>&1 <<<"$DECLARATIONS"; then
  BLEND_DECLARED=$(jq -c --arg zk "$BLEND_ZK_ID" 'any(.[]; .zk_id == $zk)' <<<"$DECLARATIONS")
  BLEND_ACTIVE_EPOCH=$(jq -r --arg zk "$BLEND_ZK_ID" '[.[] | select(.zk_id == $zk) | .active] | first // 0' <<<"$DECLARATIONS")
fi

UPTIME_SECONDS=$(awk '{print int($1)}' /proc/uptime)
DISK_USED_PERCENT=$(df -P "$LOGOS_HOME" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
MEMORY_USED_PERCENT=$(awk '
  /MemTotal:/ { total=$2 }
  /MemAvailable:/ { available=$2 }
  END { if (total > 0) printf "%d", ((total-available)*100)/total; else print 0 }
' /proc/meminfo)

SNAPSHOT=$(jq -n \
  --argjson status "$STATUS" \
  --argjson chain "$CRYPTARCHIA" \
  --argjson network "$NETWORK" \
  --arg nodeId "$OBSERVER_NODE_ID" \
  --arg agentVersion "$AGENT_VERSION" \
  --arg collectedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg nodeService "$NODE_SERVICE" \
  --arg bootstrapService "$BOOTSTRAP_SERVICE" \
  --argjson blendDeclared "$BLEND_DECLARED" \
  --argjson blendListening "$BLEND_LISTENING" \
  --argjson blendActiveEpoch "$BLEND_ACTIVE_EPOCH" \
  --argjson uptimeSeconds "$UPTIME_SECONDS" \
  --argjson diskUsedPercent "$DISK_USED_PERCENT" \
  --argjson memoryUsedPercent "$MEMORY_USED_PERCENT" \
  --argjson p2pUdp "$P2P_LISTENING" \
  --argjson blendUdp "$BLEND_LISTENING" \
  --argjson storageUdp "$STORAGE_UDP_LISTENING" \
  --argjson storageTcp "$STORAGE_TCP_LISTENING" \
  --argjson deliveryUdp "$DELIVERY_UDP_LISTENING" \
  --argjson deliveryTcp "$DELIVERY_TCP_LISTENING" \
  '{
    schemaVersion: 1,
    agentVersion: $agentVersion,
    nodeId: $nodeId,
    collectedAt: $collectedAt,
    services: { node: $nodeService, bootstrap: $bootstrapService },
    daemon: {
      status: ($status.daemon.status // "unknown"),
      version: ($status.daemon.version // ""),
      pid: ($status.daemon.pid // 0)
    },
    modules: [
      $status.modules[]? | {
        name: (.name // "unknown"),
        status: (.status // "unknown"),
        version: (.version // ""),
        uptimeSeconds: (.uptime_seconds // 0)
      }
    ],
    blockchain: {
      mode: ($chain.mode // "Unknown"),
      height: ($chain.height // 0),
      slot: ($chain.slot // 0),
      libSlot: ($chain.lib_slot // 0),
      tip: ($chain.tip // ""),
      lib: ($chain.lib // "")
    },
    network: {
      peerId: ($network.peer_id // ""),
      peers: ($network.n_peers // 0),
      connections: ($network.n_connections // 0),
      pendingConnections: ($network.n_pending_connections // 0)
    },
    blend: {
      declared: $blendDeclared,
      listening: $blendListening,
      activeEpoch: $blendActiveEpoch
    },
    host: {
      uptimeSeconds: $uptimeSeconds,
      diskUsedPercent: $diskUsedPercent,
      memoryUsedPercent: $memoryUsedPercent
    },
    listeners: {
      p2pUdp: $p2pUdp,
      blendUdp: $blendUdp,
      storageUdp: $storageUdp,
      storageTcp: $storageTcp,
      deliveryUdp: $deliveryUdp,
      deliveryTcp: $deliveryTcp
    }
  }')

curl --fail --silent --show-error --max-time 20 \
  --request POST \
  --header "Authorization: Bearer $OBSERVER_TOKEN" \
  --header "Content-Type: application/json" \
  --data-binary "$SNAPSHOT" \
  "${OBSERVER_API_URL%/}/api/ingest" >/dev/null

echo "Snapshot accepted for $OBSERVER_NODE_ID"

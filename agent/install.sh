#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo bash agent/install.sh --api https://example.netlify.app \
    --node-id node_xxxxxxxxxxxx --token lno_xxxxxxxxxxxxxxxxx
EOF
}

API_URL=""
NODE_ID=""
TOKEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) API_URL="${2:-}"; shift 2 ;;
    --node-id) NODE_ID="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

if [[ ! "$API_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] && \
   [[ ! "$API_URL" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]]; then
  echo "--api must be an HTTPS origin, for example https://your-site.netlify.app" >&2
  exit 2
fi

if [[ ! "$NODE_ID" =~ ^node_[A-Za-z0-9_-]{12}$ ]]; then
  echo "--node-id has an invalid format." >&2
  exit 2
fi

if [[ ! "$TOKEN" =~ ^lno_[A-Za-z0-9_-]{40,50}$ ]]; then
  echo "--token has an invalid format." >&2
  exit 2
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for file in logos-observer-agent.sh logos-observer.service logos-observer.timer; do
  [[ -f "$SCRIPT_DIR/$file" ]] || { echo "Missing installer file: $file" >&2; exit 1; }
done

for command in curl jq runuser systemctl ss; do
  command -v "$command" >/dev/null || {
    echo "Missing prerequisite: $command. Install curl, jq, util-linux, systemd and iproute2." >&2
    exit 1
  }
done

install -d -m 700 /etc/logos-observer
{
  printf 'OBSERVER_API_URL=%q\n' "$API_URL"
  printf 'OBSERVER_NODE_ID=%q\n' "$NODE_ID"
  printf 'OBSERVER_TOKEN=%q\n' "$TOKEN"
  printf 'LOGOS_USER=%q\n' "logos"
  printf 'LOGOS_HOME=%q\n' "/var/lib/logos-node"
  printf 'LOGOSCORE=%q\n' "/usr/local/bin/logoscore"
  printf 'LOGOS_LOCAL_API=%q\n' "http://127.0.0.1:8080"
} > /etc/logos-observer/agent.env
chmod 600 /etc/logos-observer/agent.env

install -m 755 "$SCRIPT_DIR/logos-observer-agent.sh" /usr/local/bin/logos-observer-agent
install -m 644 "$SCRIPT_DIR/logos-observer.service" /etc/systemd/system/logos-observer.service
install -m 644 "$SCRIPT_DIR/logos-observer.timer" /etc/systemd/system/logos-observer.timer

systemctl daemon-reload
systemctl enable --now logos-observer.timer
systemctl start logos-observer.service

echo "Logos Node Observer installed."
echo "Dashboard node id: $NODE_ID"
echo "Timer status: $(systemctl is-active logos-observer.timer)"
echo "Last run:"
systemctl --no-pager --full status logos-observer.service | sed -n '1,16p'


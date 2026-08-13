# Logos Node Observer

Logos Node Observer is a standalone, read-only health dashboard for operator-owned Logos nodes. It is not a Basecamp plugin and does not require Basecamp to run.

The public site runs on Netlify. A small systemd agent on each node reads local runtime state once per minute and sends a narrow snapshot over outbound HTTPS. It does not expose port `8080`, accept SSH credentials, read wallet keys or execute mutation methods.

## What the first version shows

- Logos service and daemon state
- loaded module names, versions and uptime
- blockchain mode, height, slot, LIB and tip
- peers and connections from the local node API
- Blend declaration and UDP listener state
- host uptime, disk and memory percentages
- expected P2P, Blend, Storage and Delivery listeners
- stale status when a node stops reporting for five minutes

For Blend declaration matching, the agent reads only the public `secret_key_kms_id` inside the local `blend` configuration section. That ID is used locally and is not included in the snapshot.

## Repository layout

- `web/`: dependency-free public dashboard
- `netlify/functions/`: registration, ingest and query endpoints
- `netlify/lib/`: validation, authentication, storage and health logic
- `agent/`: read-only collector, installer and systemd units
- `test/`: contract, security and health-classification tests
- `docs/architecture.md`: trust boundaries and data flow

## Local verification

Requirements: Node.js 20 or newer.

```bash
npm install
npm test
npm run check
npm run preview
```

`npm run preview` starts a dependency-free visual fixture at `http://127.0.0.1:4173`. For a complete local Netlify runtime, install the Netlify CLI separately and run `netlify dev`; live registration and ingest require Netlify Functions and Blobs.

## Publish to GitHub

On Windows, authenticate GitHub CLI once, then run the publisher:

```powershell
gh auth login -h github.com -p https -w
powershell -ExecutionPolicy Bypass -File .\scripts\publish-github.ps1
```

The publisher creates `yayguru/logos-node-observer` when needed and pushes
`main` without storing a token in the repository or Git remote URL. A PAT in
the sibling `Foryouenv.txt` file is supported only as a fallback.

## Deploy to Netlify

1. Create a new empty GitHub repository named `logos-node-observer`.
2. Push this directory to its `main` branch.
3. In Netlify, choose **Add new project** then **Import an existing project**.
4. Select GitHub and choose the `logos-node-observer` repository.
5. Leave the build settings detected from `netlify.toml`: build command `npm test`, publish directory `web`, functions directory `netlify/functions`.
6. Choose **Deploy**. No database or environment variable is required; Netlify configures Blobs for Functions automatically.
7. Open the generated `https://<project>.netlify.app` URL.

Registration and ingest endpoints have per-IP rate limits in their exported Netlify Function configuration. Verify those rules in the Netlify deploy log after the first deploy.

Use [docs/deploy-checklist.md](docs/deploy-checklist.md) for the exact first-publish and rollback sequence.

## Connect a Logos node

Registration in the web UI returns a node ID and a write token. The token is displayed once. On an Ubuntu node, clone this repository and run the exact installer command shown by the site:

```bash
git clone https://github.com/yayguru/logos-node-observer.git
cd logos-node-observer
sudo bash agent/install.sh \
  --api https://YOUR-PROJECT.netlify.app \
  --node-id node_xxxxxxxxxxxx \
  --token lno_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The installer does not restart Logos. It creates:

- `/etc/logos-observer/agent.env` with mode `0600`
- `/usr/local/bin/logos-observer-agent`
- `/etc/systemd/system/logos-observer.service`
- `/etc/systemd/system/logos-observer.timer`

It then sends the first snapshot and starts a one-minute timer.

## Validate the agent

```bash
systemctl status logos-observer.timer --no-pager
systemctl status logos-observer.service --no-pager
journalctl -u logos-observer.service -n 50 --no-pager
sudo /usr/local/bin/logos-observer-agent
```

The successful manual run prints only:

```text
Snapshot accepted for node_xxxxxxxxxxxx
```

Open the dashboard URL from any computer. An unlisted node is accessible only to people who know its node ID URL; choose public visibility to include it in the registry.

## Remove the agent

This removes only Observer files. It does not touch Logos services, modules or node data.

```bash
sudo systemctl disable --now logos-observer.timer
sudo rm -f /etc/systemd/system/logos-observer.timer
sudo rm -f /etc/systemd/system/logos-observer.service
sudo rm -f /usr/local/bin/logos-observer-agent
sudo rm -rf /etc/logos-observer
sudo systemctl daemon-reload
```

## Security notes

- Keep `/etc/logos-observer/agent.env` private. Anyone with its token can overwrite that node's snapshots.
- Keep the Logos API bound to localhost. Observer does not need inbound access to it.
- Regenerate a node registration if its write token is exposed. Token rotation is planned for the next phase.
- The dashboard is operational telemetry, not proof that a remote node is honest.

MIT licensed. See [LICENSE](LICENSE).

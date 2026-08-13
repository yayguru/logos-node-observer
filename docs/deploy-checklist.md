# First deployment checklist

## 1. Publish the repository from Windows

Create an empty GitHub repository named `logos-node-observer`. Do not add a README, license or `.gitignore` in GitHub because those files already exist locally.

Run in PowerShell:

```powershell
cd C:\Users\gadin\Desktop\temporal\logosnodehostinger\logos-node-observer
git add -A
git commit -m "Build standalone Logos Node Observer"
git remote add origin https://github.com/yayguru/logos-node-observer.git
git push -u origin main
```

If `origin` already exists, replace only its URL:

```powershell
git remote set-url origin https://github.com/yayguru/logos-node-observer.git
git push -u origin main
```

Confirm that `Foryouenv.txt`, tokens, `.env` files and node configuration are absent from the GitHub file list.

## 2. Deploy on Netlify

1. Sign in to Netlify.
2. Choose **Add new project**.
3. Choose **Import an existing project**.
4. Choose **GitHub**, then select `logos-node-observer`.
5. Confirm build command `npm test`.
6. Confirm publish directory `web`.
7. Confirm functions directory `netlify/functions`.
8. Choose **Deploy**.
9. Open `https://YOUR-PROJECT.netlify.app/api/nodes` and confirm the response is `{"nodes":[],"count":0}`.
10. Open the site root and register one **Unlisted link** test node.

No Netlify environment variable or external database is required for v0.1.

## 3. Connect the Logos VPS

Clone the new repository on the VPS as any user, then use the exact node ID and one-time token returned by the website:

```bash
git clone https://github.com/yayguru/logos-node-observer.git
cd logos-node-observer
sudo bash agent/install.sh \
  --api https://YOUR-PROJECT.netlify.app \
  --node-id node_xxxxxxxxxxxx \
  --token lno_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The installer does not stop or restart `logos-node.service`.

## 4. Validate the first snapshot

```bash
systemctl is-active logos-node.service
systemctl is-active logos-observer.timer
systemctl status logos-observer.service --no-pager
journalctl -u logos-observer.service -n 50 --no-pager
```

Expected result: both active checks print `active`, and the Observer service reports `status=0/SUCCESS`. Open the node dashboard from a different computer and verify mode, height, peers, modules, disk and Blend listener against the VPS.

## 5. Roll back Observer only

```bash
sudo systemctl disable --now logos-observer.timer
sudo rm -f /etc/systemd/system/logos-observer.timer
sudo rm -f /etc/systemd/system/logos-observer.service
sudo rm -f /usr/local/bin/logos-observer-agent
sudo rm -rf /etc/logos-observer
sudo systemctl daemon-reload
```

This rollback does not remove or alter Logos modules, keys, data or services.

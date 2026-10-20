# Deploying the newcord server on Oracle Cloud

This manual takes you from an Oracle Cloud account to a running newcord server that the desktop app signs in to, step by step. It follows `docs/guide/14-server-deployment.md` and uses the files in this folder. Plan on about an hour.

You end up with one Always Free Arm machine running:

- **the backend** at `https://newcord.duckdns.org`, which the desktop app has built in;
- **the relay** (coturn) at `newcord-turn.duckdns.org`, for calls that cannot connect directly and for Hide my IP;
- **nginx**, sharing port 443 between the two by name, with Let's Encrypt certificates;
- optionally, **nightly backups** to a private Object Storage bucket, and **one-click updates** from GitHub.

Commands in `PowerShell` blocks run on your Windows PC; all others run on the machine over SSH.

To use an Arch Linux machine with an x86_64 processor instead, keep this manual and follow [`ARCH-LINUX.md`](ARCH-LINUX.md) beside it: it says what changes in each section (D107).

## Before you start

- An Oracle Cloud account (Always Free is enough).
- A DuckDNS account: sign in at <https://www.duckdns.org> with GitHub or Google.
- An SSH key on your PC. Check for one, and create it if it is missing:

  ```powershell
  Get-Content $HOME\.ssh\id_ed25519.pub
  # If that file does not exist:
  ssh-keygen -t ed25519
  ```

- The version to install: the latest release at <https://github.com/osLeonardo/newcord/releases>, **0.1.1 or later** (0.1.0's bundle lacks the deployment files and `SHA256SUMS` this manual uses).

## 1. Create the machine

In the Oracle Cloud console, open **☰ → Compute → Instances → Create instance**:

1. **Name**: `newcord`.
2. **Image and shape → Edit**:
   - **Change image → Ubuntu → Canonical Ubuntu 24.04**.
   - **Change shape → Ampere → VM.Standard.A1.Flex**, with **1 OCPU** and **6 GB** of memory.
3. **Networking**: keep "Create new virtual cloud network" and "Create new public subnet", and make sure **Assign a public IPv4 address** is on.
4. **Add SSH keys → Paste public keys**: paste the whole line from `id_ed25519.pub`.
5. **Create**. If Oracle answers "Out of capacity", pick another availability domain in Placement, or try again later.

When it shows **Running**, note two addresses from the instance's page: the **Public IP address**, and under **Primary VNIC** the **Private IP address**.

> Oracle may reclaim Always Free machines that stay almost idle for a week. Upgrading the account to Pay As You Go keeps the same free allowance and avoids that; the machine in this manual stays inside the free limits.

## 2. Open the ports in Oracle's console

On the instance's page, open the **subnet** link, then **Security Lists → Default Security List → Add Ingress Rules**, and add five rules, each with **Source CIDR** `0.0.0.0/0`:

| IP protocol | Destination port range | What for |
| --- | --- | --- |
| TCP | `80` | Certificate checks and the redirect to HTTPS |
| TCP | `443` | The backend, and the relay over TLS |
| TCP | `3478` | The relay |
| UDP | `3478` | The relay |
| UDP | `49152-49407` | The relay's media ports |

SSH (TCP 22) is already open.

## 3. Point the DuckDNS names at the machine

At <https://www.duckdns.org>, add the domains **`newcord`** and **`newcord-turn`**, and set each one's **current ip** to the machine's public IP. The address stays the same while the machine exists, so this is done once. A few minutes later, both names should answer with that address:

```powershell
Resolve-DnsName newcord.duckdns.org
Resolve-DnsName newcord-turn.duckdns.org
```

## 4. Log in, update and open the machine's own firewall

```powershell
ssh ubuntu@<public IP>
```

```bash
sudo apt update && sudo apt -y full-upgrade && sudo reboot
```

Log in again. Oracle's Ubuntu images block every port except SSH inside the machine too, so add the same ports above the image's reject rule, then save them so they survive a reboot:

```bash
N=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
sudo iptables -I INPUT "$N" -p tcp -m multiport --dports 80,443,3478 -j ACCEPT
sudo iptables -I INPUT "$N" -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT "$N" -p udp --dport 49152:49407 -j ACCEPT
sudo netfilter-persistent save
```

## 5. Install the software

```bash
sudo apt install -y nginx libnginx-mod-stream coturn certbot sqlite3 curl
curl -fsSL https://deb.nodesource.com/setup_26.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version   # v26.x
```

## 6. Install the backend

Create the backend's user and folders, and its settings file with fresh secrets. The secrets are generated here, on the machine, and never leave it:

```bash
sudo useradd --system --home /var/lib/newcord --shell /usr/sbin/nologin newcord
sudo install -d -o newcord -g newcord -m 750 /var/lib/newcord /var/backups/newcord
sudo install -d -m 755 /etc/newcord

sudo tee /etc/newcord/env > /dev/null << EOF
JWT_SECRET=$(openssl rand -base64 48)
RELAY_SECRET=$(openssl rand -base64 48)
RELAY_URLS=stun:newcord-turn.duckdns.org:3478,turn:newcord-turn.duckdns.org:3478,turns:newcord-turn.duckdns.org:443
DATABASE_PATH=/var/lib/newcord/newcord.db
LISTEN_HOST=127.0.0.1
TRUST_PROXY=127.0.0.1
EOF
sudo chown newcord:newcord /etc/newcord/env
sudo chmod 600 /etc/newcord/env
```

Install the update script and the service, then the server itself. Set `VERSION` to the release you are installing:

```bash
VERSION=0.1.1
RAW=https://raw.githubusercontent.com/osLeonardo/newcord/v$VERSION/deploy
curl -fsSL -o /tmp/newcord-update "$RAW/scripts/newcord-update.sh"
curl -fsSL -o /tmp/newcord-backend.service "$RAW/systemd/newcord-backend.service"
sudo install -m 755 /tmp/newcord-update /usr/local/bin/newcord-update
sudo install -m 644 /tmp/newcord-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable newcord-backend

sudo newcord-update "$VERSION"
curl http://127.0.0.1:3000/health   # {"ok":true}
```

`newcord-update` downloads that version's server bundle from the release, checks it against the release's `SHA256SUMS`, unpacks it in `/opt/newcord-releases/<version>`, points `/opt/newcord` at it and starts the service. Every later update uses the same command (section 11).

## 7. nginx and the certificates

First, a temporary site that only answers Let's Encrypt's checks on port 80:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo install -d /var/www/acme
sudo tee /etc/nginx/sites-available/newcord-acme.conf > /dev/null << 'EOF'
server {
  listen 80;
  server_name newcord.duckdns.org newcord-turn.duckdns.org;
  location /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/newcord-acme.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Get both certificates, each with a hook that runs on every renewal too. The backend's reloads nginx, which otherwise keeps serving the old certificate until it expires; the relay's copies it where coturn can read it:

```bash
sudo install -m 755 /opt/newcord/deploy/scripts/copy-turn-cert.sh /etc/newcord/copy-turn-cert.sh
sudo certbot certonly --webroot -w /var/www/acme -d newcord.duckdns.org \
  --agree-tos --no-eff-email -m <your email> --deploy-hook "systemctl reload nginx"
sudo certbot certonly --webroot -w /var/www/acme -d newcord-turn.duckdns.org \
  --deploy-hook /etc/newcord/copy-turn-cert.sh
sudo certbot renew --dry-run
```

Then swap the temporary site for the real configuration: port 443 shared by name, and the backend behind TLS:

```bash
sudo rm /etc/nginx/sites-enabled/newcord-acme.conf
sudo install -m 644 /opt/newcord/deploy/nginx/newcord.conf /etc/nginx/sites-available/newcord.conf
sudo ln -sf /etc/nginx/sites-available/newcord.conf /etc/nginx/sites-enabled/
sudo install -d /etc/nginx/stream.d
sudo install -m 644 /opt/newcord/deploy/nginx/stream.conf /etc/nginx/stream.d/newcord.conf
echo 'include /etc/nginx/stream.d/*.conf;' | sudo tee -a /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

From your PC, the backend should now answer over HTTPS:

```powershell
curl.exe https://newcord.duckdns.org/health
```

## 8. The relay (coturn)

Install the production configuration and fill in its two placeholders on the machine: the machine's public and private addresses, and the relay secret from the backend's settings:

```bash
sudo install -m 640 -o root -g turnserver /opt/newcord/deploy/coturn/turnserver.conf /etc/turnserver.conf
PUBLIC=<public IP>
PRIVATE=$(hostname -I | awk '{print $1}')
RELAY=$(sudo sed -n 's/^RELAY_SECRET=//p' /etc/newcord/env)
sudo sed -i "s|<public IP>/<private IP>|$PUBLIC/$PRIVATE|; s|<RELAY_SECRET from /etc/newcord/env>|$RELAY|" /etc/turnserver.conf
sudo systemctl enable coturn
sudo systemctl restart coturn
sudo ss -lnp | grep 3478   # coturn listens on TCP and UDP 3478
```

If `systemctl status coturn` says the service is disabled in `/etc/default/coturn`, set `TURNSERVER_ENABLED=1` there and restart it.

## 9. Try it

Install the desktop app (see the repository's `README.md`), sign up, and sign in. The app uses `newcord.duckdns.org` on its own; nothing needs configuring. Then check that:

- the backend's log shows real client addresses, not `127.0.0.1`: `journalctl -u newcord-backend -n 50`;
- a call with **Hide my IP** on connects, which proves the relay.

## 10. Nightly backups (recommended)

The backup copies the database safely while it is in use, uploads the copy to a private bucket and keeps 7 days of copies.

1. In the console, **☰ → Storage → Buckets → Create bucket**: name `newcord-backups`, **Standard** tier, visibility **Private**.
2. Install Oracle's command-line tool for the `newcord` user, and set it up. The setup asks for your user's and tenancy's OCIDs (console: **Profile → My profile**, and **Profile → Tenancy**) and your region, creates an API key, and prints its public key; add that under **My profile → API keys → Add API key → Paste a public key**:

   ```bash
   sudo apt install -y python3-venv
   sudo -u newcord -H bash -c 'curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh | bash -s -- --accept-all-defaults'
   sudo -u newcord -H /var/lib/newcord/bin/oci setup config
   ```

3. Install the job, tell it the bucket and where the tool is, and start the timer:

   ```bash
   sudo tee /etc/newcord/backup.env > /dev/null << 'EOF'
   NEWCORD_BACKUP_BUCKET=newcord-backups
   PATH=/var/lib/newcord/bin:/usr/local/bin:/usr/bin:/bin
   EOF
   sudo install -m 644 /opt/newcord/deploy/systemd/newcord-backup.service /etc/systemd/system/
   sudo install -m 644 /opt/newcord/deploy/systemd/newcord-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now newcord-backup.timer
   sudo systemctl start newcord-backup.service   # one backup now, to check it
   journalctl -u newcord-backup -n 20
   ```

To restore a backup on a fresh machine, install the backend as above, stop it (`sudo systemctl stop newcord-backend`), download the copy from the bucket to `/var/lib/newcord/newcord.db` (owned by `newcord`), and start it again.

## 11. Updates from GitHub (D105)

Each release can reach the machine with one click: publishing a release starts the **deploy** workflow, which waits for your approval in the **production** environment, then asks the machine to run `newcord-update <version>` over SSH. The key it uses can run nothing else, and the machine downloads and checks the bundle itself. If the new version does not answer `/health` within 30 seconds, the machine goes back to the previous version and its database copy. The repository's **Deployments** panel shows what is live.

Set it up once:

1. On the machine, create the `deploy` user, allowed to run only the update script as root:

   ```bash
   sudo useradd --create-home --shell /bin/bash deploy
   sudo install -m 755 /opt/newcord/deploy/scripts/newcord-deploy-ssh.sh /usr/local/bin/newcord-deploy-ssh
   echo 'deploy ALL=(root) NOPASSWD: /usr/local/bin/newcord-update' | sudo tee /etc/sudoers.d/newcord-deploy
   sudo chmod 440 /etc/sudoers.d/newcord-deploy
   sudo visudo -c
   ```

2. On your PC, create a key for GitHub and print its public half. Press Enter twice when it asks for a passphrase: GitHub must use the key unattended.

   ```powershell
   ssh-keygen -t ed25519 -f $HOME\.ssh\newcord-deploy -C github-deploy
   Get-Content $HOME\.ssh\newcord-deploy.pub
   ```

3. On the machine, allow that key to run only the deploy command (replace the `ssh-ed25519 …` part with the line you just printed):

   ```bash
   sudo install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
   echo 'restrict,command="/usr/local/bin/newcord-deploy-ssh" ssh-ed25519 AAAA… github-deploy' \
     | sudo tee /home/deploy/.ssh/authorized_keys
   sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
   sudo chmod 600 /home/deploy/.ssh/authorized_keys
   ```

4. Read the machine's host key, so GitHub can be sure it is talking to your machine. On the machine, print its fingerprint:

   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   ```

   On your PC, the second command must print the same fingerprint; the first prints the line GitHub needs:

   ```powershell
   ssh-keyscan -t ed25519 <public IP>
   ssh-keyscan -t ed25519 <public IP> | ssh-keygen -lf -
   ```

5. On GitHub, in the repository's **Settings**:
   - **Secrets and variables → Actions → Variables → New repository variable**: `DEPLOY_HOST` = the machine's public IP.
   - **Environments → production → Environment secrets → Add environment secret**:
     - `DEPLOY_SSH_KEY`: the whole content of `$HOME\.ssh\newcord-deploy` (the private key, without `.pub`);
     - `DEPLOY_KNOWN_HOSTS`: the line `ssh-keyscan` printed, starting with the machine's IP.

   The production environment already exists and requires your approval for every deployment. Once the secret is saved, delete the private key from your PC: GitHub keeps the only copy it needs.

6. Try it: **Actions → deploy → Run workflow**, enter the version that is already live, approve it, and watch it succeed.

From then on, an update is: publish the release, open the deploy run it starts, **Review deployments → Approve**. To roll back, run the workflow by hand with an older version. Without GitHub, the same works over SSH: `sudo newcord-update <version>`.

## When something is wrong

| Symptom | Look at |
| --- | --- |
| `/health` does not answer | `journalctl -u newcord-backend -n 100`, `sudo systemctl status newcord-backend` |
| HTTPS fails | `sudo nginx -t`, `journalctl -u nginx -n 50`, and whether both DuckDNS names point at the machine |
| Certificates | `sudo certbot certificates`, `sudo certbot renew --dry-run` |
| Calls with Hide my IP fail | `journalctl -u coturn -n 100`, the UDP rules in Oracle's security list and in `sudo iptables -L INPUT` |
| A deployment failed | The deploy run's log on GitHub; on the machine, `ls -l /opt/newcord` shows the live version |

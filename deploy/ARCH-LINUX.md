# Deploying the newcord server on Arch Linux (x86_64)

Each release carries a server bundle for x86_64 machines, `newcord-server-<version>-linux-x64.tar.gz`, next to the Oracle machine's Arm one (D107). This page runs the server on an Arch Linux machine with an x86_64 processor. Keep [`MANUAL.md`](MANUAL.md) open beside it: this page follows the manual's sections and says, for each one, whether it applies as written or what changes on Arch. The result is the same: the backend, the relay and nginx on one machine, with backups and one-click updates from GitHub.

## Before you start

- An Arch Linux machine, fully updated (`sudo pacman -Syu`), whose processor is x86_64: `uname -m` prints `x86_64`. You need SSH access to it and `sudo` (`pacman -S sudo` if it is missing).
- A public IPv4 address: either the machine's own (a rented server), or your router's, with the ports below forwarded to the machine (a machine at home).
- A DuckDNS account, as in the manual.
- The version to install: **the first release with a `linux-x64` server bundle, or later**. Older releases carry only the Arm bundle, and their `newcord-update` downloads only that one.

## 1–4. The machine, its ports and its names

Instead of the manual's sections 1 to 4 (creating the Oracle machine, Oracle's security list and Ubuntu's iptables rules):

1. Open the same five ports, from anywhere: TCP `80`, `443` and `3478`, UDP `3478` and `49152-49407`. Where depends on the machine:
   - at a hosting provider, in its firewall, if it has one;
   - at home, as port forwards on your router to the machine's local address;
   - on the machine itself only if you installed a firewall: Arch has none by default. With `ufw`, for example, keeping SSH's port 22 open too:

     ```bash
     sudo ufw allow 22,80,443,3478/tcp
     sudo ufw allow 3478/udp
     sudo ufw allow 49152:49407/udp
     ```

2. Point both DuckDNS names at the public address (manual section 3). At home that address can change: set up DuckDNS's updater from its **install** page (choose **linux cron**), run every 5 minutes by cron (`cronie`) or a systemd timer.
3. Make sure SSH is running and starts with the machine: `sudo systemctl enable --now sshd`.

## 5. Install the software

```bash
sudo pacman -S --needed nginx nginx-mod-stream coturn certbot sqlite curl openssl nodejs
node --version   # v26.x
```

The server is built and tested on Node.js 26. Arch's `nodejs` package follows the newest release, so once it moves past 26, run `pacman -Ss nodejs-lts` and install the package whose version is 26 instead.

Unlike Ubuntu, Arch starts none of these services on install; the steps below start each one.

## 6. Install the backend

As written in the manual. `newcord-update` sees the x86_64 processor and downloads the `linux-x64` bundle by itself; the systemd unit runs `/usr/bin/node`, where Arch's package puts it.

## 7. nginx and the certificates

Arch's nginx has no `sites-available` or `sites-enabled` folders, and its stream module comes from `nginx-mod-stream` (installed above) instead of `libnginx-mod-stream`. First replace its configuration with the repository's Arch version, which loads that module and includes the same folders as Ubuntu's, and start nginx:

```bash
sudo install -d /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/stream.d
sudo install -m 644 /opt/newcord/deploy/nginx/arch-nginx.conf /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl enable --now nginx
```

Then follow the manual's section 7 as written, with two differences:

- **Skip** its line `echo 'include /etc/nginx/stream.d/*.conf;' | sudo tee -a /etc/nginx/nginx.conf`: the Arch configuration already includes that folder.
- Arch's certbot does not renew on its own until its timer is on. After getting both certificates:

  ```bash
  sudo systemctl enable --now certbot-renew.timer
  ```

## 8. The relay (coturn)

Arch's coturn reads `/etc/turnserver/turnserver.conf` instead of `/etc/turnserver.conf`, its service is called `turnserver` instead of `coturn`, and it has no `/etc/default/coturn` switch. The certificate hook already restarts the right service. Instead of the manual's commands:

```bash
sudo install -m 640 -o root -g turnserver /opt/newcord/deploy/coturn/turnserver.conf /etc/turnserver/turnserver.conf
PUBLIC=<public IP>
PRIVATE=$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')
RELAY=$(sudo sed -n 's/^RELAY_SECRET=//p' /etc/newcord/env)
sudo sed -i "s|<public IP>/<private IP>|$PUBLIC/$PRIVATE|; s|<RELAY_SECRET from /etc/newcord/env>|$RELAY|" /etc/turnserver/turnserver.conf
sudo systemctl enable turnserver
sudo systemctl restart turnserver
sudo ss -lnp | grep 3478   # coturn listens on TCP and UDP 3478
```

`PRIVATE` is the machine's own address. On a rented server that has the public address itself, both end up the same, which coturn accepts.

## 9. Try it

As written in the manual.

## 10. Nightly backups

As written in the manual: the bucket is in Oracle Cloud, which Oracle's command-line tool reaches from any machine. Where it installs `python3-venv`, run `sudo pacman -S --needed python` instead.

## 11. Updates from GitHub

As written in the manual: Arch's `sudo` reads `/etc/sudoers.d`. At home, use the DuckDNS name instead of the IP address, so a changed address does not break deployments: `DEPLOY_HOST` = `newcord.duckdns.org`, and in step 4 `ssh-keyscan -t ed25519 newcord.duckdns.org`. GitHub reaches the machine on port 22, so forward that port too.

## When something is wrong

The manual's table applies, except that the relay's log is `journalctl -u turnserver -n 100`, and blocked ports are in your router's forwards or your firewall's rules (`sudo ufw status`) rather than Oracle's security list.

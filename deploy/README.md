# Deployment files

**To deploy, follow [`MANUAL.md`](MANUAL.md):** it walks through every step below on Oracle Cloud, from creating the machine to one-click updates from GitHub (D105). On an Arch Linux machine with an x86_64 processor, follow it with [`ARCH-LINUX.md`](ARCH-LINUX.md) beside it, which says what changes in each section (D107). This page lists the files and which guide step uses each.

The production machine's configuration as templates (#14, Step 01). None of them holds a secret: each secret is generated on the machine and kept in files only its service can read. The hostnames are `newcord.duckdns.org` and `newcord-turn.duckdns.org` (D92).

Follow `docs/guide/14-server-deployment.md` in this order:

| Guide step | What to do | File here |
| --- | --- | --- |
| 1–3 | Create the machine, point both DuckDNS names at it, open the ports in Oracle's console and in iptables | none |
| 4 | Install nginx with `libnginx-mod-stream` (`nginx-mod-stream` on Arch, whose whole `nginx.conf` is `nginx/arch-nginx.conf`); add the stream block, included at the top level of `nginx.conf` | `nginx/stream.conf`, `nginx/arch-nginx.conf` |
| 5 | Add the http side; remove the default site | `nginx/newcord.conf` |
| 6 | Get both certificates with certbot; the relay's has the deploy hook | `scripts/copy-turn-cert.sh` |
| 7 | Install coturn's production configuration and fill in its two placeholders on the machine | `coturn/turnserver.conf` |
| 8 | Install Node.js 26 and create the `newcord` user. Download `newcord-server-<version>-linux-arm64.tar.gz` from the release (`linux-x64` on an x86_64 machine, D107), check its SHA-256 against the release notes, and extract it into `/opt/newcord` (`sudo tar -xzf … -C /opt/newcord`): its dependencies come installed for that platform, so the machine needs no pnpm or compilers (D104). `newcord-update` does all of this and picks the bundle itself (D105). To build on the machine instead, install pnpm 11, `build-essential` and `python3`, clone to `/opt/newcord` and run `pnpm install --frozen-lockfile --prod --filter server...` (no build: the server runs through tsx, D89) | `env.example` (as `/etc/newcord/env`), `scripts/build-server-bundle.sh` |
| 9 | Run the backend as a service, listening only on 127.0.0.1 and trusting nginx's client address | `systemd/newcord-backend.service` |
| 10 | Install Oracle's CLI for the `newcord` user, then the nightly backup | `scripts/backup.sh`, `systemd/newcord-backup.service`, `systemd/newcord-backup.timer` |

Then check the guide's "Done when" list.

# Deployment files

The production machine's configuration as templates (#14, Step 01). None of them holds a secret: each secret is generated on the machine and kept in files only its service can read. The hostnames use the working title, `newcord.duckdns.org` and `newcord-turn.duckdns.org`, until #12 renames them.

Follow `docs/guide/14-server-deployment.md` in this order:

| Guide step | What to do | File here |
| --- | --- | --- |
| 1–3 | Create the machine, point both DuckDNS names at it, open the ports in Oracle's console and in iptables | none |
| 4 | Install nginx with `libnginx-mod-stream`; add the stream block, included at the top level of `nginx.conf` | `nginx/stream.conf` |
| 5 | Add the http side; remove the default site | `nginx/newcord.conf` |
| 6 | Get both certificates with certbot; the relay's has the deploy hook | `scripts/copy-turn-cert.sh` |
| 7 | Install coturn's production configuration and fill in its two placeholders on the machine | `coturn/turnserver.conf` |
| 8 | Install Node.js 26, pnpm 11, `build-essential` and `python3`; create the `newcord` user; clone to `/opt/newcord` and build the server | `env.example` (as `/etc/newcord/env`) |
| 9 | Run the backend as a service, listening only on 127.0.0.1 and trusting nginx's client address | `systemd/newcord-backend.service` |
| 10 | Install Oracle's CLI for the `newcord` user, then the nightly backup | `scripts/backup.sh`, `systemd/newcord-backup.service`, `systemd/newcord-backup.timer` |

Then check the guide's "Done when" list.

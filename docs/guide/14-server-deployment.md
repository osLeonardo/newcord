# Server deployment


The backend, its SQLite file and coturn run on one Oracle Always Free machine (D52). Port 443 is shared by name through nginx (D53), and two free DuckDNS names point at the machine (D54). Deployment is done when the app signs in from another network, a call with UDP blocked connects through the relay on port 443, certificate renewal works, and a backup restores.

## Settings

Proposed by me and accepted by you on October 14, 2026.

| Setting | Proposed | Why |
| --- | --- | --- |
| Machine | Arm (Ampere A1), 1 core and 6 GB of memory, Ubuntu 24.04 LTS for Arm | Plenty for groups of this size, and leaves free allowance to spare |
| Hostnames | yourapp.duckdns.org for the backend and yourapp-turn.duckdns.org for the relay | Two separate names avoid DuckDNS's shared TXT record |
| Certificates | Let's Encrypt through certbot, checked over HTTP on port 80, renewed automatically | Free, and works with DuckDNS |
| Relay port range | UDP 49152 to 49407 | 256 ports is plenty for calls of 6, and a small range is easier to open |
| Backups | Nightly copy of the SQLite file to a private Oracle Object Storage bucket, kept for 7 days | Survives losing the machine |

## Machine and firewalls

1. Create the machine in Oracle's console with the settings above, using SSH keys only. Then point both DuckDNS names at its public IP address; the address stays fixed while the machine exists, so it only needs setting once.
2. Open the ports in Oracle's console, under the subnet's security list: TCP 80, 443 and 3478, and UDP 3478 and 49152 to 49407.
3. Open the same ports inside the machine. Oracle's Ubuntu images ship firewall rules that block everything except SSH, so the security list alone is not enough ([source](https://blogs.oracle.com/developers/post/enabling-network-traffic-to-ubuntu-images-in-oracle-cloud-infrastructure)). Insert the rules above the existing reject rule, whose position `sudo iptables -L INPUT --line-numbers` shows, then save them:

```bash
sudo iptables -I INPUT 5 -p tcp -m multiport --dports 80,443,3478 -j ACCEPT
sudo iptables -I INPUT 5 -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT 5 -p udp --dport 49152:49407 -j ACCEPT
sudo netfilter-persistent save
```

## Routing port 443 by name

4. Install nginx with its stream module (on Ubuntu, the libnginx-mod-stream package). Add this stream block at the top level of `nginx.conf`, outside the http block. It reads only the requested name, then passes the connection on still encrypted, adding the client's real address so the backend's per-IP rate limits keep working:

```nginx
stream {
  map $ssl_preread_server_name $route {
    yourapp.duckdns.org       127.0.0.1:8443;
    yourapp-turn.duckdns.org  127.0.0.1:9349;
  }

  server {
    listen 443;
    ssl_preread on;
    proxy_protocol on;
    proxy_pass $route;
  }

  # coturn does not read the client-address header, so strip it here
  server {
    listen 127.0.0.1:9349 proxy_protocol;
    proxy_pass 127.0.0.1:5349;
  }
}
```

5. Add the http side: port 80 for certificate checks and redirects, and a local TLS endpoint that forwards to the backend, WebSockets included:

```nginx
server {
  listen 80;
  server_name yourapp.duckdns.org yourapp-turn.duckdns.org;
  location /.well-known/acme-challenge/ { root /var/www/acme; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 127.0.0.1:8443 ssl proxy_protocol;
  server_name yourapp.duckdns.org;
  ssl_certificate     /etc/letsencrypt/live/yourapp.duckdns.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yourapp.duckdns.org/privkey.pem;
  set_real_ip_from 127.0.0.1;
  real_ip_header proxy_protocol;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_protocol_addr;
    proxy_read_timeout 1h;
  }
}
```

In the backend, create Fastify with `trustProxy: "127.0.0.1"`, so it reads the real client address from that header, and keep it listening only on 127.0.0.1.

## Certificates

6. Get one certificate per name, each with a deploy hook that runs on every renewal: the backend's reloads nginx, which otherwise keeps serving the old certificate, and the relay's copies its certificate where coturn can read it and restarts coturn:

```bash
sudo certbot certonly --webroot -w /var/www/acme -d yourapp.duckdns.org \
  --deploy-hook "systemctl reload nginx"
sudo certbot certonly --webroot -w /var/www/acme -d yourapp-turn.duckdns.org \
  --deploy-hook /etc/yourapp/copy-turn-cert.sh
sudo certbot renew --dry-run
```

## coturn

7. Adjust the M3 configuration for this machine. Its TLS port is 5349, reached only through nginx; Oracle machines sit behind one-to-one address translation, so coturn must be told both addresses to hand out the right relay addresses:

```
realm=yourapp-turn.duckdns.org
external-ip=<public IP>/<private IP>
min-port=49152
max-port=49407
cert=/etc/coturn/certs/fullchain.pem
pkey=/etc/coturn/certs/privkey.pem
```

## Backend service

8. Install Node.js 26 (see the Settings in `07-m1-setup.md`). Each release carries the server as `newcord-server-<version>-linux-arm64.tar.gz`, built on Linux Arm with its dependencies installed (D104), and as `newcord-server-<version>-linux-x64.tar.gz` for an Arch Linux x86_64 machine (D107, `deploy/ARCH-LINUX.md`): check its SHA-256 against the release notes and extract it into `/opt/newcord`, so the machine needs no pnpm or compilers. (To build on the machine instead, install pnpm 11 plus the compilers that better-sqlite3 and argon2 may need on Arm, `build-essential` and `python3`.) Create a dedicated user, and keep secrets in a file only that user can read. Generate each secret with `openssl rand -base64 48`.
9. Run the backend as a systemd service:

```ini
[Unit]
Description=Your App backend
After=network.target

[Service]
User=yourapp
WorkingDirectory=/opt/yourapp/apps/server
EnvironmentFile=/etc/yourapp/env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Backups

10. Each night, copy the database safely while it is in use, upload the copy to a private Object Storage bucket with Oracle's command-line tool, and delete copies older than 7 days:

```bash
sqlite3 /var/lib/yourapp/app.db ".backup '/var/backups/yourapp/app-$(date +%F).db'"
```

## Done when

- The app signs in through yourapp.duckdns.org from a computer on another network
- A call with UDP blocked on one side connects through yourapp-turn.duckdns.org on port 443
- The backend's logs show real client addresses, not 127.0.0.1
- `certbot renew --dry-run` succeeds
- Last night's backup restores on a fresh machine

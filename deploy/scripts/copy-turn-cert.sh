#!/bin/sh
# certbot's deploy hook for the relay's certificate (14-server-deployment step 6):
# copies it where coturn can read it, then restarts coturn. Install as
# /etc/newcord/copy-turn-cert.sh (root, chmod 755).
set -eu

LIVE=/etc/letsencrypt/live/newcord-turn.duckdns.org
CERTS=/etc/coturn/certs

install -d -m 750 -o root -g turnserver "$CERTS"
install -m 644 -o root -g turnserver "$LIVE/fullchain.pem" "$CERTS/fullchain.pem"
install -m 640 -o root -g turnserver "$LIVE/privkey.pem" "$CERTS/privkey.pem"
systemctl restart coturn

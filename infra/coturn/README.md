# The relay (coturn)

`turnserver.conf` is the relay's configuration for development and production. It holds no secret: coturn gets the secret shared with the server (`RELAY_SECRET` in `apps/server/.env`) on its command line, and accepts only the 1-hour passwords that `GET /relay/credentials` hands out (D23).

## Development on Windows (WSL2)

coturn runs in WSL2 (Ubuntu) on the PC that runs the server (#8, Step 02).

1. Install WSL2 and Ubuntu (needs administrator rights and a restart): `wsl --install -d Ubuntu`.
2. Turn on mirrored networking, so the second PC on the network reaches the relay at this PC's address. In `%UserProfile%\.wslconfig`:

   ```ini
   [wsl2]
   networkingMode=mirrored
   ```

   Then run `wsl --shutdown` and open Ubuntu again.
3. In Ubuntu: `sudo apt update && sudo apt install coturn`.
4. Allow the relay through Windows Firewall (PowerShell as administrator):

   ```powershell
   New-NetFirewallRule -DisplayName "newcord relay (STUN/TURN)" -Direction Inbound -Protocol UDP -LocalPort 3478 -Action Allow
   New-NetFirewallRule -DisplayName "newcord relay ports" -Direction Inbound -Protocol UDP -LocalPort 49152-49407 -Action Allow
   ```

5. Start coturn from the repository's file, with the same secret as the server. `<LAN IP>` is this PC's address on the local network, also used in `RELAY_URLS`:

   ```bash
   turnserver -c /mnt/c/Users/<you>/OneDrive/Documents/Projects/newcord/infra/coturn/turnserver.conf \
     --realm=newcord.local \
     --static-auth-secret="<RELAY_SECRET from apps/server/.env>" \
     --allowed-peer-ip=<LAN IP>
   ```

   `--allowed-peer-ip` is needed in development only: both computers are on a private network, which the configuration refuses to relay into, and two relayed Devices (Hide my IP) send to each other through this PC's private address. Production's relay addresses are public, so it needs no exception.

6. Set `RELAY_URLS=stun:<LAN IP>:3478,turn:<LAN IP>:3478` in `apps/server/.env`.

## Checking it

With credentials from `GET /relay/credentials` (log in with the app or with `curl`), an allocation succeeds:

```bash
turnutils_uclient -u "<username>" -w "<password>" -y <LAN IP>
```

The same command with an expired username (its first number in the past, and the matching password) fails with a 401.

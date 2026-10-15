# M3 build steps


M3 adds calls: voice for up to 6 people in a mesh, screen sharing without sound (D43) using the codec from settings, call setup encrypted with MLS (D18), the coturn relay and Hide my IP. M3 is done when a 6-person call with a screen share works on Windows and Linux (Wayland included), CPU use per viewer has been measured for each codec, and a client behind a strict firewall connects through the relay.

## Settings

Proposed by me and accepted by you on October 14, 2026.

| Setting | Proposed | Why |
| --- | --- | --- |
| Call size | 6 people; a seventh sees "call full" | D2's mesh limit |
| Voice processing | Chromium's echo cancellation, noise suppression and automatic gain, all on | Built into WebRTC; no extra code |
| Screen share ceiling | 1080p, up to 30 frames per second, at most 1.5 Mbps per viewer | About 7.5 Mbps of upload with 5 viewers; WebRTC lowers it on weak links |
| Screen share priority | Keep detail sharp and drop frame rate first | Text and code stay readable |
| Relay ports | UDP 3478, plus TURN over TLS on port 443 | TLS on 443 gets through strict firewalls |
| Relay passwords | Valid for 1 hour, issued by the backend using a secret shared with coturn | Only logged-in members can use the relay |
| STUN server | Your own coturn, not a public one | No third party sees members' addresses |

## Relay

1. Install coturn on the server and configure it in `turnserver.conf`. The last two lines stop anyone from using the relay to reach private networks behind it:

```
listening-port=3478
tls-listening-port=5349
realm=your-app.example
use-auth-secret
static-auth-secret=<long random secret, also known to the backend>
cert=/path/to/fullchain.pem
pkey=/path/to/privkey.pem
no-cli
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
```

Add the same kind of denied-peer-ip line for the other private ranges (172.16.0.0 to 172.31.255.255, 192.168.0.0 to 192.168.255.255, and 127.0.0.0 to 127.255.255.255).

2. Add a backend route that hands out relay passwords in coturn's shared-secret format:

```ts
import { createHmac } from "node:crypto";

const username = `${Math.floor(Date.now() / 1000) + 3600}:${deviceId}`;
const credential = createHmac("sha1", TURN_SECRET).update(username).digest("base64");
```

## Calls in the app

3. Make closing the main window hide it instead, unless the user chose quit-on-close (D15b), so calls keep running in the tray (D42).
4. Joining sends a call.join message to the group through MLS. Each pair of members in the call gets one RTCPeerConnection. Use WebRTC's "perfect negotiation" pattern, with the lower device ID as the polite side, so two members never send offers at once. Offers, answers and network candidates travel as call.signal messages: the main process encrypts and decrypts them, and passes plain connection details to the window through the preload API.
5. Create each connection with your own relay, forcing it for Hide my IP (D14):

```ts
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: ["stun:turn.your-app.example:3478"] },
    {
      urls: ["turn:turn.your-app.example:3478", "turns:turn.your-app.example:443"],
      username,
      credential,
    },
  ],
  iceTransportPolicy: hideMyIp ? "relay" : "all",
});
```

6. Capture the microphone with echo cancellation, noise suppression and automatic gain on. For voice activity, measure the microphone level with the Web Audio API and enable the audio track while it stays above a threshold, with a short delay before switching off. For push-to-talk, enable the track only while the key is held. On Windows, a native keyboard hook in the main process hears the key even while a game is in front; pick the hook library when M3 starts. On Linux, use the window's own key events, so push-to-talk works only while the app is in front (D44b). Register the mute toggle with Electron's globalShortcut, which only needs key presses (D44c).
7. Screen sharing: in the main process, answer the window's screen-share request with a source the user picks from your own picker, video only (D43). On Linux under Wayland, the system's PipeWire picker chooses instead, and some Electron versions need Chromium's PipeWire capturer feature switched on ([source](https://electronjs.org/fr/docs/latest/api/desktop-capturer)):

```ts
session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
    // show the sources in your picker, then:
    callback({ video: chosenSource });
  });
});
```

In the window, set the shared track's content hint to "detail", so WebRTC keeps text sharp and drops frame rate first.

8. Apply the codec from settings (D11b) and cap each viewer's bitrate:

```ts
const { codecs } = RTCRtpSender.getCapabilities("video")!;
const first = codecs.filter((c) => c.mimeType === preferredMimeType); // "video/H264", "video/VP8" or "video/VP9"
transceiver.setCodecPreferences([...first, ...codecs.filter((c) => !first.includes(c))]);

const params = transceiver.sender.getParameters();
params.encodings[0].maxBitrate = 1_500_000;
await transceiver.sender.setParameters(params);
```

The other codecs stay listed after the chosen one, so a connection still works if a viewer cannot decode it.

9. Measure CPU while sharing to 1, 3 and 5 viewers with each codec, using Electron's app.getAppMetrics(), and record the results in this guide; they decide whether H.264 stays the default (D11).

## Tests

- Unit tests for the negotiation logic and the call-full rule
- Manual matrix: Windows to Windows, and Windows to Linux on both Wayland and X11, with 6 people and each codec
- Strict firewall: block outgoing UDP on one computer and confirm it connects through port 443
- Hide my IP: confirm with getStats() that the connection's selected candidate pair uses the relay

## Done when

A 6-person call with a screen share works on Windows and Linux (Wayland included), CPU per viewer is recorded for each codec, and a computer with UDP blocked joins through the relay.

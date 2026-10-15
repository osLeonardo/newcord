# Requirements


The goal is a Discord alternative that drops Discord-style servers (guilds) and keeps only group chats, voice and video, with security built in. Every requirement is now settled in the Decision log.

| Requirement | Status |
| --- | --- |
| No Discord servers | Settled: no guilds or communities. Backend infrastructure is allowed. |
| Group chats | Settled: messages deleted from the server after delivery (D9), up to 10 members (D17). |
| Voice chat | Settled: one drop-in call per group, up to about 6 people (D2, D3). |
| Video streaming | Settled: screen sharing in version 1, webcam later (D10). Quality: D11. |
| Secure | Settled: E2EE text (MLS) and calls, safety numbers, optional IP hiding (D7, D8, D14). The server still sees who talks to whom. |

Working rule for this guide: no decision is made without you. Every decision lists at least two options, their pros and cons, a recommendation and the reason for it.

# newcord

A security-focused group chat app: small, flat groups that each have one encrypted chat and one drop-in voice/screen-share call. The backend routes and orders traffic but never reads content.

## Language

### People and devices

**Account**:
A registered username, with its password hash and recovery-code hash.
_Avoid_: User profile, login

**Device**:
One installation of the app while logged in to one Account, with its own identity key and MLS state; logging the installation in to a different Account makes a new Device.
_Avoid_: Client, session, instance

**Member**:
An Account that belongs to a Group; all Members are equal (no admins).
_Avoid_: Participant (reserved for calls), user

**Recovery code**:
A one-time code shown at sign-up and after each recovery that lets the Account owner reset a forgotten password.
_Avoid_: Backup code, reset token

**Block**:
One Account's refusal of another: the server drops their Invitations, and the blocker's Devices hide their Chat messages.
_Avoid_: Mute, ban

### Groups

**Group**:
A named set of up to 10 Members with one chat and one Call.
_Avoid_: Server, guild, channel, room

**Invitation**:
An offer to an Account to join a Group, which they accept or decline.
_Avoid_: Invite link, request

### Messages

**Envelope**:
The outer layer of every WebSocket message, readable by the server; it holds only what is needed to route, order and delete.
_Avoid_: Header, frame

**Payload**:
The MLS-encrypted inner content of an Envelope, readable only by Members.
_Avoid_: Body, content

**Chat message**:
A text Payload sent by a Member to their Group.
_Avoid_: Message (unqualified), post

**Delivery confirmation**:
A Device's acknowledgment that it received and stored a queued Envelope; the server deletes the Envelope once every Device confirms, or after 30 days.
_Avoid_: Read receipt, ack (in prose)

### Keys and trust

**Key directory**:
The server's list of each Account's Device public identity keys, readable only by logged-in Accounts with a reason to see them.
_Avoid_: Keyserver, key registry

**Key package**:
A one-use MLS bundle a Device uploads in advance, so others can add it to a Group while it is offline.
_Avoid_: Prekey

**Safety number**:
A 60-digit number derived from two Accounts' keys, compared aloud or in person to confirm no one is impersonating either side.
_Avoid_: Fingerprint, verification code

### Calls

**Call**:
A Group's single drop-in voice and screen-share session; Members join and leave at will, up to about 6 at once.
_Avoid_: Voice channel, meeting, room

**Participant**:
A Member currently in the Call.
_Avoid_: Caller, attendee

**Hide my IP**:
A setting that forces all of a Device's Call traffic through the relay, so other Participants never see its IP address.
_Avoid_: VPN mode, privacy mode

## Relationships

- An **Account** has 1..N **Devices**; each **Device** has 1 identity key in the **Key directory** and many **Key packages**.
- A **Group** has 1..10 **Members**; an **Account** can be a **Member** of many **Groups**.
- A **Group** has exactly 1 **Call**, with 0..~6 **Participants**.
- Every **Envelope** carries at most 1 **Payload**; a **Chat message** is one kind of **Payload** (call setup is another).
- An **Invitation** links one inviting **Member**, one **Group** and one invited **Account**.

## Flagged ambiguities

- **"Server"**: always means the backend, never a Discord-style guild. The guild concept does not exist here; use **Group**.
- **"Message"**: unqualified, it is ambiguous between a **Chat message** and an MLS message (which also carries call setup and commits). Say which one.
- **"User"**: use **Account** for identity and **Member** for group belonging.

## Example dialogue

> **Dev:** When Ana adds Bruno to the Group, does the server send him the messages?
> **Expert:** Not yet: first Bruno accepts the **Invitation**. Then a **Member**'s app fetches one **Key package** for each of Bruno's **Devices** and commits the add.
> **Dev:** And if Bruno logs in on a new laptop next week?
> **Expert:** That's a new **Device** on the same **Account**. The first **Member** online adds it automatically. Bruno's **Account** is still one **Member**.
> **Dev:** Can the server see who's in the **Call**?
> **Expert:** No. Join and leave travel as **Payloads**, so only **Members** know who the **Participants** are.

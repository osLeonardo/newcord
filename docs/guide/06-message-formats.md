# Message formats


Every message has two layers: an outer envelope the backend reads so it can route, order and delete, and an inner payload encrypted with MLS that only group members can read. Fields are encoded as JSON, with encrypted payloads in base64 (D30).

## Account requests (HTTPS)

| Request | Carries | What the backend does |
| --- | --- | --- |
| Register | Username, password, the device's public identity key | Stores the username, a slow hash of the password and the public key (D7), rejecting a key registered to another account (D60); returns session tokens and the new device's ID |
| Log in | Username, password, the device's public identity key | Finds the device by account and identity key, creating it on first sight (D59) and rejecting a key registered to another account (D60); returns session tokens and the device's ID |
| Upload key packages | A batch of MLS key packages from the device | Keeps them so others can add this user to groups |
| Get relay credentials | Session token | Returns a short-lived coturn username and password (D23) |

## WebSocket envelopes

| Type | Sent by | What the backend does | What the backend can see |
| --- | --- | --- | --- |
| hello | Client | Authenticates the connection with the session token | Which account and device connected |
| presence | Backend | Tells group members who is online | Who is online |
| group.create, group.rename | Client | Registers a new group with its ID and name, or changes its name | Group names (D40) and who changed them |
| invite, invite.reply | Client | Delivers an invitation showing the group's name, unless the invitee has blocked the sender; on acceptance, tells the group's online members to add the invitee | Who invited whom, to which group |
| keypackage.get | Client | Hands out one of each of the invitee's devices' key packages for the add | Who is being added |
| device.new | Backend | Tells the members of a user's groups that the user logged in a new device, so the first member app online adds it (D56) | Which devices each user has |
| mls.commit | Client | Orders group changes (adds, removals, key updates): the first commit for each epoch wins, later ones are rejected and retried. A commit that adds devices carries their welcome, stored with it in one step (D83) | Group, epoch, sender, and the declared additions and removals (D41) |
| mls.proposal | Client | Carries a member's request to leave; the backend stops delivering to the leaver at once, and the next member online commits the removal (D57) | Who left which group |
| mls.welcome | Backend | Delivers the welcome from an accepted commit to the devices it added (D83) | Recipient |
| mls.message | Client | Queues it for every member's devices with a per-group sequence number | Group, sender, size, time |
| ack | Client | Marks it delivered; deletes it once every device confirms, or after 30 days (D24) | Which device received what |
| block, unblock | Client | Records or removes a block, so invitations from that person are dropped without telling them (D57) | Who blocks whom |
| resync | Backend | Asks members' apps to re-add a device that missed a group change before it expired (D24) | Which device lost sync |

Commits are encrypted like every other MLS message. The sender's envelope declares who was added or removed (D41); the backend uses that for delivery and the 10-member limit (D17), and every member's app checks the declaration against the real commit and shows a notice naming the sender on any mismatch (D71).

## Encrypted payloads (inside mls.message)

| Type | Contents | Notes |
| --- | --- | --- |
| chat.text | Message ID, text, time sent | The ID is created by the sender's app |
| call.join, call.leave | The type and the sender's time (D85) | Members' apps show who is in the call; the backend never learns it; messages more than 60 seconds old are ignored |
| call.signal | Recipient, a WebRTC offer, answer or network candidate with its encryption fingerprint, and the sender's time (D85) | Every member's device receives it; only the named recipient acts on it (D18) |

## Rules for every message

- Every envelope carries a protocol version, so old and new app versions can tell each other apart.
- The backend rejects any envelope that fails validation against the shared schemas in the repository (D26, D28).
- Anything members should read lives inside the MLS payload; the envelope holds only what the backend needs to route.

Not covered yet: edits, deletions, reactions, typing indicators and file sharing were not part of the decisions so far. Each would be a new payload type.

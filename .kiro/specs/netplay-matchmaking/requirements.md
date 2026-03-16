# Requirements Document

## Introduction

Netplay Matchmaking adds online multiplayer to the Chroma Battle Simulator. Instead of sharing a single device, two players connect over the network using a shared join code. One player creates a session by entering a display name and a join code; the other player joins by entering the same code. The system handles lobby states (waiting, in-progress, and denied), match acceptance prompts, and graceful conflict resolution when codes collide.

---

## Glossary

- **Player**: A human participant identified by a self-chosen display name for the duration of a session.
- **Join_Code**: A short alphanumeric string chosen by a player to identify a matchmaking session.
- **Session**: A server-side record keyed by a Join_Code that tracks the lobby state and the players involved.
- **Host**: The first Player to register a given Join_Code; the Player who waits for an opponent.
- **Joiner**: The second Player who enters an existing Join_Code to request a match.
- **Lobby**: The pre-battle state of a Session before both players have accepted and the Battle begins.
- **Lobby_State**: One of `waiting`, `pending_acceptance`, or `in_progress`.
- **Matchmaking_Server**: The Next.js server action layer responsible for creating, querying, and updating Sessions.
- **Battle_Engine**: The existing server component that executes turn resolution (defined in the Chroma Battle Simulator spec).
- **Waiting_Screen**: The UI shown to the Host while no Joiner has arrived.
- **Acceptance_Prompt**: The UI shown to a Player asking them to accept or decline an incoming opponent.

---

## Requirements

### Requirement 1: Player Identity Entry

**User Story:** As a player, I want to enter a display name and a join code before matchmaking begins, so that my opponent can identify me and we can find each other's session.

#### Acceptance Criteria

1. THE Matchmaking_Server SHALL require a non-empty display name (1–24 characters) and a non-empty join code (1–16 alphanumeric characters) before creating or joining a Session.
2. IF a player submits an empty display name or an empty join code, THEN THE Client SHALL display a validation error and prevent submission.
3. IF a display name exceeds 24 characters or a join code exceeds 16 characters, THEN THE Client SHALL display a validation error and prevent submission.
4. THE Matchmaking_Server SHALL treat join codes as case-insensitive (e.g. "ABC" and "abc" refer to the same Session).
5. IF a player submits a join code containing symbols, THEN THE client SHALL display a distinct validation error and prevent submission. (This is to protect against code injection attacks)

---

### Requirement 2: Session Creation (New Code)

**User Story:** As a player, I want to create a new lobby when my join code is not already in use, so that I can wait for an opponent to join.

#### Acceptance Criteria

1. WHEN a player submits a join code that does not match any existing Session, THE Matchmaking_Server SHALL create a new Session with Lobby_State `waiting`, recording the player as the Host.
2. WHEN a Session is created, THE Client SHALL navigate the Host to the Waiting_Screen.
3. WHILE a Session is in Lobby_State `waiting`, THE Client SHALL display a "Waiting for opponent…" loading indicator to the Host.
4. WHILE a Session is in Lobby_State `waiting`, THE Matchmaking_Server SHALL poll or push updates so the Host's Waiting_Screen reflects when a Joiner arrives without requiring a manual page refresh.

---

### Requirement 3: Joiner Arrives — Host Acceptance Prompt

**User Story:** As the host, I want to see the joiner's name and choose whether to accept them, so that I have control over who I battle.

#### Acceptance Criteria

1. WHEN a Joiner requests to join a Session in Lobby_State `waiting`, THE Matchmaking_Server SHALL transition the Session to Lobby_State `pending_acceptance` and record the Joiner's display name.
2. WHEN the Session transitions to `pending_acceptance`, THE Client SHALL replace the Host's Waiting_Screen with an Acceptance_Prompt displaying the Joiner's display name and two options: Accept and Decline.
3. WHEN the Host selects Accept, THE Matchmaking_Server SHALL transition the Session to Lobby_State `in_progress` and initiate a Battle via the Battle_Engine for both players.
4. WHEN the Host selects Decline, THE Matchmaking_Server SHALL remove the Joiner from the Session, return the Session to Lobby_State `waiting`, and notify the Joiner's Client that the request was declined.
5. IF the Host does not respond to the Acceptance_Prompt within 30 seconds, THEN THE Matchmaking_Server SHALL treat the timeout as a Decline and return the Session to Lobby_State `waiting`.

---

### Requirement 4: Joiner Arrives — Waiting Session (Code Exists, Host Waiting)

**User Story:** As a joiner, I want to see that the host is already waiting when I enter their code, so that I can choose to join their lobby or pick a different code.

#### Acceptance Criteria

1. WHEN a player submits a join code that matches a Session in Lobby_State `waiting`, THE Client SHALL display the message "[HostName] is waiting to start a battle" along with two options: Accept (join the lobby) and Change Code (return to the entry form).
2. WHEN the Joiner selects Accept, THE Matchmaking_Server SHALL register the Joiner against the Session and transition the Session to Lobby_State `pending_acceptance` per Requirement 3.
3. WHEN the Joiner selects Change Code, THE Client SHALL return the Joiner to the name and join code entry form with their display name pre-filled.
4. IF a Session transitions out of Lobby_State `waiting` (e.g. another Joiner was accepted first) while the current player is viewing the join prompt, THEN THE Client SHALL notify the player that the session is no longer available and return them to the entry form.

---

### Requirement 5: Code Denied — Battle Already In Progress

**User Story:** As a player, I want to be told when a join code is already in use by an active battle, so that I know to choose a different code.

#### Acceptance Criteria

1. WHEN a player submits a join code that matches a Session in Lobby_State `in_progress`, THE Client SHALL display an error message indicating the code is already in use and prompt the player to choose a different join code.
2. THE Client SHALL return the player to the name and join code entry form with their display name pre-filled and the join code field cleared.
3. THE Matchmaking_Server SHALL NOT allow a third player to join or observe a Session that is in Lobby_State `in_progress`.

---

### Requirement 6: Session Lifecycle and Cleanup

**User Story:** As a developer, I want sessions to be cleaned up after a battle ends or players disconnect, so that stale join codes do not block future use.

#### Acceptance Criteria

1. WHEN a Battle initiated by a Session ends (winner determined), THE Matchmaking_Server SHALL mark the Session as complete and release the Join_Code so it may be reused.
2. WHEN the Host disconnects while the Session is in Lobby_State `waiting`, THE Matchmaking_Server SHALL delete the Session and release the Join_Code.
3. WHEN a Joiner disconnects after being accepted but before the Battle starts, THE Matchmaking_Server SHALL return the Session to Lobby_State `waiting` and notify the Host's Client.
4. THE Matchmaking_Server SHALL automatically expire and delete any Session that has remained in Lobby_State `waiting` for more than 10 minutes without a Joiner being accepted.

---

### Requirement 7: Real-Time State Synchronisation

**User Story:** As a player, I want the lobby and battle state to update in real time without manual refreshes, so that the experience feels responsive.

#### Acceptance Criteria

1. THE Matchmaking_Server SHALL push Session state changes (waiting → pending_acceptance → in_progress) to all connected Clients associated with that Session without requiring a Client-initiated poll.
2. WHEN a Battle begins, THE Matchmaking_Server SHALL provide both Clients with the Battle ID so they can connect to the Battle_Engine's state stream.
3. THE Client SHALL display a connection status indicator while waiting for real-time updates.
4. IF the real-time connection is lost, THEN THE Client SHALL attempt to reconnect and display a reconnecting indicator; IF reconnection fails after 15 seconds, THEN THE Client SHALL display an error and return the player to the entry form.

---

### Requirement 8: Netplay Battle Integration

**User Story:** As a player, I want the netplay battle to use the same battle engine as local play, so that the rules and resolution are identical regardless of connection mode.

#### Acceptance Criteria

1. WHEN a netplay Session transitions to `in_progress`, THE Matchmaking_Server SHALL create a BattleState via the Battle_Engine using the same team generation and resolution logic as pass-n-play mode.
2. THE Battle_Engine SHALL accept orders from two separate network clients for the same Battle, treating each client as an authoritative source for their respective player's orders only.
3. THE Battle_Engine SHALL validate that each submitted OrderSet originates from the correct player's session token before applying it.
4. WHEN both players have submitted orders, THE Battle_Engine SHALL resolve the turn server-side and push the updated BattleState to both Clients simultaneously.
5. THE Battle_Engine SHALL reject and ignore any order submission that arrives after resolution for that turn has already begun.

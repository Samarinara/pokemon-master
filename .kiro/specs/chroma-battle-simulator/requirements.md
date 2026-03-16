# Requirements Document

## Introduction

CHROMA is a simultaneous-move, 2-v-2 turn-based battle simulator built on a colour-theory type chart and fighting-game mind-games. Two players share a single device (pass-n-play), each secretly assigning orders to their two active fighters during a 15-second planning phase. Orders are locked simultaneously, then resolved server-side in priority and speed order. The architecture must not preclude future online multiplayer (netplay): all randomness and turn resolution must originate on the server, never on the client.

Each player fields a roster of 3 birds (2 active, 1 bench). A match is best-of-3 battles. One battle ends when both of a player's active birds are KO'd.

---

## Glossary

- **Battle**: A single bout between two players; ends when one player's both active birds are KO'd.
- **Match**: A best-of-3 series of Battles.
- **Bird**: A combatant with stats, a colour type, and a moveset.
- **Roster**: A player's set of 3 Birds for a Match; no duplicates allowed.
- **Active**: One of the two field slots (Left / Right) occupied by a Bird currently fighting.
- **Bench**: The single off-field slot holding the third Bird.
- **Planning Phase**: The simultaneous 15-second window in which both players assign orders.
- **Order**: One of Attack, Block, or Switch assigned to an Active Bird for a turn.
- **Priority**: An integer field on a move that determines its position in the Resolution Queue relative to other moves. Default is 0; higher values go earlier, lower values go later.
- **Resolution Queue**: The ordered list of all actions for a turn, sorted first by Priority (descending), then by SPD (descending) within the same Priority tier, then by server-side RNG for ties within the same Priority and SPD.
- **Reversal Window**: An instant opportunity granted to the defender's bench after a correct high/low block.
- **Switch-Attack**: A Switch order that also fires a move immediately after the incoming Bird enters.
- **STAB**: Same-Type Attack Bonus applied when a Bird uses a move matching its own colour.
- **Spirit**: A stat that governs accuracy and acts as a critical-hit buffer.
- **Stage**: A temporary ±1/±2 modifier to a stat; caps at ±6; resets on switch-out.
- **DOT**: Damage-over-time effect applied at end of turn (e.g. Bleed).
- **Colour**: The type of a Bird or move; determines type-effectiveness and STAB.
- **Primary Colour**: Red, Yellow, or Blue (cycle: Red → Yellow → Blue → Red).
- **Secondary Colour**: Orange, Purple, or Green (cycle: Orange → Purple → Green → Orange).
- **Neutral Colour**: Pink or Black (super-effective against each other only).
- **Power Tier**: Weak (40), Normal (70), or Strong (100) base power for a move.
- **Height**: The attack/block axis of a move or block order: High, Mid, or Low.
- **Crit**: A critical hit triggered when attack height mismatches block height (High vs Low or Low vs High).
- **Server**: The Next.js server action layer responsible for all game logic and randomness.
- **Client**: The browser-side UI; receives state snapshots only.
- **Pass-n-Play**: A mode where two players share one device, taking turns at the same screen.
- **Team Generator**: The Server component that randomly assembles a valid Roster for a player.
- **Battle Engine**: The Server component that executes turn resolution and maintains authoritative state.
- **State Store**: The persistent storage (SQLite via sql.js) that holds serialised BattleState records.

---

## Requirements

### Requirement 1: Random Team Generation

**User Story:** As a player, I want the game to randomly generate a team for me, so that I can start playing immediately without manually building a roster.

#### Acceptance Criteria

1. WHEN a new Battle is started, THE Team_Generator SHALL produce a Roster of exactly 3 Birds for each player.
2. THE Team_Generator SHALL ensure no two Birds in the same Roster share the same identity.
3. THE Team_Generator SHALL assign each Bird a Colour drawn from the set {Red, Yellow, Blue, Orange, Purple, Green, Pink, Black}.
4. THE Team_Generator SHALL assign each Bird stats (HP, STR, GUTS, SPD, SPIRIT) within the ranges defined in the Glossary (HP 120–220, all others 60–140).
5. THE Team_Generator SHALL assign each Bird a moveset of at least 4 moves, each move conforming to the Move Template (Requirement 6).
6. THE Team_Generator SHALL execute entirely on the Server; the Client SHALL receive only the resulting Roster data, never the random seed or intermediate values.
7. WHEN team generation is complete, THE Battle_Engine SHALL place 2 Birds in Active slots and 1 Bird in the Bench slot for each player, according to the placement rules in Requirement 3.

---

### Requirement 2: Pass-n-Play Mode

**User Story:** As two players sharing one device, I want to take turns submitting my orders on the same screen, so that we can play a full match without needing separate devices.

#### Acceptance Criteria

1. THE Battle_Engine SHALL support a pass-n-play session in which Player 1 and Player 2 submit orders sequentially on the same device.
2. WHEN the Planning Phase begins, THE Client SHALL display only the active player's planning UI and conceal the opponent's orders until both players have locked in.
3. WHEN Player 1 has locked orders, THE Client SHALL prompt Player 2 to take the device and submit their orders before resolution begins.
4. WHEN both players have locked orders, THE Battle_Engine SHALL resolve the turn server-side and return the updated BattleState to the Client.
5. THE Client SHALL display the post-resolution timeline and battle log to both players simultaneously after resolution.
6. WHEN a Battle ends, THE Battle_Engine SHALL record the winner and update the Match score.
7. WHEN the Match score reaches 2 wins for one player, THE Battle_Engine SHALL mark the Match as complete and declare that player the Match winner.

---

### Requirement 3: Roster Placement (Turn 0)

**User Story:** As a player, I want to secretly choose which 2 of my 3 Birds start as Active and which 1 starts on the Bench, so that I can set up my preferred opening formation.

#### Acceptance Criteria

1. WHEN a Battle begins, THE Client SHALL present each player (in pass-n-play order) with a private placement screen showing their 3 Birds.
2. THE Battle_Engine SHALL require each player to designate exactly 2 Birds as Active (Left slot and Right slot) and exactly 1 Bird as Bench before the first Planning Phase begins.
3. IF a player attempts to confirm placement with fewer or more than 2 Active Birds, THEN THE Client SHALL display a validation error and prevent submission.
4. THE Battle_Engine SHALL keep each player's placement hidden from the opponent until both players have confirmed.

---

### Requirement 4: Planning Phase

**User Story:** As a player, I want a 15-second window to assign one order to each of my Active Birds simultaneously with my opponent, so that the game has a mind-game element.

#### Acceptance Criteria

1. WHEN a turn begins, THE Client SHALL start a 15-second countdown timer visible to the active player.
2. WHILE the Planning Phase is active, THE Client SHALL present a 4-action grid showing Left Active and Right Active with order options: Attack (pick move + target), Block (pick High or Low), and Switch (pick Bench mate + optional Switch-Attack move).
3. THE Battle_Engine SHALL accept locked orders only after both players have submitted or the timer expires.
4. IF the timer expires before a player submits orders, THEN THE Battle_Engine SHALL auto-assign a default Block (Low) order to any unassigned Active Bird for that player.
5. WHEN a player locks orders, THE Client SHALL conceal those orders from the opponent until resolution.
6. THE Battle_Engine SHALL not begin resolution until orders from both players are received.

---

### Requirement 5: Turn Resolution (Server-Side)

**User Story:** As a player, I want turn resolution to happen on the server with consistent randomness, so that the outcome is fair and the system is ready for future online multiplayer.

#### Acceptance Criteria

1. THE Battle_Engine SHALL perform all turn resolution logic on the Server; the Client SHALL never compute damage, accuracy rolls, or any random outcome.
2. THE Battle_Engine SHALL build a Resolution Queue by collecting all locked actions and sorting them first by the move's Priority (descending), then by the acting Bird's SPD stat (descending) within the same Priority tier.
3. WHEN two actions share the same Priority value and the same SPD value, THE Battle_Engine SHALL resolve the tie using a server-generated random value.
4. THE Battle_Engine SHALL execute actions in Resolution Queue order; state changes from earlier actions SHALL be visible to later actions in the same queue.
5. WHEN an Attack action is executed, THE Battle_Engine SHALL apply the Attack vs Block rules defined in Requirement 7.
6. WHEN a Switch action is executed, THE Battle_Engine SHALL apply the Switching rules defined in Requirement 10.
7. AFTER all queued actions are executed, THE Battle_Engine SHALL apply end-of-turn effects defined in Requirement 11.
8. THE Battle_Engine SHALL persist the updated BattleState to the State_Store after each resolution.
9. THE Battle_Engine SHALL use a server-side random number generator for all probabilistic outcomes (accuracy rolls, status proc chances, tie-breaking); no random values SHALL be generated on the Client.

---

### Requirement 6: Move System

**User Story:** As a player, I want moves to have distinct properties (colour, height, power, accuracy, effects), so that choosing the right move is a meaningful tactical decision.

#### Acceptance Criteria

1. THE Battle_Engine SHALL represent every move with the fields: Name, Colour, Height (High/Mid/Low), Power Tier (Weak/Normal/Strong), Accuracy (10–100%), Priority (integer, default 0), optional Stat Stage effect (±1 or ±2 to user or target), optional Status effect (Bleed/Shaken/Bruised with separate proc %), and Flags (Reversal-legal, Switch-Attack-legal, Contact, Special).
2. WHEN a move is executed, THE Battle_Engine SHALL compute base power as: Weak = 40, Normal = 70, Strong = 100.
3. WHEN a Reversal-flagged move is used in a Reversal Window, THE Battle_Engine SHALL reduce its effective Power Tier by one step (Strong → Normal → Weak; Weak stays Weak) and SHALL NOT apply any status effect from that move.
4. WHEN a Switch-Attack-flagged move is used as a Switch-Attack, THE Battle_Engine SHALL reduce its effective Power Tier by one step.
5. WHEN a move has an Accuracy value, THE Battle_Engine SHALL compute TrueAcc = moveAcc × (1 + (Spirit – 60) / 400), capped between 10% and 100%.
6. WHEN a move's accuracy check fails, THE Battle_Engine SHALL record a miss and deal no damage.
7. WHEN a move has a Status effect, THE Battle_Engine SHALL apply that status to the target with the specified proc % chance, resolved server-side.
8. WHEN a move has a Stat Stage effect, THE Battle_Engine SHALL apply the stage modifier to the specified stat, capped at ±6.

---

### Requirement 7: Attack vs Block Resolution

**User Story:** As a player, I want blocking to interact with attack height in a meaningful way, so that guessing the right block height is rewarded.

#### Acceptance Criteria

1. WHEN an Attack with Height Mid connects against a blocking Bird, THE Battle_Engine SHALL deal normal damage and SHALL NOT grant a Reversal Window.
2. WHEN an Attack with Height High or Low connects against a blocking Bird that chose the correct matching block height, THE Battle_Engine SHALL deal ½ damage and SHALL grant a Reversal Window to the defender.
3. WHEN an Attack with Height High or Low connects against a blocking Bird that chose the wrong block height (a Crit), THE Battle_Engine SHALL deal 1.5× damage, reduce the defender's Spirit by 10, and SHALL NOT grant a Reversal Window.
4. IF a Crit would reduce a target's HP to 0 and the target's HP was above 50% of its maximum HP before the hit, THEN THE Battle_Engine SHALL set the target's HP to 1 instead.
5. WHEN a Crit occurs, THE Battle_Engine SHALL reduce the target's Spirit by 10 (in addition to any other Spirit changes).
6. WHEN an Attack targets a Bird that is not blocking, THE Battle_Engine SHALL deal normal damage without applying block or crit logic.

---

### Requirement 8: Damage Formula

**User Story:** As a player, I want damage to reflect the attacker's STR, the defender's GUTS, type effectiveness, and STAB, so that team composition and move selection matter.

#### Acceptance Criteria

1. THE Battle_Engine SHALL compute final damage using: base = PowerTier × (STR / 100); after_guts = base × 100 / (100 + GUTS); after_type = after_guts × TypeMultiplier; final = after_type × STAB × CritMultiplier × BlockMultiplier.
2. WHEN a Primary-Colour Bird uses a move of its own Colour, THE Battle_Engine SHALL apply a STAB multiplier of 1.5×.
3. WHEN a Secondary-Colour Bird uses a move of its own Colour or of either of its two constituent Primary Colours, THE Battle_Engine SHALL apply a STAB multiplier of 1.2×.
4. THE Battle_Engine SHALL apply type multipliers: Super-effective 2×, Not very effective 0.5×, Neutral 1×, using the type chart defined in the Glossary.
5. THE Battle_Engine SHALL apply the Primary cycle (Red → Yellow → Blue → Red) and Secondary cycle (Orange → Purple → Green → Orange) for super-effective and not-very-effective relationships.
6. THE Battle_Engine SHALL treat Pink and Black as Neutral against all Colours except each other, where they are Super-effective (2×) against each other.
7. WHEN a Stat Stage modifier is active, THE Battle_Engine SHALL apply it as a linear multiplier: stage +1 = ×1.5, +2 = ×2.0, –1 = ×0.67, –2 = ×0.5 (applied to the relevant stat before damage calculation).

---

### Requirement 9: Reversal Window

**User Story:** As a defending player, I want my bench bird to be able to intervene after a successful block, so that correct blocking is rewarded with a tactical counter-play option.

#### Acceptance Criteria

1. WHEN a Reversal Window is granted, THE Battle_Engine SHALL pause the Resolution Queue and prompt the defending player's Client to choose a Reversal action.
2. WHILE a Reversal Window is active, THE Client SHALL display a prompt with a 3-second auto-timeout; if the player does not respond within 3 seconds, THE Battle_Engine SHALL default to declining the Reversal.
3. WHEN a player accepts a Reversal, THE Battle_Engine SHALL allow the Bench Bird to either perform a Reversal-flagged move (at –1 Power Tier, no status) or automatically tag in (replacing the blocker).
4. WHEN a Reversal tag-in occurs, THE Battle_Engine SHALL move the blocker to the Bench and place the incoming Bird in the Active slot.
5. WHEN a Reversal action is taken, THE Battle_Engine SHALL mark the incoming Bird as losing its next turn's action.
6. AFTER the Reversal action resolves, THE Battle_Engine SHALL resume the Resolution Queue from the next action.

---

### Requirement 10: Switching Rules

**User Story:** As a player, I want to switch my active bird out for my bench bird, optionally firing a move on entry, so that I can adapt my formation mid-battle.

#### Acceptance Criteria

1. WHEN a player assigns a Switch order, THE Battle_Engine SHALL resolve it at the acting Bird's SPD slot in the Resolution Queue.
2. WHEN a Switch resolves, THE Battle_Engine SHALL move the outgoing Bird to the Bench and place the incoming Bird in the Active slot.
3. WHEN a Switch resolves, THE Battle_Engine SHALL reset all Stat Stages of the outgoing Bird to 0.
4. WHEN a Switch-Attack order is assigned, THE Battle_Engine SHALL execute the chosen Switch-Attack-flagged move immediately after the incoming Bird enters, at –1 Power Tier.
5. WHEN a Reversal tag-in is used, THE Battle_Engine SHALL consume the incoming Bird's next turn action (that Bird cannot act on the following turn).

---

### Requirement 11: End-of-Turn Effects

**User Story:** As a player, I want status conditions and win checks to be applied consistently at the end of each turn, so that ongoing effects are predictable.

#### Acceptance Criteria

1. AFTER all Resolution Queue actions complete, THE Battle_Engine SHALL apply DOT and status tick effects to all Birds with active status conditions.
2. WHEN a Bird has Bleed, THE Battle_Engine SHALL reduce its HP by 1/8 of its maximum HP and apply –1 stage to STR and SPIRIT at end of turn.
3. WHEN a Bird has Shaken, THE Battle_Engine SHALL apply –30% to its effective accuracy and –1 stage to SPD at end of turn.
4. WHEN a Bird has Bruised and deals damage, THE Battle_Engine SHALL deal 15% of the damage dealt back to the attacker, capped at 25% of the attacker's maximum HP.
5. AFTER DOT effects are applied, THE Battle_Engine SHALL recover each Bird's Spirit by 5 points (up to its base maximum).
6. AFTER end-of-turn effects, THE Battle_Engine SHALL check the win condition: if both Active Birds of a player are KO'd (HP = 0), that player loses the Battle.
7. IF the win condition is met, THEN THE Battle_Engine SHALL end the Battle, record the winner, and update the Match score.

---

### Requirement 12: Spirit and Accuracy

**User Story:** As a player, I want Spirit to degrade when I take crits and recover over time, so that sustaining pressure has a meaningful accuracy cost.

#### Acceptance Criteria

1. THE Battle_Engine SHALL initialise each Bird's Spirit to its base SPIRIT stat value at the start of a Battle.
2. WHEN a Bird is the target of a Crit, THE Battle_Engine SHALL reduce that Bird's Spirit by 10.
3. AFTER end-of-turn effects, THE Battle_Engine SHALL increase each Bird's Spirit by 5, up to its base SPIRIT maximum.
4. THE Battle_Engine SHALL compute TrueAcc for each move as: TrueAcc = moveAcc × (1 + (Spirit – 60) / 400), capped between 10% and 100%.
5. THE Client SHALL display the current Spirit value and live accuracy percentage for each Active Bird.

---

### Requirement 13: UI — Planning Screen

**User Story:** As a player, I want a clear planning interface showing my options for both active birds, so that I can make informed decisions quickly.

#### Acceptance Criteria

1. THE Client SHALL render a planning screen with a 4-action grid: Left Active column and Right Active column, each with Attack, Block (High), Block (Low), and Switch options.
2. THE Client SHALL display a damage preview for each Attack option that includes STAB multiplier, type effectiveness multiplier, and crit multiplier (shown in brackets when a crit is possible).
3. THE Client SHALL display a visible Spirit meter and live accuracy percentage for each Active Bird.
4. WHEN a player selects Block, THE Client SHALL present distinct High and Low block buttons.
5. THE Client SHALL display the 15-second countdown timer prominently during the Planning Phase.

---

### Requirement 14: UI — Timeline Bar

**User Story:** As a player, I want to see the resolution order after locking in orders, so that I can understand how the turn will play out.

#### Acceptance Criteria

1. AFTER both players lock orders, THE Client SHALL display a timeline bar showing all queued actions sorted left-to-right by SPD (highest first).
2. THE Client SHALL render each action in the timeline with a colour-coded height icon (High / Mid / Low).
3. WHEN a Reversal Window prompt appears, THE Client SHALL display it inline within the timeline bar with a 3-second countdown.
4. THE Client SHALL highlight the currently executing action in the timeline during resolution playback.

---

### Requirement 15: Netplay-Ready Architecture

**User Story:** As a developer, I want the architecture to support future online multiplayer without requiring a rewrite, so that netplay can be added as an incremental feature.

#### Acceptance Criteria

1. THE Battle_Engine SHALL expose turn resolution as a pure server-side function that accepts a BattleState and two sets of locked orders, and returns an updated BattleState.
2. THE Battle_Engine SHALL never rely on client-side state for resolution inputs; all inputs SHALL be validated and authoritative on the Server.
3. THE State_Store SHALL persist the full BattleState after every resolution so that a session can be resumed or replicated to a remote peer.
4. THE Battle_Engine SHALL generate all random values (accuracy rolls, status procs, speed tie-breaks, team generation) using a server-side RNG; the Client SHALL receive only deterministic state snapshots.
5. THE Battle_Engine SHALL be designed so that replacing the pass-n-play input collection with a network socket requires changes only to the input-collection layer, not to the resolution logic.

---

### Requirement 16: Move Parser and Pretty-Printer

**User Story:** As a developer, I want moves and rosters to be defined in a structured data format that can be parsed and serialised reliably, so that the move database is maintainable and testable.

#### Acceptance Criteria

1. WHEN a valid move definition object is provided, THE Move_Parser SHALL parse it into a typed Move record.
2. WHEN an invalid move definition is provided, THE Move_Parser SHALL return a descriptive validation error identifying the offending field.
3. THE Pretty_Printer SHALL serialise a Move record back into a valid move definition object.
4. FOR ALL valid Move records, parsing then printing then parsing SHALL produce an equivalent Move record (round-trip property).
5. WHEN a valid Roster definition is provided, THE Move_Parser SHALL parse all moves in the Roster and return a typed Roster record.

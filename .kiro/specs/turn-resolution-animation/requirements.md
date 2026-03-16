# Requirements Document

## Introduction

After both players lock in their orders for a turn, the battle currently jumps straight to the planning phase with only a text log to show what happened. This feature introduces a dedicated Turn Resolution Animation Screen that plays out the turn visually — showing each action in the resolution queue one at a time, with animated HP/Spirit bar changes, move announcements, hit/miss/crit feedback, and status effects — before returning the player to the planning phase. The goal is to give players clear, satisfying visual feedback about what happened during the turn without requiring any server-side changes.

## Glossary

- **Resolution_Screen**: The full-screen UI component that plays out a resolved turn's animation sequence.
- **Action_Beat**: A single animated step corresponding to one `ResolvedAction` in the resolution queue (e.g. one bird attacking, blocking, or switching).
- **Beat_Animator**: The sub-component responsible for rendering and sequencing individual Action_Beats.
- **HP_Bar**: The visual bar representing a `BirdInstance`'s `currentHp` relative to `bird.baseStats.hp`.
- **Spirit_Bar**: The visual bar representing a `BirdInstance`'s `currentSpirit` relative to `bird.baseStats.spirit`.
- **Snapshot**: An immutable copy of `BattleState` captured at a specific point during turn resolution, used to drive animation frames.
- **BattleState**: The existing game state type defined in `lib/types.ts`.
- **ResolvedAction**: The existing type in `lib/types.ts` representing one entry in the resolution queue.
- **LogEntry**: The existing type in `lib/types.ts` representing one line of battle log text.
- **BattleClient**: The existing `app/battle/[id]/BattleClient.tsx` component that orchestrates battle phase rendering.
- **PlanningScreen**: The existing `components/battle/PlanningScreen.tsx` component shown during the planning phase.

## Requirements

### Requirement 1: Display the Resolution Screen after orders are submitted

**User Story:** As a player, I want a dedicated animation screen to appear after both players lock in their moves, so that I can see what happened during the turn before planning my next move.

#### Acceptance Criteria

1. WHEN both players' orders have been submitted and the server returns a resolved `BattleState` with `phase` equal to `"end_of_turn"` or `"battle_ended"`, THE BattleClient SHALL render the Resolution_Screen instead of immediately transitioning to the PlanningScreen or MatchSummary.
2. WHEN the Resolution_Screen finishes playing all Action_Beats, THE BattleClient SHALL transition to the PlanningScreen (if `phase` is `"planning"`) or MatchSummary (if `phase` is `"battle_ended"`).
3. THE Resolution_Screen SHALL accept the pre-resolution `BattleState` Snapshot and the post-resolution `BattleState` as inputs to derive the animation sequence.
4. THE Resolution_Screen SHALL be skippable: WHEN the player activates the skip control, THE Resolution_Screen SHALL immediately complete and transition to the next phase.

### Requirement 2: Animate each action in the resolution queue sequentially

**User Story:** As a player, I want each bird's action to be shown one at a time in resolution order, so that I can follow the sequence of events clearly.

#### Acceptance Criteria

1. THE Beat_Animator SHALL display Action_Beats in the same order as `BattleState.resolutionQueue`.
2. WHEN an Action_Beat begins, THE Beat_Animator SHALL display the acting bird's name, the action type (attack / block / switch), and — for attacks — the move name and target bird's name.
3. WHEN an attack Action_Beat resolves as a hit, THE Beat_Animator SHALL animate the target's HP_Bar from its pre-hit value to its post-hit value over a duration of no less than 300ms.
4. WHEN an attack Action_Beat resolves as a miss, THE Beat_Animator SHALL display a "Missed!" indicator for no less than 500ms before advancing to the next beat.
5. WHEN an attack Action_Beat resolves as a critical hit, THE Beat_Animator SHALL display a "Critical Hit!" indicator alongside the HP_Bar animation.
6. WHEN a switch Action_Beat resolves, THE Beat_Animator SHALL display the outgoing and incoming bird names for no less than 500ms.
7. WHEN a block Action_Beat resolves, THE Beat_Animator SHALL display the blocking bird's name and block height for no less than 300ms.
8. THE Beat_Animator SHALL pause for no less than 400ms between consecutive Action_Beats to give the player time to read each result.

### Requirement 3: Show live bird stat panels during animation

**User Story:** As a player, I want to see both teams' bird cards updating in real time as the animation plays, so that I always know the current HP and Spirit of every bird.

#### Acceptance Criteria

1. THE Resolution_Screen SHALL display all six `BirdInstance` panels (p1 left, p1 right, p1 bench, p2 left, p2 right, p2 bench) simultaneously throughout the animation.
2. WHEN an Action_Beat causes a change to a `BirdInstance`'s `currentHp`, THE Resolution_Screen SHALL animate the corresponding HP_Bar to the new value.
3. WHEN an Action_Beat causes a change to a `BirdInstance`'s `currentSpirit`, THE Resolution_Screen SHALL animate the corresponding Spirit_Bar to the new value.
4. WHEN a `BirdInstance`'s `currentHp` reaches zero during an Action_Beat, THE Resolution_Screen SHALL display a fainted indicator on that bird's panel before advancing to the next beat.
5. WHILE a `BirdInstance` has a non-null `status` condition, THE Resolution_Screen SHALL display the status badge on that bird's panel.

### Requirement 4: Display the turn's battle log entries alongside the animation

**User Story:** As a player, I want to see the text log entries appear in sync with the animation, so that I have a readable record of what happened.

#### Acceptance Criteria

1. THE Resolution_Screen SHALL display a scrollable log panel that starts empty at the beginning of the animation sequence.
2. WHEN an Action_Beat completes, THE Resolution_Screen SHALL append the corresponding `LogEntry` text to the log panel.
3. THE Resolution_Screen SHALL auto-scroll the log panel to the most recent entry after each append.
4. WHEN the player activates the skip control, THE Resolution_Screen SHALL display all remaining `LogEntry` items in the log panel immediately.

### Requirement 5: Handle the reversal window within the animation

**User Story:** As a player, I want to see the reversal window opportunity highlighted during the animation, so that I understand when a reversal was available.

#### Acceptance Criteria

1. WHEN a resolved `BattleState` contains a non-null `reversalWindow`, THE Resolution_Screen SHALL display a visual indicator identifying the defending player and slot for which the reversal window was open.
2. THE Resolution_Screen SHALL display the reversal window indicator for no less than 1000ms before continuing the animation sequence.
3. IF no reversal was taken during the actual turn, THE Resolution_Screen SHALL display the reversal window as expired (greyed out or dismissed) after the indicator duration.

### Requirement 6: Derive animation frames from pre- and post-resolution state snapshots

**User Story:** As a developer, I want the animation to be driven purely from existing state data, so that no new server-side logic is required.

#### Acceptance Criteria

1. THE Resolution_Screen SHALL derive all animation frames exclusively from the `resolutionQueue`, `battleLog`, and the sequence of per-action `BattleState` Snapshots reconstructed client-side by replaying the queue.
2. THE Resolution_Screen SHALL NOT make any network requests during animation playback.
3. WHEN the pre-resolution `BattleState` and post-resolution `BattleState` are provided, THE Resolution_Screen SHALL reconstruct intermediate Snapshots by applying each `ResolvedAction` in order using the existing engine functions available client-side.
4. FOR ALL valid pre-resolution `BattleState` inputs, replaying the full resolution queue SHALL produce a final Snapshot whose `p1Field`, `p2Field`, and `battleLog` are equal to those of the post-resolution `BattleState` (round-trip property).

### Requirement 7: Accessibility and responsiveness

**User Story:** As a player on any device, I want the animation screen to be readable and usable, so that I can follow the turn on mobile and desktop alike.

#### Acceptance Criteria

1. THE Resolution_Screen SHALL be responsive and render correctly at viewport widths from 320px to 1920px.
2. THE Resolution_Screen SHALL provide a clearly labelled skip control that is reachable via keyboard (Tab + Enter/Space) as well as pointer input.
3. WHILE animations are playing, THE Resolution_Screen SHALL not block the skip control from receiving focus or activation.
4. WHERE the user has enabled the `prefers-reduced-motion` media query, THE Resolution_Screen SHALL complete each Action_Beat without CSS transitions or keyframe animations, relying only on instant state updates.

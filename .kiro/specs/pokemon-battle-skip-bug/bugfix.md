# Bugfix Requirements Document

## Introduction

Clicking "Start Battle" in the pass-and-play Pokemon battle game immediately shows a win screen without any battle taking place. No moves are presented to either player and no turns are played. This makes the game completely unplayable.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user clicks the "Start Battle" button THEN the system sets battle status to "ended" immediately without presenting any moves or turns to either player.

1.2 WHEN the battle simulator is started and the initial player request cannot be parsed from the simulator output THEN the system treats the missing request as a battle-over condition and sets `winner` or `status = "ended"`.

1.3 WHEN `startBattle()` completes THEN the system returns a battle state with `status = "ended"` and skips directly to the win screen.

### Expected Behavior (Correct)

2.1 WHEN a user clicks the "Start Battle" button THEN the system SHALL present Player 1 with their available moves and switches so the battle can begin.

2.2 WHEN the battle simulator starts and a valid player request is present in the output THEN the system SHALL correctly parse that request and set `status = "p1_turn"` with populated `availableMoves`.

2.3 WHEN `startBattle()` completes THEN the system SHALL return a battle state with `status = "p1_turn"`, a non-empty `availableMoves` list, and `winner = null`.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a player selects a move during their turn THEN the system SHALL CONTINUE TO advance the battle state and switch to the other player's turn.

3.2 WHEN all of one player's Pokemon have fainted THEN the system SHALL CONTINUE TO set `status = "ended"` and declare the correct winner.

3.3 WHEN a player's active Pokemon faints mid-battle THEN the system SHALL CONTINUE TO prompt that player to switch to a remaining Pokemon before the turn advances.

3.4 WHEN a player clicks "Play Again" after a battle ends THEN the system SHALL CONTINUE TO reset the state and allow a new battle to start.

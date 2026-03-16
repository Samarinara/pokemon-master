# Pokemon Battle Skip Bug - Bugfix Design

## Overview

When a user clicks "Start Battle", the game immediately shows a win screen instead of presenting Player 1's moves. The root cause is in `parseRequestFromOutput` in `scripts/sim.cjs`. The pokemon-showdown simulator emits `sideupdate` blocks as a single output chunk where the player identifier and request JSON are separated by embedded `\n` characters within one logical block — but the function splits the entire output on `\n` and then looks for a line whose trimmed value is exactly `"sideupdate"`. Because the simulator wraps the sideupdate block differently than expected (the token may appear as part of a larger line or the surrounding whitespace/line-ending format differs), the scan returns `null`. Back in `startBattle()`, a `null` request is treated as a battle-over condition, setting `state.status = "ended"` before any turn is played.

The fix is to correct `parseRequestFromOutput` so it reliably locates the `|request|` JSON for the given player from the raw simulator output.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `parseRequestFromOutput` returns `null` for the initial p1 request even though a valid request is present in the simulator output.
- **Property (P)**: The desired behavior — when a valid `|request|` block exists for a player in the simulator output, `parseRequestFromOutput` SHALL return the parsed request object (non-null).
- **Preservation**: Existing mid-battle turn logic, win detection, and forced-switch handling that must remain unchanged by the fix.
- **parseRequestFromOutput**: The function in `scripts/sim.cjs` that scans raw simulator output for a `sideupdate` block belonging to a given player and returns the parsed request JSON.
- **sideupdate block**: A section of simulator output that contains a player-specific request. Its format in the raw output is: a line containing `sideupdate`, followed by a line with the player identifier (e.g. `p1`), followed by a line starting with `|request|` and the JSON payload.
- **startBattle**: The function in `scripts/sim.cjs` that initialises a new battle and must return `status = "p1_turn"` with populated `availableMoves`.

## Bug Details

### Bug Condition

`parseRequestFromOutput` fails to locate the `sideupdate` block for the given player in the raw simulator output. The function splits the output on `"\n"` and iterates looking for a line whose trimmed value is exactly `"sideupdate"`, but the actual output contains the token in a form that does not match this check (e.g. trailing carriage returns on Windows, the token appearing inside a larger chunk, or the surrounding lines not aligning with the expected index offsets `i+1` / `i+2`).

**Formal Specification:**
```
FUNCTION isBugCondition(output, player)
  INPUT: output — raw string from pokemon-showdown simulator
         player — "p1" or "p2"
  OUTPUT: boolean

  RETURN simulatorOutputContainsValidRequest(output, player)
         AND parseRequestFromOutput(output, player) = null
END FUNCTION
```

### Examples

- **Start of battle, p1 request present but not found**: Simulator emits a sideupdate block for p1 with 4 available moves. `parseRequestFromOutput(output, "p1")` returns `null`. `startBattle()` sets `state.status = "ended"`. Win screen shown immediately. ← **Bug**
- **Mid-battle, p2 request present but not found**: After p1 submits a move, simulator emits a sideupdate for p2. `parseRequestFromOutput(output, "p2")` returns `null`. `makeChoice()` sets `state.status = "ended"` prematurely. ← **Same root cause, different call site**
- **Battle genuinely over (no request in output)**: Simulator emits `|win|Player 1` with no sideupdate block. `parseRequestFromOutput` correctly returns `null`. `status = "ended"` is correct. ← **Not a bug — must be preserved**
- **Forced switch after faint**: Simulator emits a sideupdate for the same player with a `forceSwitch` request. `parseRequestFromOutput` must return the request so the player can choose a replacement. ← **Must be preserved after fix**

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When a player selects a move, the battle state SHALL advance and switch to the other player's turn.
- When all of one player's Pokémon have fainted, `status` SHALL be set to `"ended"` and the correct winner SHALL be declared.
- When a player's active Pokémon faints mid-battle, that player SHALL be prompted to switch before the turn advances.
- When a player clicks "Play Again", the state SHALL reset and a new battle SHALL be startable.

**Scope:**
All inputs that do NOT involve the initial battle start (i.e. mid-battle `makeChoice` calls where the request is already correctly parsed, and genuine battle-over conditions) should be completely unaffected by this fix. This includes:
- Move selection and turn advancement
- Win condition detection via `|win|` lines
- Forced-switch prompts after a faint
- Mouse/button interactions in the UI layer

## Hypothesized Root Cause

Based on reading `parseRequestFromOutput` and the pokemon-showdown output format:

1. **Line-ending mismatch**: The simulator may emit `\r\n` line endings on some platforms. Splitting on `"\n"` leaves `\r` attached to each token, so `lines[i].trim() === "sideupdate"` fails because `trim()` does strip `\r` — actually `trim()` handles this. This is less likely but worth noting.

2. **Chunk boundary / embedded newlines**: `execSync` returns the full stdout as one string. The sideupdate section may be formatted as `"sideupdate\np1\n|request|{...}\n"` embedded inside a larger block that is itself prefixed or suffixed with other content on the same logical "line" before the split. If the simulator wraps the block in a `|update|` envelope or similar, the raw `"sideupdate"` token never appears as a standalone line.

3. **Off-by-one in index lookup**: The function checks `lines[i+1]` for the player and `lines[i+2]` for the request line. If there are blank lines or extra whitespace lines between the `sideupdate` token and the player identifier, the indices are wrong and the request line is never found.

4. **Regex-based approach would be more robust**: A regex that searches for the pattern `sideupdate\n{player}\n|request|{json}` anywhere in the output (regardless of surrounding content) would be immune to all of the above issues.

## Correctness Properties

Property 1: Bug Condition - Request Parsing Returns Non-Null for Valid Output

_For any_ simulator output string that contains a well-formed `sideupdate` block for player `p` (i.e. the block is present and the JSON is valid), the fixed `parseRequestFromOutput(output, p)` SHALL return a non-null parsed request object with `active` and/or `side` fields populated.

**Validates: Requirements 2.2, 2.3**

Property 2: Preservation - Null Returned When No Request Present

_For any_ simulator output string that does NOT contain a `sideupdate` block for player `p` (genuine battle-over output), the fixed `parseRequestFromOutput(output, p)` SHALL return `null`, preserving the existing win/ended detection logic.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

**File**: `scripts/sim.cjs`

**Function**: `parseRequestFromOutput`

**Specific Changes**:

1. **Replace line-split scan with a regex search**: Instead of splitting on `"\n"` and walking indices, use a single regex that matches the sideupdate block for the target player anywhere in the output string. This is robust to surrounding content, blank lines, and line-ending variations.

   ```
   Pattern: /sideupdate\r?\n{player}\r?\n\|request\|(.+)/
   ```

2. **Extract and parse the JSON capture group**: The regex capture group contains everything after `|request|` on that line. Pass it directly to `JSON.parse`. Wrap in try/catch and return `null` on failure (existing behaviour).

3. **No changes to call sites**: `startBattle()` and `makeChoice()` in `scripts/sim.cjs` already handle the `null` vs non-null return correctly — the only change needed is inside `parseRequestFromOutput` itself.

4. **No changes to `lib/battle.ts` or UI layer**: The fix is entirely contained within `scripts/sim.cjs`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that call `parseRequestFromOutput` with a synthetic output string that contains a well-formed sideupdate block, and assert that the result is non-null. Run these tests against the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Basic p1 request**: Call `parseRequestFromOutput` with a minimal output string containing a `sideupdate\np1\n|request|{...}` block — expect non-null (will fail on unfixed code if root cause is confirmed).
2. **p2 request**: Same as above but for `p2` — expect non-null.
3. **Request embedded in larger output**: Wrap the sideupdate block in surrounding simulator lines (e.g. `|update|` lines before it) — expect non-null.
4. **No request in output**: Pass output with only a `|win|` line and no sideupdate block — expect `null` (should pass on both unfixed and fixed code).

**Expected Counterexamples**:
- `parseRequestFromOutput` returns `null` even when a valid sideupdate block is present in the output.
- Possible causes: the `"sideupdate"` token is not appearing as a standalone trimmed line due to surrounding content or line-ending issues.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL output WHERE isBugCondition(output, "p1") DO
  result := parseRequestFromOutput_fixed(output, "p1")
  ASSERT result != null
  ASSERT result.active != null OR result.forceSwitch != null
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL output WHERE NOT isBugCondition(output, player) DO
  ASSERT parseRequestFromOutput_original(output, player)
       = parseRequestFromOutput_fixed(output, player)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many output string variations automatically across the input domain.
- It catches edge cases (extra blank lines, different player identifiers, malformed JSON) that manual unit tests might miss.
- It provides strong guarantees that `null` is still returned for all genuinely request-free outputs.

**Test Plan**: Observe that `parseRequestFromOutput` already returns `null` correctly for battle-over output on the unfixed code, then write property-based tests to verify this continues after the fix.

**Test Cases**:
1. **Win-only output preservation**: Verify that output containing only `|win|Player 1` still returns `null` after the fix.
2. **Wrong player preservation**: Verify that output with a sideupdate for `p1` returns `null` when queried for `p2`, and vice versa.
3. **Malformed JSON preservation**: Verify that a sideupdate block with invalid JSON still returns `null` after the fix.

### Unit Tests

- Test `parseRequestFromOutput` with a minimal well-formed sideupdate block for p1 and p2.
- Test `parseRequestFromOutput` with a sideupdate block embedded in a realistic full simulator output string.
- Test `parseRequestFromOutput` with output that has no sideupdate block (returns null).
- Test `parseRequestFromOutput` with a `forceSwitch` request (forced switch after faint).
- Test `startBattle()` end-to-end: the returned state must have `status = "p1_turn"` and non-empty `availableMoves`.

### Property-Based Tests

- Generate random strings prepended/appended around a valid sideupdate block and verify `parseRequestFromOutput` always returns non-null (Property 1).
- Generate random output strings that contain no sideupdate block and verify `parseRequestFromOutput` always returns `null` (Property 2).
- Generate random valid request JSON payloads and verify the parsed result matches the input (round-trip correctness).

### Integration Tests

- Start a full battle via `startBattle()` and assert `status === "p1_turn"` and `availableMoves.length > 0`.
- Submit a move as p1 and assert the state transitions to `p2_turn` with p2's moves populated.
- Play through a full battle to completion and assert `status === "ended"` with a non-null winner.

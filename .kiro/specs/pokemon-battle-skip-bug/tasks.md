# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - parseRequestFromOutput Returns Null for Valid Sideupdate Block
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — a minimal output string containing a well-formed `sideupdate\np1\n|request|{...}` block
  - Install a test runner (e.g. `vitest` or `jest`) if not already present: `pnpm add -D vitest`
  - Add a `"test"` script to `package.json`: `"test": "vitest --run"`
  - Create `scripts/sim.test.cjs` (or `scripts/sim.test.js`) with the following cases:
    - Build a minimal synthetic output string: `"sideupdate\np1\n|request|{\"active\":[{\"moves\":[{\"move\":\"Tackle\"}]}],\"side\":{\"pokemon\":[]}}"`
    - Call `parseRequestFromOutput(output, "p1")` and assert the result is non-null
    - Also test with the sideupdate block embedded inside surrounding simulator lines (e.g. prefixed with `|update|\n` lines)
    - Also test that querying for `"p2"` on a p1-only output returns `null` (this case should pass on both unfixed and fixed code)
  - Export `parseRequestFromOutput` from `scripts/sim.cjs` (or extract it into a testable helper) so the test file can import it
  - Run tests on UNFIXED code: `pnpm test`
  - **EXPECTED OUTCOME**: The non-null assertions FAIL (this is correct — it proves the bug exists)
  - Document the counterexample found (e.g. `parseRequestFromOutput("sideupdate\np1\n|request|{...}", "p1")` returns `null`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Null Returned for All Non-Sideupdate Outputs
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code first, observe outputs, then encode as tests
  - Observe on UNFIXED code:
    - `parseRequestFromOutput("|win|Player 1\n", "p1")` → `null`
    - `parseRequestFromOutput("sideupdate\np1\n|request|{...}", "p2")` → `null` (wrong player)
    - `parseRequestFromOutput("sideupdate\np1\n|request|not-valid-json", "p1")` → `null` (malformed JSON)
    - `parseRequestFromOutput("", "p1")` → `null` (empty output)
  - Write property-based tests in `scripts/sim.test.cjs` capturing these patterns:
    - For any output string containing only a `|win|` line (no sideupdate), result is `null`
    - For any output string with a sideupdate for `p1`, querying `p2` returns `null` (and vice versa)
    - For any output string with a sideupdate block whose JSON is malformed, result is `null`
    - For random strings that contain no `sideupdate` keyword at all, result is `null`
  - Run tests on UNFIXED code: `pnpm test`
  - **EXPECTED OUTCOME**: All preservation tests PASS (confirms baseline null-returning behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix parseRequestFromOutput in scripts/sim.cjs

  - [x] 3.1 Replace line-split scan with regex-based approach
    - Open `scripts/sim.cjs` and locate `parseRequestFromOutput`
    - Remove the `output.split("\n")` loop and index-based scan
    - Replace with a single regex match:
      ```js
      const re = new RegExp(`sideupdate\\r?\\n${player}\\r?\\n\\|request\\|(.+)`)
      const m = re.exec(output)
      if (!m) return null
      try { return JSON.parse(m[1]) } catch { return null }
      ```
    - The regex handles `\r\n` line endings, is anchored to the correct player, and captures everything after `|request|` on that line
    - No changes needed to `startBattle()`, `makeChoice()`, `lib/battle.ts`, or the UI layer
    - _Bug_Condition: `parseRequestFromOutput(output, player)` returns `null` even when a valid `sideupdate\n{player}\n|request|{...}` block is present in `output`_
    - _Expected_Behavior: returns parsed request object (non-null) with `active` and/or `side` fields when a valid block is present_
    - _Preservation: returns `null` for win-only output, wrong-player queries, malformed JSON, and empty output_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - parseRequestFromOutput Returns Non-Null for Valid Sideupdate Block
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - Run: `pnpm test`
    - **EXPECTED OUTCOME**: The previously-failing non-null assertions now PASS (confirms bug is fixed)
    - _Requirements: 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Null Returned for All Non-Sideupdate Outputs
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `pnpm test`
    - **EXPECTED OUTCOME**: All preservation tests still PASS (confirms no regressions in null-returning behavior)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Add integration and unit tests for end-to-end battle start
  - Add the following test cases to `scripts/sim.test.cjs`:
    - **Unit — forceSwitch request**: Build a synthetic output with a `forceSwitch` sideupdate block and assert `parseRequestFromOutput` returns the request with `forceSwitch` field populated
    - **Unit — p2 request**: Build a synthetic output with a sideupdate block for `p2` and assert the result is non-null
    - **Unit — request embedded in full output**: Wrap the sideupdate block in realistic surrounding lines (`|update|...`, `|turn|1`, etc.) and assert non-null
    - **Integration — startBattle()**: Call the real `startBattle()` function (which invokes the pokemon-showdown simulator) and assert:
      - `state.status === "p1_turn"`
      - `state.availableMoves.length > 0`
      - `state.winner === null`
    - **Integration — makeChoice()**: After `startBattle()`, submit `"move 1"` as p1 and assert the returned state has `status` of either `"p2_turn"` or `"ended"` (not `"p1_turn"` again)
  - Run: `pnpm test`
  - **EXPECTED OUTCOME**: All tests pass
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 5. Checkpoint — Ensure all tests pass
  - Run the full test suite: `pnpm test`
  - Confirm every test passes (exploration test, preservation tests, unit tests, integration tests)
  - If any test fails, investigate before marking complete — ask if questions arise

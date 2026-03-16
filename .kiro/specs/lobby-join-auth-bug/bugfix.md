# Bugfix Requirements Document

## Introduction

When a player joins an existing lobby, the server returns 401 Unauthorized responses to the joiner's SSE stream connection, causing the joiner to time out and never receive host decisions. Separately, the host's lobby UI does not update in real time when a joiner arrives — the host must manually refresh the page to see the acceptance prompt. Both issues make the lobby joining flow non-functional without manual intervention.

This spec is distinct from `lobby-auth-redirect-bug`, which covers the case where both host and joiner are immediately redirected to the homepage on page load. Here, the session is successfully created and the host can interact with it after a refresh — the failures are in the joiner's SSE authentication and the host's real-time UI update.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a joiner submits the join form and the browser opens an SSE stream connection to `/api/lobby/[code]/stream?token=[joinerToken]` THEN the server returns 401 Unauthorized, preventing the joiner from receiving any lobby events

1.2 WHEN the joiner receives repeated 401 responses from the SSE stream THEN the system exhausts the reconnect window and the joiner times out, never learning whether the host accepted or declined

1.3 WHEN a joiner successfully joins a lobby and the session transitions to `pending_acceptance` THEN the host's `WaitingScreen` component does not update to show the `AcceptancePrompt`, leaving the host on the waiting spinner

1.4 WHEN the host manually refreshes the lobby page after a joiner has arrived THEN the system correctly shows the `AcceptancePrompt`, confirming the session data is valid but the real-time update path is broken

### Expected Behavior (Correct)

2.1 WHEN a joiner submits the join form and the browser opens an SSE stream connection using the joiner's token THEN the system SHALL authenticate the request successfully and establish a persistent SSE connection for the joiner

2.2 WHEN the joiner's SSE connection is established THEN the system SHALL deliver `session_declined`, `battle_started`, and `session_expired` events to the joiner in real time without requiring a page refresh

2.3 WHEN a joiner successfully joins a lobby and the session transitions to `pending_acceptance` THEN the host's lobby UI SHALL update in real time to show the `AcceptancePrompt` without requiring a manual page refresh

2.4 WHEN the host's SSE connection receives a `session_updated` event indicating `lobbyState === "pending_acceptance"` THEN the system SHALL cause the host UI to render the `AcceptancePrompt` component

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a request to the SSE stream endpoint is made without any token parameter THEN the system SHALL CONTINUE TO return 401 Unauthorized

3.2 WHEN a request to the SSE stream endpoint is made with a token that does not match any participant in the session THEN the system SHALL CONTINUE TO return 401 Unauthorized

3.3 WHEN a request to the SSE stream endpoint is made for a join code that does not correspond to any existing session THEN the system SHALL CONTINUE TO return 401 Unauthorized

3.4 WHEN the host declines a joiner THEN the system SHALL CONTINUE TO notify the joiner via SSE and return them to the homepage

3.5 WHEN the host accepts a joiner and a battle starts THEN the system SHALL CONTINUE TO notify both participants via SSE with their respective player assignments and battle ID, and redirect them to the battle page

3.6 WHEN a joiner cancels their join request THEN the system SHALL CONTINUE TO revert the session to `waiting` state and notify the host via SSE

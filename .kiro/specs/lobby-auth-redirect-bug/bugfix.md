# Bugfix Requirements Document

## Introduction

After a player creates or joins a lobby, the browser navigates to `/lobby/[code]?token=...` but immediately redirects back to the homepage. The page is visible for roughly 1ms before disappearing. The browser console shows a 401 Unauthorized response from `/api/lobby/[code]/stream`. This affects both the host (who created the lobby) and the joiner (who connected to an existing lobby), making the multiplayer matchmaking flow completely unusable.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a host creates a lobby and the browser navigates to the lobby page THEN the SSE stream endpoint returns 401 Unauthorized, causing the client to treat the connection as failed and redirect to the homepage

1.2 WHEN a joiner connects to a lobby and the browser navigates to the lobby page THEN the SSE stream endpoint returns 401 Unauthorized, causing the client to treat the connection as failed and redirect to the homepage

1.3 WHEN the lobby page server component loads and the session is in `in_progress` state THEN the system redirects to `/battle/[id]` without including the player's token in the URL, causing the battle page to reject the user and redirect them to the homepage

### Expected Behavior (Correct)

2.1 WHEN a host creates a lobby and the browser navigates to the lobby page THEN the system SHALL successfully authenticate the SSE stream request using the host token and establish a persistent connection

2.2 WHEN a joiner connects to a lobby and the browser navigates to the lobby page THEN the system SHALL successfully authenticate the SSE stream request using the joiner token and establish a persistent connection

2.3 WHEN the lobby page server component loads and the session is in `in_progress` state THEN the system SHALL redirect to `/battle/[id]?token=[token]&player=[player]` including the player's token and player assignment so the battle page can authenticate the user

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a request to the SSE stream endpoint is made without any token parameter THEN the system SHALL CONTINUE TO return 401 Unauthorized

3.2 WHEN a request to the SSE stream endpoint is made with a token that does not match any participant in the session THEN the system SHALL CONTINUE TO return 401 Unauthorized

3.3 WHEN a request to the SSE stream endpoint is made for a join code that does not correspond to any existing session THEN the system SHALL CONTINUE TO return 401 Unauthorized

3.4 WHEN the host declines a joiner THEN the system SHALL CONTINUE TO notify the joiner via SSE and return them to the homepage

3.5 WHEN a battle starts THEN the system SHALL CONTINUE TO notify both participants via SSE with their respective player assignments and battle ID

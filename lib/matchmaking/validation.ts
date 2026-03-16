export function normaliseJoinCode(code: string): string {
  return code.toUpperCase()
}

export function validateMatchmakingInput(
  displayName: string,
  joinCode: string
): { field: "displayName" | "joinCode"; message: string } | null {
  if (displayName.length === 0) {
    return { field: "displayName", message: "Display name is required." }
  }
  if (displayName.length > 24) {
    return { field: "displayName", message: "Display name must be 24 characters or fewer." }
  }
  if (joinCode.length === 0) {
    return { field: "joinCode", message: "Join code is required." }
  }
  if (joinCode.length > 16) {
    return { field: "joinCode", message: "Join code must be 16 characters or fewer." }
  }
  if (!/^[a-zA-Z0-9]+$/.test(joinCode)) {
    return { field: "joinCode", message: "Join code must contain only letters and numbers (no symbols)." }
  }
  return null
}

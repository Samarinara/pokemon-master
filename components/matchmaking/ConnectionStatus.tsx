interface ConnectionStatusProps {
  status: "connected" | "reconnecting" | "error"
}

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  const label =
    status === "connected"
      ? "Connected"
      : status === "reconnecting"
        ? "Reconnecting…"
        : "Connection lost"

  const colour =
    status === "connected"
      ? "text-green-600"
      : status === "reconnecting"
        ? "text-yellow-600"
        : "text-red-600"

  return (
    <p className={`text-xs font-medium ${colour}`} role="status" aria-live="polite">
      {label}
    </p>
  )
}

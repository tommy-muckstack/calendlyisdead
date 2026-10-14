export default async function Room({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params; const kind = room.startsWith("zoom-") ? "Zoom" : "Google Meet";
  return <main style={{ maxWidth: 560, margin: "80px auto", padding: 24, textAlign: "center" }}>
    <div className="card" style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24 }}>Demo {kind} room</h1>
      <p className="muted">This instance isn't connected to {kind} yet, so this placeholder stands in for the meeting link.
        {kind === "Zoom" ? " Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET to create real Zoom meetings." : " Connect a Google calendar to get real Meet links."}</p>
      <code data-testid="room">{room}</code>
    </div>
  </main>;
}

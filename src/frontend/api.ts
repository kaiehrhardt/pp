export async function createRoom(): Promise<string> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error("Room konnte nicht erstellt werden");
  const body: { roomId: string } = await res.json();
  return body.roomId;
}

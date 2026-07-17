import { createRoom, isRoomExpired } from "./room";
import type { Room } from "./types";

export class RoomStore {
  private rooms = new Map<string, Room>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  create(): Room {
    const room = createRoom();
    this.rooms.set(room.id, room);
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  remove(roomId: string): void {
    this.rooms.delete(roomId);
  }

  startCleanup(intervalMs = 60_000): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, room] of this.rooms) {
        if (isRoomExpired(room, now)) this.rooms.delete(id);
      }
    }, intervalMs);
  }

  stopCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

export type Participant = { id: string; name: string; host: boolean; sharing: boolean; joinedAt: string; lastSeen?: string };
export type Room = { id: string; createdAt: string; expiresAt: string; hostId: string; participants: Participant[]; name?: string; description?: string; color?: "violet" | "cyan" | "amber" | "rose" };
export type Signal = { id: string; from: string; to?: string; type: "offer" | "answer" | "ice"; payload: unknown };

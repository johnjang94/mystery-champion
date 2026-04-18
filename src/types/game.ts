export type Mode = "team" | "solo";
export type Difficulty = "easy" | "medium" | "hard" | "challenger";

export type Player = {
  id: string;
  name: string;
  team: 0 | 1 | null; // null in solo mode
  isHost?: boolean;
  score: number; // used in solo mode; team scores live on RoomState.scores
};

export type Photo = {
  keyword: string;
  prompt: string;
  imageUrl?: string | null;
};

export type Scenario = {
  briefing: string;
  question: string;
  photos: Photo[]; // 4
  bonusKeywords: string[]; // 2
  solutionKeywords: string[]; // 6 (4 photo + 2 bonus)
  solutionAnswer: string;
  choices?: string[] | null;
};

// Persistent phase stored in KV. Sub-phases (thinking/active/bonus1/bonus2)
// are *derived* from startedAt by `derivePhase()`.
export type StoredPhase = "lobby" | "genre" | "difficulty" | "playing" | "ended";

// Derived phase used by the UI.
export type Phase =
  | "lobby"
  | "genre"
  | "difficulty"
  | "thinking"
  | "active"
  | "bonus1"
  | "bonus2"
  | "ended";

export type ActivityEntry = { id: string; ts: number; text: string };

export type RoomState = {
  code: string;
  hostId: string;
  mode: Mode;
  players: Player[];
  storedPhase: StoredPhase;
  genre: string | null;
  difficulty: Difficulty | null;
  scenario: Scenario | null;
  scores: [number, number]; // team scores
  activity: ActivityEntry[];
  startedAt: number | null;
  winner: 0 | 1 | string | null; // team index or playerId in solo
};

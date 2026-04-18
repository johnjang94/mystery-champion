export const GENRES = [
  {
    name: "Riddles",
    emoji: "🧩",
    description: "Read the clue, discuss the twist, and guess the hidden answer.",
  },
  {
    name: "Guess",
    emoji: "🎯",
    description: "Follow the hints, weigh the obvious answer, and decide what still fits.",
  },
  {
    name: "Visual Match",
    emoji: "🌀",
    description: "Compare a 3D maze view against a labeled 2D maze map.",
  },
  {
    name: "Number-to-Letter Conversion",
    emoji: "🔐",
    description: "Decode the story clue and choose the answer that truly matches it.",
  },
] as const;

export type GenreName = (typeof GENRES)[number]["name"];

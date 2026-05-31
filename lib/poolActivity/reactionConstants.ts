export const ALLOWED_ACTIVITY_REACTIONS = [
  "👍",
  "😂",
  "🔥",
  "🏆",
  "👀",
  "😬",
] as const;

export type ActivityReactionEmoji = (typeof ALLOWED_ACTIVITY_REACTIONS)[number];

export function isAllowedActivityReaction(v: string): v is ActivityReactionEmoji {
  return (ALLOWED_ACTIVITY_REACTIONS as readonly string[]).includes(v);
}

export const CONTACT_TOPICS = [
  { value: "pool_help", label: "Help with my pool" },
  { value: "bug", label: "Bug report" },
  { value: "question", label: "Question" },
  { value: "feature", label: "Feature suggestion" },
  { value: "other", label: "Other" },
] as const;

export type ContactTopicValue = (typeof CONTACT_TOPICS)[number]["value"];

export const CONTACT_ROLES = [
  { value: "organizer", label: "Organizer" },
  { value: "participant", label: "Participant" },
  { value: "exploring", label: "Just exploring" },
] as const;

export type ContactRoleValue = (typeof CONTACT_ROLES)[number]["value"];

export const CONTACT_TOPIC_VALUES = CONTACT_TOPICS.map((t) => t.value);
export const CONTACT_ROLE_VALUES = CONTACT_ROLES.map((r) => r.value);

export function contactTopicLabel(value: string): string {
  return CONTACT_TOPICS.find((t) => t.value === value)?.label ?? value;
}

export function contactRoleLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return CONTACT_ROLES.find((r) => r.value === value)?.label ?? value;
}

/** Max submissions per email address per hour (server-side). */
export const CONTACT_RATE_LIMIT_PER_HOUR = 5;

export const CONTACT_INBOX_EMAIL =
  process.env.CONTACT_INBOX_EMAIL?.trim() || "hello@flaredesign.ca";

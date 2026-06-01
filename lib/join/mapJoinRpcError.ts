import {
  JOIN_DISPLAY_NAME_AMBIGUOUS_MESSAGE,
  JOIN_DISPLAY_NAME_EMPTY_MESSAGE,
  JOIN_DISPLAY_NAME_TAKEN_MESSAGE,
  JOIN_NEEDS_CONFIRMATION_HINT,
} from "./joinDisplayName";

/** Map Postgres RPC errors to participant-friendly copy. */
export function mapJoinRpcError(message: string): string {
  const msg = message.trim();
  if (msg.includes("display name already taken in this pool")) {
    return JOIN_DISPLAY_NAME_TAKEN_MESSAGE;
  }
  if (msg.includes("multiple unclaimed profiles for this name")) {
    return JOIN_DISPLAY_NAME_AMBIGUOUS_MESSAGE;
  }
  if (
    msg.includes("no matching unclaimed profile") ||
    msg.includes("no matching unclaimed profile; create a new one or check the name")
  ) {
    return JOIN_NEEDS_CONFIRMATION_HINT;
  }
  if (msg.includes("invalid display name")) {
    return JOIN_DISPLAY_NAME_EMPTY_MESSAGE;
  }
  if (msg.includes("invalid join code")) {
    return "That join code is not valid.";
  }
  if (msg.includes("not authenticated")) {
    return "Sign in or create an account first.";
  }
  return msg;
}

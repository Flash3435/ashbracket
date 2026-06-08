import { randomBytes } from "crypto";

/** Opaque invite secret (stored in DB; never log in production UI). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

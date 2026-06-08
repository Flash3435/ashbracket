import { textToHtmlParagraphs } from "@/lib/email/sendResendEmail";
import {
  contactRoleLabel,
  contactTopicLabel,
  type ContactRoleValue,
  type ContactTopicValue,
} from "./contactFormConstants";

export function buildContactEmailSubject(topic: ContactTopicValue): string {
  return `[AshBracket Contact] ${contactTopicLabel(topic)}`;
}

export function buildContactEmailBodies(args: {
  name: string;
  email: string;
  topic: ContactTopicValue;
  message: string;
  role: ContactRoleValue | null;
  poolContext: string | null;
  sourcePage: string;
  userId: string | null;
  submissionId: string | null;
}): { text: string; html: string } {
  const lines = [
    "New AshBracket contact form submission",
    "",
    `Name: ${args.name}`,
    `Email: ${args.email}`,
    `Topic: ${contactTopicLabel(args.topic)}`,
    `Role: ${contactRoleLabel(args.role)}`,
    `Pool / context: ${args.poolContext?.trim() ? args.poolContext.trim() : "—"}`,
    `Source page: ${args.sourcePage}`,
    args.userId ? `Signed-in user id: ${args.userId}` : "Signed-in user id: —",
    ...(args.submissionId ? [`Submission id: ${args.submissionId}`] : []),
    "",
    "Message:",
    args.message,
  ];

  const text = lines.join("\n");
  const html = textToHtmlParagraphs(text);
  return { text, html };
}

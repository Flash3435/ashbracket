import {
  CONTACT_ROLE_VALUES,
  CONTACT_TOPIC_VALUES,
  type ContactRoleValue,
  type ContactTopicValue,
} from "./contactFormConstants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactFormFieldErrors = Partial<
  Record<"name" | "email" | "topic" | "message" | "role" | "poolContext", string>
>;

export type ValidatedContactFormInput = {
  name: string;
  email: string;
  topic: ContactTopicValue;
  message: string;
  role: ContactRoleValue | null;
  poolContext: string | null;
  sourcePage: string;
  /** Honeypot — must be empty when valid. */
  company: string;
};

export type ValidateContactFormResult =
  | { ok: true; data: ValidatedContactFormInput }
  | { ok: false; fieldErrors: ContactFormFieldErrors };

export function validateContactFormInput(input: {
  name: string;
  email: string;
  topic: string;
  message: string;
  role: string;
  poolContext: string;
  sourcePage: string;
  company: string;
}): ValidateContactFormResult {
  const fieldErrors: ContactFormFieldErrors = {};

  const name = input.name.trim();
  if (!name) {
    fieldErrors.name = "Please enter your name.";
  } else if (name.length > 200) {
    fieldErrors.name = "Name must be 200 characters or fewer.";
  }

  const email = input.email.trim().toLowerCase();
  if (!email) {
    fieldErrors.email = "Please enter your email address.";
  } else if (email.length > 320 || !EMAIL_RE.test(email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }

  const topic = input.topic.trim();
  if (!topic) {
    fieldErrors.topic = "Please choose a topic.";
  } else if (!CONTACT_TOPIC_VALUES.includes(topic as ContactTopicValue)) {
    fieldErrors.topic = "Please choose a valid topic.";
  }

  const message = input.message.trim();
  if (!message) {
    fieldErrors.message = "Please enter a message.";
  } else if (message.length < 10) {
    fieldErrors.message = "Message must be at least 10 characters.";
  } else if (message.length > 5000) {
    fieldErrors.message = "Message must be 5,000 characters or fewer.";
  }

  const roleRaw = input.role.trim();
  let role: ContactRoleValue | null = null;
  if (roleRaw) {
    if (!CONTACT_ROLE_VALUES.includes(roleRaw as ContactRoleValue)) {
      fieldErrors.role = "Please choose a valid role.";
    } else {
      role = roleRaw as ContactRoleValue;
    }
  }

  const poolContextRaw = input.poolContext.trim();
  let poolContext: string | null = null;
  if (poolContextRaw.length > 0) {
    if (poolContextRaw.length > 500) {
      fieldErrors.poolContext = "Pool details must be 500 characters or fewer.";
    } else {
      poolContext = poolContextRaw;
    }
  }

  const sourcePage = input.sourcePage.trim() || "/contact";
  if (sourcePage.length > 200) {
    fieldErrors.message =
      fieldErrors.message ?? "Something went wrong. Please try again.";
    return { ok: false, fieldErrors };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      name,
      email,
      topic: topic as ContactTopicValue,
      message,
      role,
      poolContext,
      sourcePage,
      company: input.company.trim(),
    },
  };
}

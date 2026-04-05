"use client";

import { SignOutButton } from "@/components/auth/SignOutButton";

export function AdminSignOutButton() {
  return <SignOutButton redirectTo="/login" />;
}

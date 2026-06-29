import {
  assertPasswordResetRedirectUrl,
  buildPasswordResetRedirectUrl,
  PASSWORD_RESET_PATH,
} from "./passwordResetRedirect";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const prevSiteUrl = process.env.SITE_URL;
process.env.SITE_URL = "https://ashbracket.com";

const redirectTo = buildPasswordResetRedirectUrl();
t(
  redirectTo === "https://ashbracket.com/reset-password",
  `buildPasswordResetRedirectUrl uses /reset-password (got ${redirectTo})`,
);

try {
  assertPasswordResetRedirectUrl(redirectTo);
  t(true, "assert accepts canonical redirect");
} catch {
  t(false, "assert accepts canonical redirect");
}

try {
  assertPasswordResetRedirectUrl("https://ashbracket.com");
  t(false, "assert rejects origin-only");
} catch {
  t(true, "assert rejects origin-only");
}

try {
  assertPasswordResetRedirectUrl("https://ashbracket.com/auth/confirm?next=%2Freset-password");
  t(false, "assert rejects /auth/confirm redirect");
} catch {
  t(true, "assert rejects /auth/confirm redirect");
}

t(PASSWORD_RESET_PATH === "/reset-password", "PASSWORD_RESET_PATH constant");

if (prevSiteUrl === undefined) {
  delete process.env.SITE_URL;
} else {
  process.env.SITE_URL = prevSiteUrl;
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("passwordResetRedirect.selftest: ok");

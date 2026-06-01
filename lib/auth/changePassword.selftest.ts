import {
  CHANGE_PASSWORD_SUCCESS_MESSAGE,
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  mapReauthSignInError,
  validateChangePasswordFields,
} from "./changePassword";
import { PASSWORD_MISMATCH_MESSAGE } from "./authFormValidation";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const valid = validateChangePasswordFields({
  currentPassword: "old-secret",
  newPassword: "new-secret",
  confirmNewPassword: "new-secret",
});
t(valid.ok === true, "valid fields pass");

const emptyNew = validateChangePasswordFields({
  currentPassword: "old",
  newPassword: "   ",
  confirmNewPassword: "   ",
});
t(emptyNew.ok === false && emptyNew.message.includes("new password"), "empty new password");

const mismatch = validateChangePasswordFields({
  currentPassword: "old",
  newPassword: "abcdef",
  confirmNewPassword: "ghijkl",
});
t(
  mismatch.ok === false && mismatch.message === PASSWORD_MISMATCH_MESSAGE,
  "mismatch message",
);

const short = validateChangePasswordFields({
  currentPassword: "old",
  newPassword: "abc",
  confirmNewPassword: "abc",
});
t(short.ok === false && short.message.includes("6"), "short new password");

const noCurrent = validateChangePasswordFields({
  currentPassword: "",
  newPassword: "abcdef",
  confirmNewPassword: "abcdef",
});
t(noCurrent.ok === false, "missing current password");

t(
  mapReauthSignInError("Invalid login credentials") ===
    CURRENT_PASSWORD_INCORRECT_MESSAGE,
  "invalid credentials maps to current password message",
);

t(
  mapReauthSignInError("Too many requests") !== CURRENT_PASSWORD_INCORRECT_MESSAGE,
  "rate limit is not treated as wrong password",
);

t(
  CHANGE_PASSWORD_SUCCESS_MESSAGE.includes("updated"),
  "success message present",
);

if (failed) {
  process.exit(1);
}
console.log("changePassword.selftest: ok");

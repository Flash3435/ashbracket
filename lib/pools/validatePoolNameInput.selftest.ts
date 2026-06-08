import { POOL_NAME_MAX_LEN, validatePoolNameInput } from "./validatePoolNameInput";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

t(validatePoolNameInput("  ").ok === false, "empty after trim");
t(validatePoolNameInput("A").ok === true, " single char");
t(validatePoolNameInput("a".repeat(POOL_NAME_MAX_LEN + 1)).ok === false, "too long");
t(
  validatePoolNameInput("a".repeat(POOL_NAME_MAX_LEN)).ok === true,
  "at max",
);

if (failed) {
  process.exit(1);
}
console.log("validatePoolNameInput.selftest: ok");

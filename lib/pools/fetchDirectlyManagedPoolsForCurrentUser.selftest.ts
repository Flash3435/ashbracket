import {
  filterPoolsToDirectAdminMembership,
} from "./fetchDirectlyManagedPoolsForCurrentUser";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const globalAdminVisiblePools = [
  { id: "pool-source", name: "Source Pool" },
  { id: "pool-dest-a", name: "Destination A" },
  { id: "pool-other", name: "Other Pool" },
];

const directAdminPoolIds = new Set(["pool-source", "pool-dest-a"]);

const directOnly = filterPoolsToDirectAdminMembership(
  globalAdminVisiblePools,
  directAdminPoolIds,
);

t(directOnly.length === 2, "global-admin-visible list narrows to explicit pool_admins pools");
t(
  directOnly.map((pool) => pool.id).join() === "pool-source,pool-dest-a",
  "unrelated global-admin pool is excluded",
);
t(
  !directOnly.some((pool) => pool.id === "pool-other"),
  "destination not in pool_admins is excluded from direct list",
);

if (failed) {
  process.exit(1);
}
console.log("fetchDirectlyManagedPoolsForCurrentUser.selftest: ok");

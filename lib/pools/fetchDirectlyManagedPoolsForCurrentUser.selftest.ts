import {
  filterPoolsToDirectAdminMembership,
  filterPoolsToDirectPoolManagement,
  userDirectlyManagesPool,
} from "./fetchDirectlyManagedPoolsForCurrentUser";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const userId = "user-creator";
const globalAdminVisiblePools = [
  { id: "pool-source", name: "Source Pool", created_by_user_id: null },
  { id: "pool-dest-a", name: "Destination A", created_by_user_id: null },
  { id: "pool-other", name: "Other Pool", created_by_user_id: null },
];

const directAdminPoolIds = new Set(["pool-source", "pool-dest-a"]);

const directOnly = filterPoolsToDirectAdminMembership(
  globalAdminVisiblePools,
  directAdminPoolIds,
);

t(directOnly.length === 2, "global-admin-visible list narrows to explicit pool_admins pools");
t(
  !directOnly.some((pool) => pool.id === "pool-other"),
  "destination not in pool_admins is excluded from direct list",
);

{
  const pools = [
    { id: "pool-created", name: "Created Pool", created_by_user_id: userId },
    { id: "pool-admin", name: "Admin Pool", created_by_user_id: "other-user" },
    { id: "pool-neither", name: "Neither", created_by_user_id: "other-user" },
  ];
  const managed = filterPoolsToDirectPoolManagement(
    pools,
    new Set(["pool-admin"]),
    userId,
  );
  t(managed.map((pool) => pool.id).join() === "pool-created,pool-admin", "creator and pool_admins count as direct management");
  t(
    userDirectlyManagesPool(
      { id: "pool-created", created_by_user_id: userId },
      userId,
      new Set(),
    ),
    "creator without pool_admins row still directly manages pool",
  );
}

if (failed) {
  process.exit(1);
}
console.log("fetchDirectlyManagedPoolsForCurrentUser.selftest: ok");

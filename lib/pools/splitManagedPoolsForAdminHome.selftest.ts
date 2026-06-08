import type { ManagedPoolRow } from "./fetchManagedPoolsForViewer";
import {
  isPoolDirectlyInvolved,
  splitManagedPoolsForAdminHome,
} from "./splitManagedPoolsForAdminHome";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

function pool(
  id: string,
  overrides: Partial<ManagedPoolRow> = {},
): ManagedPoolRow {
  return {
    id,
    name: `Pool ${id}`,
    created_at: "",
    updated_at: "",
    lock_at: null,
    is_public: false,
    show_public_rules: false,
    ashbot_enabled: true,
    join_code: null,
    created_by_user_id: null,
    entry_fee_cents: null,
    payment_type: "free",
    entry_fee_label: null,
    entry_fee_amount: null,
    payment_instructions: null,
    currency_code: "USD",
    show_pot_to_participants: false,
    prize_distribution_json: null,
    group_advance_exact_points: null,
    group_advance_wrong_slot_points: null,
    tie_break_note: null,
    tournament_edition_id: "edition",
    is_simulation: false,
    ...overrides,
  };
}

const userId = "user-1";

{
  const { directPools, otherAdminVisiblePools } = splitManagedPoolsForAdminHome(
    [
      pool("a", { created_by_user_id: userId, name: "Alpha" }),
      pool("b", { name: "Beta" }),
      pool("c", { name: "Charlie" }),
    ],
    userId,
    {
      adminPoolIds: new Set(["b"]),
      participantPoolIds: new Set(["c"]),
    },
  );
  t(
    directPools.map((p) => p.id).join() === "a,b,c",
    "creator, admin, and participant pools are direct",
  );
  t(otherAdminVisiblePools.length === 0, "no other pools when all are direct");
}

{
  const { directPools, otherAdminVisiblePools } = splitManagedPoolsForAdminHome(
    [
      pool("mine", { created_by_user_id: userId, name: "Mine" }),
      pool("other", { name: "Other" }),
    ],
    userId,
    { adminPoolIds: new Set(), participantPoolIds: new Set() },
  );
  t(directPools.map((p) => p.id).join() === "mine", "only owned pool is direct");
  t(
    otherAdminVisiblePools.map((p) => p.id).join() === "other",
    "oversight-only pool is other",
  );
}

{
  const { directPools, otherAdminVisiblePools } = splitManagedPoolsForAdminHome(
    [pool("x", { created_by_user_id: userId })],
    userId,
    {
      adminPoolIds: new Set(["x"]),
      participantPoolIds: new Set(["x"]),
    },
  );
  t(directPools.length === 1, "single direct pool");
  t(otherAdminVisiblePools.length === 0, "no duplicate in other");
}

t(
  !isPoolDirectlyInvolved(
    { id: "p1", created_by_user_id: "other-user" },
    userId,
    { adminPoolIds: new Set(), participantPoolIds: new Set() },
  ),
  "not direct without creator/admin/participant ties",
);

if (failed) {
  process.exit(1);
}
console.log("splitManagedPoolsForAdminHome.selftest: ok");

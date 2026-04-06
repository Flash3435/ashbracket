import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <div className="border-b border-ash-border bg-ash-body">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <p className="truncate text-sm text-ash-muted">
            <span className="font-medium text-ash-text">Admin</span>
            {user?.email ? (
              <>
                <span className="mx-1.5 text-ash-border">·</span>
                <span className="text-ash-border-hover">{user.email}</span>
              </>
            ) : null}
          </p>
          <AdminSignOutButton />
        </div>
      </div>
      {children}
    </div>
  );
}

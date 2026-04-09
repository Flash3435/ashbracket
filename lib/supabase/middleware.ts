import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessAdminDashboard } from "../auth/permissions";
import mwKeys from "./middleware-keys.json";

function copyAuthCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value, c);
  });
}

function missingConfigResponse(): NextResponse {
  return new NextResponse(
    [
      "AshBracket: Supabase env is not configured.",
      "",
      "On Vercel: Project Settings → Environment Variables → add",
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),",
      "then redeploy.",
      "",
      "Locally: add ashbracket/.env.local and run npm run dev (predev syncs middleware-keys.json).",
    ].join("\n"),
    {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    },
  );
}

export async function updateSession(request: NextRequest) {
  try {
    return await runSession(request);
  } catch (e) {
    console.error("[middleware]", e);
    return new NextResponse(
      "Middleware error. Check Vercel logs and Supabase configuration.",
      {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }
}

async function runSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  // Vercel inlines NEXT_PUBLIC_* at build — use env first. Local Turbopack dev often has
  // empty process.env in middleware; `middleware-keys.json` (predev sync) fills the gap.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    mwKeys.supabaseUrl.trim() ||
    "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    mwKeys.supabaseAnonKey.trim() ||
    "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return missingConfigResponse();
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const path = request.nextUrl.pathname;
    const isProbablyStatic =
      path.startsWith("/_next") ||
      path === "/favicon.ico" ||
      /\.[a-z0-9]+$/i.test(path.split("/").pop() ?? "");
    if (!isProbablyStatic) {
      const { error: claimErr } = await supabase.rpc(
        "ashbracket_claim_pending_pool_admin_invites_for_user",
      );
      if (claimErr) {
        console.error("[claim pool admin invites]", claimErr.message);
      }
    }
  }

  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set(
        "next",
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      const redirect = NextResponse.redirect(loginUrl);
      copyAuthCookies(supabaseResponse, redirect);
      return redirect;
    }

    const allowed = await canAccessAdminDashboard(supabase, user.id);
    if (!allowed) {
      const forbiddenUrl = request.nextUrl.clone();
      forbiddenUrl.pathname = "/login";
      forbiddenUrl.searchParams.set(
        "next",
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      forbiddenUrl.searchParams.set("error", "forbidden");
      const redirect = NextResponse.redirect(forbiddenUrl);
      copyAuthCookies(supabaseResponse, redirect);
      return redirect;
    }
  }

  return supabaseResponse;
}

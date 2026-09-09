import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { url, key };
}

/**
 * Cookie-backed client for server components and route handlers.
 * Row Level Security applies: it can only see the signed-in user's rows.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const { url, key } = env();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't write cookies; the proxy refreshes them instead.
        }
      },
    },
  });
}

export type Auth = { user: User; db: SupabaseClient };

/**
 * Resolves the caller for an API route. Accepts either the session cookie
 * (browser) or `Authorization: Bearer <access token>` (scripts, future
 * desktop app). Returns null when not signed in.
 */
export async function getAuth(req: Request): Promise<Auth | null> {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (bearer) {
    const { url, key } = env();
    const db = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.auth.getUser(bearer);
    if (error || !data.user) return null;
    return { user: data.user, db };
  }

  const db = await supabaseServer();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return { user: data.user, db };
}

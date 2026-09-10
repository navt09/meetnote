// Throwaway signed-in account for a visual check. No meeting, no vendor calls.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
if (existsSync(`${root}/.env.local`)) {
  for (const line of readFileSync(`${root}/.env.local`, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAIL = "demo-logocheck@fromthecall.invalid";
const PASSWORD = "demo-password-1234";

if (process.argv[2] === "--clean") {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users) {
    if (u.email === EMAIL) {
      await admin.auth.admin.deleteUser(u.id);
      console.log("removed", u.email);
    }
  }
  process.exit(0);
}

const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
if (error) throw new Error(error.message);
await admin.from("accounts").upsert({ user_id: data.user.id, tier: "active", note: "temporary logo check" }, { onConflict: "user_id" });
console.log("ready:", EMAIL, PASSWORD);

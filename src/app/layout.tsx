import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meetnote",
  description: "Record any meeting, get notes, tasks, and follow-ups done.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  try {
    const db = await supabaseServer();
    const { data } = await db.auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    email = null; // Supabase not configured yet; render signed-out.
  }

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
            meetnote
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            {email ? (
              <>
                <Link href="/meetings" className="hover:text-fg">Meetings</Link>
                <Link href="/record" className="hover:text-fg">Record</Link>
                <form action="/auth/signout" method="post" className="flex items-center gap-3">
                  <span className="hidden sm:inline">{email}</span>
                  <button className="hover:text-fg" type="submit">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="hover:text-fg">Sign in</Link>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl px-6 pb-24">{children}</main>
      </body>
    </html>
  );
}

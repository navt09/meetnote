import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/record", "/meetings", "/notes", "/tasks", "/dashboard", "/approvals", "/settings"];

/**
 * The Content-Security-Policy for pages. It lives here rather than in
 * next.config.ts because scripts need a nonce that changes on every request:
 * Next reads it from this header and stamps it on its own inline scripts, so
 * a script that did not come from us cannot run even if some text on the page
 * were ever rendered as markup.
 *
 * Styles allow inline because React sets style attributes and Next injects
 * its own style tags; a stray inline style cannot exfiltrate anything.
 * The browser only talks to us and to Supabase (auth, and the signed upload
 * and download links).
 */
function contentSecurityPolicy(nonce: string, supabaseUrl: string | undefined): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const dev = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    // strict-dynamic lets the nonce'd bootstrap load Next's chunks; dev mode needs eval for hot reload.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${supabase}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/**
 * Runs before every page request: refreshes the Supabase session cookie, sets
 * the security policy, and sends signed-out visitors to /login for protected
 * pages.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = contentSecurityPolicy(nonce, url);

  // The policy goes on the request so Next can pick the nonce up while
  // rendering, and on the response so the browser enforces it.
  const build = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  let response = build();

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = build();
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && isProtected) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  if (user && path === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/dashboard";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return response;
}

export const config = {
  // Pages only. API routes check auth themselves and static files are skipped.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

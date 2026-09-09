import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in · From the Call" };

export default function LoginPage() {
  return (
    <section className="mx-auto mt-16 max-w-md">
      <div className="glass p-8">
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </section>
  );
}

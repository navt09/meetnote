import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in · Meetnote" };

export default function LoginPage() {
  return (
    <section className="mx-auto mt-16 max-w-md">
      <div className="glass p-8">
        <span className="pill">Sign in</span>
        <h1 className="mt-3 text-2xl font-semibold">Get a sign-in link</h1>
        <p className="mt-2 text-sm text-muted">No password. We email you a link that signs you in on this device.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </section>
  );
}

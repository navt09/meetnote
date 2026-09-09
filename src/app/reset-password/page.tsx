import { Suspense } from "react";
import ResetForm from "./reset-form";

export const metadata = { title: "Choose a new password · From the Call" };

export default function ResetPasswordPage() {
  return (
    <section className="mx-auto mt-16 max-w-md">
      <div className="glass p-8">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </section>
  );
}

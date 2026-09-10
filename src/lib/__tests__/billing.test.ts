import { describe, expect, it } from "vitest";
import { grantsPro, tierForSubscription, type SubscriptionStatus } from "../billing";

const ALL: SubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
];

describe("grantsPro", () => {
  it("gives access while the money is good", () => {
    expect(grantsPro("active")).toBe(true);
    expect(grantsPro("trialing")).toBe(true);
  });

  it("keeps access while a failed card is still being retried", () => {
    // Cutting someone off mid-retry over a bank blip loses a customer who was
    // about to pay. Stripe moves it on to unpaid or canceled when it gives up.
    expect(grantsPro("past_due")).toBe(true);
  });

  it("refuses every state where nothing has been paid", () => {
    for (const status of ["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"] as const) {
      expect(grantsPro(status), status).toBe(false);
    }
  });

  it("refuses an absent or unrecognised status rather than assuming the best", () => {
    for (const bad of [null, undefined, "", "something_new", "ACTIVE"]) {
      expect(grantsPro(bad as string), String(bad)).toBe(false);
    }
  });
});

describe("tierForSubscription", () => {
  it("answers with a tier for every state Stripe reports", () => {
    for (const status of ALL) {
      expect(["free", "active"], status).toContain(tierForSubscription(status));
    }
  });

  it("never sells the owner tier", () => {
    // Owner comes from OWNER_EMAILS. A payment must not grant it and a
    // cancellation must not take it away.
    for (const status of [...ALL, null, "whatever"]) {
      expect(tierForSubscription(status as string), String(status)).not.toBe("owner");
    }
  });

  it("puts a cancelled account back on free", () => {
    expect(tierForSubscription("canceled")).toBe("free");
    expect(tierForSubscription("unpaid")).toBe("free");
  });
});

/**
 * Facts about the product that appear in more than one place: the landing page,
 * the legal pages, and anything that quotes a price.
 *
 * Prices here are what the marketing page shows. Nothing charges money yet, so
 * changing a number here changes the shopfront and nothing else. When billing
 * arrives these have to line up with the prices configured in the payment
 * provider, and this file stops them drifting in the meantime.
 */

/** One address for everything. It must actually receive mail before launch. */
export const CONTACT_EMAIL = "hello@fromthecall.com";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "",
    note: "No card, ever",
    tagline: "See what it does with your own meetings.",
    lead: "What you get",
    features: ["3 meetings a month", "Notes, decisions and action items", "Everything stays in your account"],
    cta: "Get started",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$18",
    cadence: "/month",
    note: "per person",
    tagline: "The follow-up done, not just written down.",
    lead: "Everything in Free, plus",
    features: [
      "Unlimited meetings",
      "Tickets drafted into Linear and Jira",
      "Follow-up emails drafted from your Gmail",
      "Tasks blocked out on your calendar",
      "Summaries posted to Slack",
    ],
    cta: "Start with Pro",
    highlight: true,
  },
] as const;

/** Where the audio can come from. Anything that makes sound in a tab or window. */
export const WORKS_WITH = ["Zoom", "Microsoft Teams", "Google Meet", "Webex", "A phone on speaker", "A room full of people"];

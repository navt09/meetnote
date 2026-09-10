-- What Stripe knows about an account, kept beside the tier it decides.
--
-- The tier column is still the only thing the product reads. These columns
-- exist so a webhook can find the right account from a Stripe customer, and so
-- a person can be sent back to the billing portal they already have rather
-- than being made a second customer.
--
-- Still service-role write only: the accounts table gives users SELECT and
-- nothing else, so no request a signed-in user makes can promote themselves.
alter table public.accounts
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  -- Stripe's own word for the subscription: active, trialing, past_due,
  -- canceled and so on. Stored raw rather than mapped, so a status we have not
  -- taught the code about is still visible when someone asks why an account
  -- looks wrong.
  add column if not exists subscription_status text;

-- One Stripe customer maps to exactly one account, and the webhook looks the
-- account up by it on every event.
create unique index if not exists accounts_stripe_customer_idx
  on public.accounts (stripe_customer_id)
  where stripe_customer_id is not null;

// `server-only` throws when imported outside a React Server Component, which is
// exactly what we want in production and exactly what breaks unit tests of
// server modules. vitest.config.mts aliases the package to this no-op.
export {};

// Make or remove the throwaway account the smoke pass uses, by hand.
//
//   node scripts/smoke-account.mjs           # create one, print credentials
//   node scripts/smoke-account.mjs --clean   # remove every smoke account
//
// Separate from smoke-fixture.mjs because the Playwright runner imports that
// as CommonJS, where top-level await is a syntax error.
import { cleanFixtures, createFixture } from "./smoke-fixture.mjs";

if (process.argv.includes("--clean")) {
  const n = await cleanFixtures();
  console.log(`removed ${n} smoke account(s)`);
} else {
  const f = await createFixture();
  console.log(`email:    ${f.email}
password: ${f.password}
meeting:  /meetings/${f.meetingId}`);
}

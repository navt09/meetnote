import { Callout, LegalPage, List, Section } from "@/components/legal";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = {
  title: "Privacy · From the Call",
  description: "What From the Call collects, who processes it, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated={LEGAL_UPDATED}>
      <p>
        From the Call records meetings you choose to record, turns them into notes and tasks, and drafts
        follow-up work for you to approve. This page explains exactly what that means for your data.
      </p>

      <Section heading="What we collect">
        <List
          items={[
            <>
              <strong className="text-fg">Your account.</strong> Your email address and a hashed password. We never
              store your password itself.
            </>,
            <>
              <strong className="text-fg">Meeting audio.</strong> The recording you make when you press record and
              pick a window. It is stored in a private bucket that only your account can reach.
            </>,
            <>
              <strong className="text-fg">Transcripts and notes.</strong> The text of the recording, and the summary,
              action items, decisions and follow-up names taken from it.
            </>,
            <>
              <strong className="text-fg">Drafts.</strong> Follow-ups and emails written for you, and whether you
              approved, edited or dismissed them.
            </>,
            <>
              <strong className="text-fg">Connection credentials.</strong> If you connect Google, Linear, Jira or
              Slack, the access tokens for those accounts, encrypted before they are stored.
            </>,
            <>
              <strong className="text-fg">Usage records.</strong> How long each recording was and what it cost us to
              process, so we can run the service.
            </>,
          ]}
        />
        <p>
          We do not use tracking cookies, advertising pixels, or third-party analytics. We do not sell anything to
          anyone, and we do not use your recordings, transcripts or notes to train any AI model.
        </p>
      </Section>

      <Section heading="Who processes it">
        <p>To run the service we pass data to these companies and no others:</p>
        <List
          items={[
            <>
              <strong className="text-fg">Supabase</strong> stores your account, recordings, transcripts and notes.
            </>,
            <>
              <strong className="text-fg">Vercel</strong> hosts the application.
            </>,
            <>
              <strong className="text-fg">Deepgram</strong> receives your meeting audio in order to transcribe it.
            </>,
            <>
              <strong className="text-fg">Anthropic</strong> receives the transcript text in order to write the notes
              and drafts.
            </>,
          ]}
        />
        <p>
          If you connect Google, Linear, Jira or Slack, we send data to those services too, but only what you
          explicitly approve, and only when you approve it.
        </p>
      </Section>

      <Section heading="Google user data">
        <p>
          If you connect a Google account, we ask for two permissions and use them for one purpose each. We ask to
          send email, and we use it only to send an email you have read and approved. We ask to manage calendar
          events, and we use it only to add an event for a task you have approved. We do not read your inbox, and we
          cannot: the permission we hold does not allow it.
        </p>
        <Callout>
          From the Call&apos;s use and transfer of information received from Google APIs to any other app will adhere
          to the{" "}
          <a
            className="underline underline-offset-2 hover:text-accent"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </Callout>
        <p>
          We store the access tokens Google issues, encrypted, and the identifier of any message or event we created
          on your behalf. Nothing else from your Google account is kept. You can disconnect Google at any time in
          Settings, which deletes those tokens, and you can revoke our access from your own Google account settings.
        </p>
      </Section>

      <Section heading="How it is protected">
        <List
          items={[
            "Every recording, transcript and note is scoped to your account at the database level, not merely hidden in the interface.",
            "Audio lives in a private bucket. It is reachable only through short-lived links we issue after checking that the file is yours.",
            "Credentials for connected services are encrypted with AES-256-GCM before storage and are never sent back to your browser.",
            "Traffic is encrypted in transit.",
          ]}
        />
        <p>
          No system is perfect, and we will tell you promptly if we ever discover that your data has been exposed.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          We keep your recordings and notes until you delete them or ask us to close your account. Deleting a meeting
          removes its audio and its transcript and notes immediately and permanently, and we cannot recover it
          afterwards.
        </p>
        <p>
          There is no self-serve account deletion yet. To close your account and have everything erased, email{" "}
          <a className="underline underline-offset-2 hover:text-accent" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          and we will do it within 30 days, including your audio and every connected credential.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask us for a copy of what we hold about you, ask us to correct it, or ask us to delete it. Write to
          the address below and we will respond within 30 days. Depending on where you live you may also have the
          right to complain to a data protection regulator.
        </p>
      </Section>

      <Section heading="Children">
        <p>From the Call is not intended for anyone under 16, and we do not knowingly collect their data.</p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change this policy in a way that materially affects you, we will email you before it takes effect.
          The date at the top always reflects the current version.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions, requests, or anything that looks wrong:{" "}
          <a className="underline underline-offset-2 hover:text-accent" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}

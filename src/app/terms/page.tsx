import { Callout, LegalPage, List, Section } from "@/components/legal";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = {
  title: "Terms · From the Call",
  description: "The terms you agree to when you use From the Call, including your responsibility for recording consent.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated={LEGAL_UPDATED}>
      <p>
        These terms are the agreement between you and From the Call. By making an account or recording a meeting, you
        accept them. If you are using From the Call for your employer, you are confirming you may agree on their
        behalf.
      </p>

      <Section heading="What the service does">
        <p>
          From the Call records audio you choose to record, transcribes it, writes notes and action items, and drafts
          follow-up tickets and emails. Drafts are never sent anywhere until you approve them individually.
        </p>
      </Section>

      <Section heading="Recording other people is your responsibility">
        <Callout>
          Laws about recording conversations differ by country and by state, and many require that everyone on the
          call agrees before you record. Getting that consent is your responsibility, not ours. We give you the tool;
          you decide when it is lawful to use it.
        </Callout>
        <p>
          You agree that before recording you will obtain whatever consent the law requires from everyone whose voice
          may be captured, and that you will comply with your own organisation&apos;s policies. You are responsible for
          what you record and for what you do with the result. If someone asks you to stop recording them, stop.
        </p>
      </Section>

      <Section heading="Your account">
        <List
          items={[
            "Keep your password to yourself. Anything done through your account is treated as done by you.",
            "One account is for one person. Do not share logins.",
            "Give us an email address you can actually receive mail at, since that is how we reach you about the service.",
            "Tell us promptly if you think someone else has got into your account.",
          ]}
        />
      </Section>

      <Section heading="What you may not do">
        <List
          items={[
            "Record anyone without the consent the law requires.",
            "Record conversations you know to be legally privileged or otherwise confidential without the right to do so.",
            "Use the service to harass, deceive, or build a profile of someone without their knowledge.",
            "Try to reach another customer's recordings, notes or account.",
            "Resell the service, or run it on someone else's behalf as if it were your own product, without our written agreement.",
          ]}
        />
        <p>We may suspend or close an account that breaks these rules, and we will tell you why when we do.</p>
      </Section>

      <Section heading="Your content stays yours">
        <p>
          Your recordings, transcripts and notes belong to you. We hold them in order to run the service for you and
          for nothing else. We do not sell them, publish them, or use them to train AI models. You can delete any
          meeting at any time, which erases its audio and text permanently.
        </p>
      </Section>

      <Section heading="Drafts are drafts">
        <p>
          The notes and drafts are produced by an AI model working from the recording. It can mishear a word,
          misattribute a task, or miss something that was said. Read anything before you approve it. Approving a
          draft is your decision and your responsibility, and once approved it is really sent or really created in
          the service you connected.
        </p>
      </Section>

      <Section heading="Services you connect">
        <p>
          If you connect Google, Linear, Jira or Slack, you are authorising us to act in those accounts in the narrow
          ways described when you connect them, and you remain bound by those companies&apos; own terms. You can
          disconnect any of them at any time in Settings.
        </p>
      </Section>

      <Section heading="Paid accounts">
        <p>
          Recording and AI notes require an active account. Free accounts can read what they already have. If we
          introduce or change pricing, we will tell you before it affects you, and you can stop using the service
          rather than accept it.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          We work to keep the service running but we do not promise it will always be available or error-free. It is
          provided as-is, without warranties of any kind. Keep your own copy of anything you cannot afford to lose.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          To the fullest extent the law allows, we are not liable for indirect or consequential loss, lost profits, or
          lost data, and our total liability to you is limited to what you paid us in the twelve months before the
          claim. Nothing here excludes liability that cannot lawfully be excluded.
        </p>
      </Section>

      <Section heading="Ending it">
        <p>
          You can stop using From the Call whenever you like and ask us to delete your account by writing to the
          address below. We may end your access if you break these terms, or if we stop offering the service, in
          which case we will give you reasonable notice and a chance to export what is yours.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms. If a change materially affects you we will email you first. Continuing to use
          the service after a change means you accept it.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms:{" "}
          <a className="underline underline-offset-2 hover:text-accent" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}

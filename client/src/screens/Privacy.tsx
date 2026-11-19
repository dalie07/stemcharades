import type { ReactNode } from "react";
import { Screen, TextLink } from "../components/ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full space-y-2 text-left">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="space-y-2 text-slate-300">{children}</div>
    </section>
  );
}

/** Plain-language privacy notice. Keep it in step with what the server actually stores. */
export function Privacy() {
  return (
    <Screen>
      <h1 className="text-3xl font-bold">Privacy</h1>
      <p className="w-full text-left text-slate-300">
        STEMCHARADES collects as little as it can. There are no ads, no analytics and no third-party trackers.
      </p>

      <Section title="Playing as a guest">
        <p>
          Your nickname and score live only in the server's memory for as long as the room exists, and vanish when it
          ends. Your browser keeps a random seat token for this tab only, so a refresh puts you back in your seat.
        </p>
        <p>Party mode runs entirely on your device and sends nothing anywhere.</p>
      </Section>

      <Section title="If you sign in (optional)">
        <p>
          We store an id from GitHub or Google, a display name (your GitHub username or your Google first name), the
          scores of online games you finish, the cards you missed for your revision list, and any private decks you
          make. We never ask for or store an email address or a password.
        </p>
        <p>
          Signing in sets one cookie that keeps you signed in for 30 days. A second cookie lasts ten minutes while
          sign-in is in progress. Neither is used for tracking.
        </p>
        <p>
          You can delete your account at any time from your account page. That erases everything listed above
          straight away.
        </p>
      </Section>

      <Section title="What the server sees">
        <p>
          Like any website, the server sees your IP address. It is held in memory briefly to stop abuse (for example,
          too many rooms from one address) and may appear in our hosting provider's short-lived logs.
        </p>
        <p>
          Some cards may be written by AI and are labelled “AI-written”. To write them, the server sends an AI
          provider only the topic and the cards already in it, never anything about you. Reporting an AI card sends
          the game a one-way code in place of your address, so each person counts once.
        </p>
        <p>
          The “Flag this card” button opens GitHub in a new tab. What you write there is public, and
          GitHub's own privacy policy applies.
        </p>
      </Section>

      <Section title="Younger players">
        <p>Guests need no account at all. If you are under 13, ask a parent or teacher before signing in.</p>
      </Section>

      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}

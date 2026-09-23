import { useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Phone,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import CredentialHelpTooltip, {
  CredentialGuideHelpLabel,
  type CredentialHelpContent,
} from "@/components/admin/CredentialHelpTooltip";

export type CredentialGuideTopic = "openai" | "twilio" | "google";

type Props = {
  topic: CredentialGuideTopic;
  /** Start expanded (useful the first time a clinic is configured). */
  defaultOpen?: boolean;
  className?: string;
};

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
    </a>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5 pb-4 last:pb-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground leading-relaxed space-y-2">{children}</div>
      </div>
    </li>
  );
}

function FieldRow({ field, where }: { field: string; where: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,9rem)_1fr] gap-1 sm:gap-3 py-2 border-b border-border/60 last:border-0">
      <div className="text-xs font-medium text-foreground">{field}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{where}</div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function Done({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

const META: Record<
  CredentialGuideTopic,
  { title: string; subtitle: string; help: CredentialHelpContent; icon: typeof KeyRound }
> = {
  openai: {
    title: "How to get your OpenAI API key & models",
    subtitle: "Create a key, fund billing, then pick models for chat and phone voice.",
    help: {
      eyebrow: "Setup guide · OpenAI",
      title: "You’re in the right place",
      summary:
        "This walkthrough walks you through billing, creating an sk-… key, and picking the right models — at a calm clinic pace.",
      where:
        "Click this card to expand numbered steps with official OpenAI links. Hover the ? next to each field below for a quick, friendly tip.",
      tip: "Start with the API key field, click Refresh models, then choose Realtime for phone and Chat for web.",
      link: { href: "https://platform.openai.com/api-keys", label: "OpenAI API keys" },
    },
    icon: KeyRound,
  },
  twilio: {
    title: "How to get your Twilio phone & credentials",
    subtitle: "Buy a number, create an API key + TwiML App, then point webhooks at this server.",
    help: {
      eyebrow: "Setup guide · Twilio",
      title: "Phone credentials, explained",
      summary:
        "Seven values work together: your number, account login secrets, a Voice API key, and a TwiML App. We’ll show where each one lives.",
      where:
        "Expand this card for the full path (buy number → API key → TwiML App → webhook). Use ? on each field when you only need one reminder.",
      tip: "Fill all seven fields together, or leave them all blank — partial saves are rejected on purpose.",
      link: { href: "https://console.twilio.com/", label: "Twilio Console" },
    },
    icon: Phone,
  },
  google: {
    title: "How to connect Google Calendar",
    subtitle: "Enable Calendar API, create an OAuth client, then generate a refresh token.",
    help: {
      eyebrow: "Setup guide · Google",
      title: "Calendar access without the headache",
      summary:
        "You’ll create a Cloud project, turn on Calendar API, make an OAuth client, then mint a refresh token so bookings land on the right calendar.",
      where:
        "Expand for every click (including OAuth Playground). Hover ? on Client ID, secret, and refresh token for “where is this again?” cards.",
      tip: "Use a shared clinic Google account so patient appointments don’t mix into someone’s personal calendar.",
      link: {
        href: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
        label: "Enable Calendar API",
      },
    },
    icon: CalendarDays,
  },
};

function OpenAiGuide() {
  return (
    <div className="space-y-5">
      <ol className="list-none m-0 p-0">
        <Step n={1} title="Create or sign in to an OpenAI account">
          <p>
            Go to{" "}
            <ExtLink href="https://platform.openai.com/">platform.openai.com</ExtLink> and sign in
            with the clinic’s organization account (prefer a shared org, not a personal hobby
            account).
          </p>
        </Step>
        <Step n={2} title="Add billing (required for production traffic)">
          <p>
            Open{" "}
            <ExtLink href="https://platform.openai.com/settings/organization/billing">
              Settings → Billing
            </ExtLink>{" "}
            and add a payment method. Voice (Realtime) and chat calls will fail with quota errors if
            billing is empty or the monthly budget is exhausted.
          </p>
          <Tip>
            Set a monthly usage limit so a misconfigured agent cannot unexpectedly run up a large
            bill. Start modest and raise after go-live.
          </Tip>
        </Step>
        <Step n={3} title="Create an API key">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Open{" "}
              <ExtLink href="https://platform.openai.com/api-keys">API keys</ExtLink>.
            </li>
            <li>
              Click <strong>Create new secret key</strong>. Name it something clear (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">Clinic Front Desk — Prod</code>
              ).
            </li>
            <li>
              Copy the key immediately — it starts with <code className="rounded bg-muted px-1 py-0.5 text-[11px]">sk-</code>{" "}
              and is shown <strong>only once</strong>.
            </li>
            <li>Paste it into the <strong>OpenAI API key</strong> field on this tab, then Save.</li>
          </ol>
          <Tip>
            Never commit keys to git or share them in chat/email. If a key leaks, revoke it in the
            OpenAI dashboard and create a new one. Leave the field blank on later saves to keep the
            key already stored for this clinic.
          </Tip>
        </Step>
        <Step n={4} title="Choose models (or use Refresh models)">
          <p>
            Click <strong>Refresh models</strong> after pasting a key so the dropdowns list models
            your org can access. If the clinic key is empty, listing falls back to the server{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.env</code> key.
          </p>
          <div className="rounded-lg border border-border/70 bg-background/60 px-3 mt-2">
            <FieldRow
              field="Chat model"
              where="Used for web chat / text completions. Pick a current GPT chat model available to your org."
            />
            <FieldRow
              field="Realtime model"
              where="Used for live phone conversations (Twilio → OpenAI Realtime). Prefer the latest realtime model your account supports (e.g. gpt-realtime)."
            />
            <FieldRow
              field="Transcription model"
              where="Speech-to-text for voice input paths that use separate STT."
            />
            <FieldRow
              field="TTS model"
              where="Text-to-speech for voice replies outside the Realtime path."
            />
            <FieldRow
              field="Inbound chat model"
              where="Optional override for inbound text / SMS-style handling. Often same family as Chat model."
            />
          </div>
        </Step>
        <Step n={5} title="Voice is set on the agent (not here)">
          <p>
            The speaking voice (e.g. marin, alloy) is chosen on the <strong>agent</strong> under
            Identity / voice picker — Clinics → assign agent, then edit the agent. Models and API key
            stay on this clinic settings dialog.
          </p>
        </Step>
      </ol>
      <Done>
        After saving a valid key and models: open Agents → Test lab, or place a test call to the
        clinic Twilio number, to confirm OpenAI responds.
      </Done>
    </div>
  );
}

function TwilioGuide() {
  return (
    <div className="space-y-5">
      <ol className="list-none m-0 p-0">
        <Step n={1} title="Create a Twilio account and open the Console">
          <p>
            Sign in at{" "}
            <ExtLink href="https://console.twilio.com/">console.twilio.com</ExtLink>. Use a paid
            account for production numbers (trial accounts can only call verified numbers).
          </p>
        </Step>
        <Step n={2} title="Copy Account SID and Auth Token">
          <p>
            On the Console home (or{" "}
            <ExtLink href="https://console.twilio.com/us1/account/keys-credentials/api-keys">
              Account → API keys & tokens
            </ExtLink>
            ):
          </p>
          <div className="rounded-lg border border-border/70 bg-background/60 px-3 mt-2">
            <FieldRow
              field="Account SID"
              where="Starts with AC…. Shown on the Console dashboard as Account SID."
            />
            <FieldRow
              field="Auth token"
              where="Click to reveal Auth Token on the same dashboard. Treat like a password."
            />
          </div>
        </Step>
        <Step n={3} title="Buy (or port) a US phone number">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Go to{" "}
              <ExtLink href="https://console.twilio.com/us1/develop/phone-numbers/manage/search">
                Phone Numbers → Buy a number
              </ExtLink>
              .
            </li>
            <li>Choose a US number with <strong>Voice</strong> (and SMS if you need texts).</li>
            <li>
              Paste the number into <strong>Phone number</strong> and <strong>Caller ID</strong> in{" "}
              <strong>E.164</strong> form: <code className="rounded bg-muted px-1 py-0.5 text-[11px]">+1XXXXXXXXXX</code>{" "}
              (no spaces or dashes). Caller ID is usually the same number for outbound CLI.
            </li>
          </ol>
        </Step>
        <Step n={4} title="Create an API Key (for browser / Voice JWT)">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Open{" "}
              <ExtLink href="https://console.twilio.com/us1/account/keys-credentials/api-keys">
                Account → API keys & tokens → Create API key
              </ExtLink>
              .
            </li>
            <li>
              Type: <strong>Standard</strong>. Name it (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">Clinic Voice SDK</code>).
            </li>
            <li>
              Copy <strong>SID</strong> (starts with <code className="rounded bg-muted px-1 py-0.5 text-[11px]">SK…</code>) →{" "}
              <strong>API key SID</strong>.
            </li>
            <li>
              Copy <strong>Secret</strong> (shown once) → <strong>API key secret</strong>.
            </li>
          </ol>
          <Tip>
            The Auth Token and the API Key Secret are different. You need both: Auth Token for
            server REST calls; API Key SID + Secret for signing Voice access tokens.
          </Tip>
        </Step>
        <Step n={5} title="Create a TwiML App">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Open{" "}
              <ExtLink href="https://console.twilio.com/us1/develop/voice/manage/twiml-apps">
                Voice → TwiML → TwiML Apps
              </ExtLink>{" "}
              → Create new TwiML App.
            </li>
            <li>
              Set a friendly name. Under <strong>Voice Configuration → Request URL</strong>, use your
              public server URL (HTTPS), for example:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] break-all">
                https://YOUR_HOST/api/twilio/voice/twiml
              </code>{" "}
              (HTTP POST). Your host must match the deployed <code className="rounded bg-muted px-1 py-0.5 text-[11px]">SERVER_URL</code>.
            </li>
            <li>
              Save, then copy the App SID (starts with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">AP…</code>) into{" "}
              <strong>TwiML App SID</strong>.
            </li>
          </ol>
        </Step>
        <Step n={6} title="Point the phone number’s Voice webhook at this app">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Open{" "}
              <ExtLink href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming">
                Active numbers
              </ExtLink>{" "}
              → select the clinic number.
            </li>
            <li>
              Under <strong>Voice & Fax → A call comes in</strong>, choose{" "}
              <strong>Webhook</strong>, method <strong>HTTP POST</strong>, URL:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] break-all">
                https://YOUR_HOST/api/twilio/voice/inbound
              </code>
              .
            </li>
            <li>Save. Twilio must reach this URL over the public internet (not localhost).</li>
          </ol>
          <Tip>
            For local development, expose the API with a tunnel (ngrok, Cloudflare Tunnel, etc.) and
            put that HTTPS URL in Twilio and in <code className="rounded bg-muted px-1 py-0.5 text-[11px]">SERVER_URL</code>.
            Optional: set <code className="rounded bg-muted px-1 py-0.5 text-[11px]">TWILIO_STREAM_WSS_URL</code> if
            WebSocket upgrades need a dedicated WSS base for Media Streams.
          </Tip>
        </Step>
        <Step n={7} title="Fill every Twilio field (or leave them all blank)">
          <p>
            This form requires all seven values together. Partial saves are rejected. After saving,
            the clinic shows as Twilio-configured for inbound voice and outbound caller ID.
          </p>
        </Step>
      </ol>
      <div className="rounded-lg border border-border/70 bg-background/60 px-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-2 pb-1">
          Quick field map
        </div>
        <FieldRow field="Phone number" where="Twilio Active number, E.164 (+1…)." />
        <FieldRow field="Caller ID" where="Usually the same E.164 number used when placing outbound calls." />
        <FieldRow field="Account SID" where="Console dashboard — AC…." />
        <FieldRow field="Auth token" where="Console dashboard — Auth Token." />
        <FieldRow field="API key SID" where="API Keys page — SK…." />
        <FieldRow field="API key secret" where="Shown once when the API key is created." />
        <FieldRow field="TwiML App SID" where="Voice → TwiML Apps — AP…." />
      </div>
      <Done>
        Test by calling the Twilio number from a mobile phone. You should hear the clinic agent. If
        Twilio shows webhook errors, check SERVER_URL, HTTPS certificates, and that /api/twilio/voice/inbound
        returns 200.
      </Done>
    </div>
  );
}

function GoogleGuide() {
  return (
    <div className="space-y-5">
      <ol className="list-none m-0 p-0">
        <Step n={1} title="Create a Google Cloud project">
          <p>
            Open{" "}
            <ExtLink href="https://console.cloud.google.com/projectcreate">
              Google Cloud Console → Create project
            </ExtLink>
            . Name it for the clinic (e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">Clinic Scheduling</code>). Select that
            project for all following steps.
          </p>
        </Step>
        <Step n={2} title="Enable the Google Calendar API">
          <p>
            Go to{" "}
            <ExtLink href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com">
              APIs & Services → Library → Google Calendar API
            </ExtLink>{" "}
            and click <strong>Enable</strong>. Without this, token exchange may work but event
            create/cancel will fail.
          </p>
        </Step>
        <Step n={3} title="Configure the OAuth consent screen">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Open{" "}
              <ExtLink href="https://console.cloud.google.com/apis/credentials/consent">
                APIs & Services → OAuth consent screen
              </ExtLink>
              .
            </li>
            <li>
              User type: <strong>External</strong> (or Internal if you only use Google Workspace in
              your org).
            </li>
            <li>Fill app name, support email, and developer contact.</li>
            <li>
              Add scopes (Edit app → Scopes):
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px] break-all">
                    https://www.googleapis.com/auth/calendar
                  </code>
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px] break-all">
                    https://www.googleapis.com/auth/calendar.events
                  </code>
                </li>
              </ul>
            </li>
            <li>
              If the app is in <strong>Testing</strong>, add the Google account that will own the
              clinic calendar as a <strong>Test user</strong>.
            </li>
          </ol>
        </Step>
        <Step n={4} title="Create an OAuth 2.0 Client ID">
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Open{" "}
              <ExtLink href="https://console.cloud.google.com/apis/credentials">
                APIs & Services → Credentials
              </ExtLink>{" "}
              → <strong>Create credentials → OAuth client ID</strong>.
            </li>
            <li>
              Application type: <strong>Web application</strong>.
            </li>
            <li>
              Under <strong>Authorized redirect URIs</strong>, add the Google OAuth Playground
              callback (needed for the next step):{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px] break-all">
                https://developers.google.com/oauthplayground
              </code>
            </li>
            <li>
              Create. Copy <strong>Client ID</strong> → <strong>Google client ID</strong>, and{" "}
              <strong>Client secret</strong> → <strong>Google client secret</strong>.
            </li>
          </ol>
        </Step>
        <Step n={5} title="Generate a refresh token (OAuth Playground)">
          <p>
            The bot needs a long-lived <strong>refresh token</strong> so it can create Calendar
            events without a person clicking “Allow” each time.
          </p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Open{" "}
              <ExtLink href="https://developers.google.com/oauthplayground/">
                Google OAuth 2.0 Playground
              </ExtLink>
              .
            </li>
            <li>
              Click the gear icon (OAuth 2.0 configuration). Check{" "}
              <strong>Use your own OAuth credentials</strong>. Paste the Client ID and Client secret
              from step 4. Close the gear panel.
            </li>
            <li>
              In the left list, find <strong>Calendar API v3</strong> and select:
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    https://www.googleapis.com/auth/calendar
                  </code>
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    https://www.googleapis.com/auth/calendar.events
                  </code>
                </li>
              </ul>
            </li>
            <li>
              Click <strong>Authorize APIs</strong>. Sign in with the Google account whose{" "}
              <strong>primary calendar</strong> should receive clinic appointments (usually the
              front-desk / clinic shared calendar account).
            </li>
            <li>
              Click <strong>Exchange authorization code for tokens</strong>. Copy the{" "}
              <strong>Refresh token</strong> value into <strong>Google refresh token</strong> on this
              tab.
            </li>
          </ol>
          <Tip>
            If Playground does not show a refresh token, revoke prior access for this app at{" "}
            <ExtLink href="https://myaccount.google.com/permissions">
              Google Account → Third-party access
            </ExtLink>
            , then authorize again. Also ensure the OAuth client redirect URI includes the Playground
            URL exactly.
          </Tip>
        </Step>
        <Step n={6} title="Optional: Create Google Meet link">
          <p>
            Turn on <strong>Create Google Meet link</strong> if telehealth templates should attach a
            Meet conference to the Calendar event and email the join link. Requires Calendar access
            with conference data (the scopes above are sufficient). Leave off for in-person-only
            clinics.
          </p>
        </Step>
        <Step n={7} title="Save and verify">
          <p>
            Select <strong>Google Calendar</strong> as the meeting mode, paste all three values, Save.
            Book a test appointment with a scheduling agent — a new event should appear on that Google
            account’s primary calendar.
          </p>
        </Step>
      </ol>
      <div className="rounded-lg border border-border/70 bg-background/60 px-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-2 pb-1">
          Quick field map
        </div>
        <FieldRow field="Google client ID" where="Cloud Console → Credentials → OAuth 2.0 Client ID." />
        <FieldRow field="Google client secret" where="Same client → Client secret." />
        <FieldRow
          field="Google refresh token"
          where="OAuth Playground → Exchange code for tokens → Refresh token."
        />
      </div>
      <Done>
        Events are written to the authorized account’s <strong>primary</strong> calendar. Use a
        dedicated clinic Google account if you do not want personal calendars mixed with patient
        bookings.
      </Done>
    </div>
  );
}

export default function CredentialSetupGuide({ topic, defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = META[topic];
  const Icon = meta.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      <div
        className={cn(
          "rounded-xl border border-border/80 bg-muted/20 overflow-hidden",
          open && "border-primary/25 bg-primary/[0.03]"
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-muted/40 transition-colors"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border/70 shadow-sm">
              <Icon className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <CredentialGuideHelpLabel content={meta.help} title={meta.title} />
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">
                {meta.subtitle}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground mt-1 transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/70 px-3.5 py-4">{topic === "openai" ? (
            <OpenAiGuide />
          ) : topic === "twilio" ? (
            <TwilioGuide />
          ) : (
            <GoogleGuide />
          )}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

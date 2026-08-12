import * as Sentry from "@sentry/nextjs";

const CYA_SENTRY_PUBLIC_DSN =
  "https://b9d4ea7a2a061311a626d43a70712975@o4511878485180416.ingest.de.sentry.io/4511880371044432";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? CYA_SENTRY_PUBLIC_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

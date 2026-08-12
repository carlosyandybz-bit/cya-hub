import * as Sentry from "@sentry/nextjs";

const CYA_SENTRY_PUBLIC_DSN =
  "https://b9d4ea7a2a061311a626d43a70712975@o4511878485180416.ingest.de.sentry.io/4511880371044432";

function initSentry() {
  const dsn =
    process.env.SENTRY_DSN ??
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    CYA_SENTRY_PUBLIC_DSN;

  Sentry.init({
    dsn,
    enabled: process.env.NODE_ENV === "production",
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    initSentry();
  }
}

export const onRequestError = Sentry.captureRequestError;

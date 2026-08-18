import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_API_ORIGIN = "https://graph.facebook.com";

export type WhatsAppMissingRequirement =
  | "access_token"
  | "waba_id"
  | "phone_number_id"
  | "graph_api_version"
  | "verify_token"
  | "app_secret";

type MetaErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type SendMessageResponse = MetaErrorBody & {
  messages?: Array<{ id?: string }>;
};

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function required(name: string) {
  const value = env(name);
  if (!value) throw new Error(`${name} no está configurada.`);
  return value;
}

export function whatsappRuntimeDiagnostics() {
  const missingRequirements: WhatsAppMissingRequirement[] = [];
  if (!env("WHATSAPP_ACCESS_TOKEN")) missingRequirements.push("access_token");
  if (!env("WHATSAPP_WABA_ID")) missingRequirements.push("waba_id");
  if (!env("WHATSAPP_PHONE_NUMBER_ID")) missingRequirements.push("phone_number_id");
  if (!/^v\d+\.\d+$/.test(env("WHATSAPP_GRAPH_API_VERSION"))) missingRequirements.push("graph_api_version");
  if (!env("WHATSAPP_VERIFY_TOKEN")) missingRequirements.push("verify_token");
  if (!env("WHATSAPP_APP_SECRET")) missingRequirements.push("app_secret");

  const sendMissing = missingRequirements.filter((item) =>
    item === "access_token" || item === "phone_number_id" || item === "graph_api_version",
  );
  const webhookMissing = missingRequirements.filter((item) => item === "verify_token" || item === "app_secret");

  return {
    provider: "whatsapp_cloud_api" as const,
    wabaConfigured: !missingRequirements.includes("waba_id"),
    sendConfigured: sendMissing.length === 0,
    webhookConfigured: webhookMissing.length === 0,
    configured: missingRequirements.length === 0,
    missingRequirements,
  };
}

export async function sendWhatsAppText(input: { to: string; body: string }) {
  const diagnostics = whatsappRuntimeDiagnostics();
  if (!diagnostics.sendConfigured) throw new Error("WhatsApp todavía no está preparado para enviar desde el servidor.");

  const destination = input.to.replace(/\D/g, "");
  const body = input.body.trim();
  if (!destination) throw new Error("El destinatario de WhatsApp no es válido.");
  if (!body) throw new Error("El mensaje de WhatsApp está vacío.");

  const version = required("WHATSAPP_GRAPH_API_VERSION");
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const response = await fetch(`${GRAPH_API_ORIGIN}/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${required("WHATSAPP_ACCESS_TOKEN")}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: destination,
      type: "text",
      text: { preview_url: false, body },
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as SendMessageResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `WhatsApp respondió ${response.status}.`);
  }
  const messageId = payload?.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp aceptó la petición sin devolver un identificador de mensaje.");
  return { messageId };
}

export function whatsappVerifyTokenMatches(candidate: string) {
  const expected = env("WHATSAPP_VERIFY_TOKEN");
  if (!expected || !candidate) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(candidate, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = env("WHATSAPP_APP_SECRET");
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const supplied = signatureHeader.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(supplied, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

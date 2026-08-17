import { randomBytes } from "node:crypto";
import tls from "node:tls";

export type EmailRuntimeStatus = {
  configured: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  fromAddress: string | null;
  fromName: string | null;
  missing: string[];
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function required(name: string) {
  const value = clean(process.env[name]);
  if (!value) throw new Error(`${name} no está configurada.`);
  return value;
}

function validPort(value: string) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 && numeric <= 65535 ? numeric : null;
}

function headerValue(value: string) {
  if (/\r|\n/.test(value)) throw new Error("El encabezado de correo contiene caracteres no válidos.");
  return value;
}

function emailAddress(value: string) {
  const normalized = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || /\r|\n/.test(normalized)) {
    throw new Error("La dirección de correo no es válida.");
  }
  return normalized;
}

export function emailRuntimeStatus(): EmailRuntimeStatus {
  const host = clean(process.env.EMAIL_SMTP_HOST);
  const rawPort = clean(process.env.EMAIL_SMTP_PORT);
  const port = validPort(rawPort);
  const secure = clean(process.env.EMAIL_SMTP_SECURE).toLowerCase() !== "false";
  const username = clean(process.env.EMAIL_SMTP_USER);
  const password = clean(process.env.EMAIL_SMTP_PASSWORD);
  const fromAddress = clean(process.env.EMAIL_FROM_ADDRESS);
  const fromName = clean(process.env.EMAIL_FROM_NAME);
  const missing: string[] = [];

  if (!host) missing.push("EMAIL_SMTP_HOST");
  if (!port) missing.push("EMAIL_SMTP_PORT");
  if (!username) missing.push("EMAIL_SMTP_USER");
  if (!password) missing.push("EMAIL_SMTP_PASSWORD");
  if (!fromAddress) missing.push("EMAIL_FROM_ADDRESS");
  if (!fromName) missing.push("EMAIL_FROM_NAME");

  return {
    configured: missing.length === 0 && secure,
    host: host || null,
    port,
    secure,
    username: username || null,
    fromAddress: fromAddress || null,
    fromName: fromName || null,
    missing,
  };
}

type Pending = {
  resolve: (value: { code: number; lines: string[] }) => void;
  reject: (error: Error) => void;
};

class SmtpSession {
  private socket: tls.TLSSocket;
  private buffer = "";
  private lines: string[] = [];
  private pending: Pending | null = null;

  constructor(socket: tls.TLSSocket) {
    this.socket = socket;
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.onData(String(chunk)));
    this.socket.on("error", (error) => this.pending?.reject(error));
    this.socket.on("timeout", () => this.pending?.reject(new Error("El servidor SMTP agotó el tiempo de espera.")));
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const end = this.buffer.indexOf("\r\n");
      if (end < 0) break;
      this.lines.push(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end + 2);
    }
    this.flush();
  }

  private flush() {
    if (!this.pending || !this.lines.length) return;
    const first = this.lines[0];
    const match = /^(\d{3})([ -])/.exec(first);
    if (!match) return;
    const code = Number(match[1]);
    let endIndex = -1;
    for (let index = 0; index < this.lines.length; index += 1) {
      if (this.lines[index].startsWith(`${code} `)) {
        endIndex = index;
        break;
      }
    }
    if (endIndex < 0) return;
    const lines = this.lines.splice(0, endIndex + 1);
    const pending = this.pending;
    this.pending = null;
    pending.resolve({ code, lines });
  }

  response() {
    if (this.pending) throw new Error("La sesión SMTP tiene una respuesta pendiente.");
    return new Promise<{ code: number; lines: string[] }>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.flush();
    });
  }

  async command(command: string, expected: number | number[]) {
    this.socket.write(`${command}\r\n`);
    const response = await this.response();
    const accepted = Array.isArray(expected) ? expected : [expected];
    if (!accepted.includes(response.code)) {
      throw new Error(`SMTP ${response.code}: ${response.lines.join(" ").slice(0, 500)}`);
    }
    return response;
  }

  writeRaw(value: string) {
    this.socket.write(value);
  }

  end() {
    this.socket.end();
  }
}

async function connectSmtp(host: string, port: number) {
  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  socket.setTimeout(15000);
  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", () => resolve());
    socket.once("error", reject);
  });
  const session = new SmtpSession(socket);
  const greeting = await session.response();
  if (greeting.code !== 220) {
    session.end();
    throw new Error(`SMTP ${greeting.code}: el servidor no aceptó la conexión.`);
  }
  return session;
}

function base64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function dotStuff(value: string) {
  return value.replace(/(^|\r\n)\./g, "$1..");
}

export async function verifyEmailSmtp() {
  const status = emailRuntimeStatus();
  if (!status.configured || !status.host || !status.port || !status.username) {
    throw new Error(`La configuración SMTP está incompleta: ${status.missing.join(", ") || "SSL/TLS obligatorio"}.`);
  }
  const session = await connectSmtp(status.host, status.port);
  try {
    await session.command("EHLO cya-hub", 250);
    await session.command("AUTH LOGIN", 334);
    await session.command(base64(status.username), 334);
    await session.command(base64(required("EMAIL_SMTP_PASSWORD")), 235);
    await session.command("QUIT", 221);
    return status;
  } finally {
    session.end();
  }
}

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const status = emailRuntimeStatus();
  if (!status.configured || !status.host || !status.port || !status.username || !status.fromAddress || !status.fromName) {
    throw new Error(`La configuración SMTP está incompleta: ${status.missing.join(", ") || "SSL/TLS obligatorio"}.`);
  }

  const recipient = emailAddress(to);
  const fromAddress = emailAddress(status.fromAddress);
  const fromName = headerValue(status.fromName);
  const safeSubject = headerValue(subject);
  const messageId = `${Date.now()}.${randomBytes(8).toString("hex")}@${fromAddress.split("@")[1]}`;
  const body = Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const message = [
    `From: "${fromName.replace(/"/g, "'")}" <${fromAddress}>`,
    `To: <${recipient}>`,
    `Subject: ${safeSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");

  const session = await connectSmtp(status.host, status.port);
  try {
    await session.command("EHLO cya-hub", 250);
    await session.command("AUTH LOGIN", 334);
    await session.command(base64(status.username), 334);
    await session.command(base64(required("EMAIL_SMTP_PASSWORD")), 235);
    await session.command(`MAIL FROM:<${fromAddress}>`, 250);
    await session.command(`RCPT TO:<${recipient}>`, [250, 251]);
    await session.command("DATA", 354);
    session.writeRaw(`${dotStuff(message)}\r\n.\r\n`);
    const accepted = await session.response();
    if (accepted.code !== 250) throw new Error(`SMTP ${accepted.code}: ${accepted.lines.join(" ").slice(0, 500)}`);
    await session.command("QUIT", 221);
    return { messageId, recipient, fromAddress };
  } finally {
    session.end();
  }
}

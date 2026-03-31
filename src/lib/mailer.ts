import nodemailer from "nodemailer";

type MailerConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function getConfig(): MailerConfig {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT ?? "");
  const secure = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  const from = String(process.env.SMTP_FROM ?? "").trim() || user;
  if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass || !from) {
    const missing: string[] = [];
    if (!host) missing.push("SMTP_HOST");
    if (!Number.isFinite(port) || port <= 0) missing.push("SMTP_PORT");
    if (!user) missing.push("SMTP_USER");
    if (!pass) missing.push("SMTP_PASS");
    if (!from) missing.push("SMTP_FROM");
    throw new Error(`smtp_not_configured:${missing.join(",") || "unknown"}`);
  }
  return { host, port, secure, user, pass, from };
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const cfg = getConfig();
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transport.sendMail({
    from: cfg.from,
    to,
    subject: "知行馆 · 重置密码",
    text: `你正在重置知行馆账号密码。\n\n请打开以下链接设置新密码（有效期 30 分钟）：\n${resetUrl}\n\n如果不是你本人操作，请忽略本邮件。`,
  });
}

export async function sendTestEmail(to: string): Promise<void> {
  const cfg = getConfig();
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  await transport.sendMail({
    from: cfg.from,
    to,
    subject: "知行馆 · SMTP 测试邮件",
    text: `这是一封测试邮件，用于验证 SMTP 配置是否正确。\n\n发送时间：${new Date().toISOString()}\n`,
  });
}


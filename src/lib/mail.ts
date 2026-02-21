import nodemailer from "nodemailer";
import { getSiteUrl, SITE_NAME } from "./site";

interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(options: SendMailOptions) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  const hasSmtpConfig = SMTP_HOST && SMTP_PORT && SMTP_FROM;
  if (!hasSmtpConfig) {
    console.info(
      `[mail] SMTP not configured. Would send email to ${options.to}: ${options.subject}\n${options.text}`
    );
    return { delivered: false, logged: true } as const;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  const from = SMTP_FROM || SMTP_USER || `no-reply@${new URL(getSiteUrl()).hostname}`;

  const info = await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  return { delivered: true, messageId: info.messageId } as const;
}

export async function sendVerificationEmail(params: {
  email: string;
  token: string;
  displayName?: string | null;
}) {
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const verifyUrl = `${siteUrl}/api/auth/verify-email?token=${encodeURIComponent(params.token)}`;

  const greeting = params.displayName || params.email;
  const subject = `${SITE_NAME} – Verify your email`;
  const text = `Hi ${greeting},\n\nPlease verify your email address to finish setting up your account.\n\nClick the link below to verify:\n${verifyUrl}\n\nIf you did not sign up, you can safely ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2>Verify your email</h2>
      <p>Hi ${greeting},</p>
      <p>Please verify your email address to finish setting up your ${SITE_NAME} account.</p>
      <p><a href="${verifyUrl}" style="background: #111827; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email</a></p>
      <p>Or copy and paste this link into your browser:<br/><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>If you did not sign up, you can safely ignore this email.</p>
    </div>
  `;

  return sendMail({ to: params.email, subject, text, html });
}

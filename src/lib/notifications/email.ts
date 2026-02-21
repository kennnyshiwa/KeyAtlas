import { getSiteUrl, SITE_NAME } from "@/lib/site";

type Provider = "mailgun" | "log";

interface NotificationEmailPayload {
  to: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

function renderTemplate(payload: NotificationEmailPayload) {
  const appUrl = getSiteUrl().replace(/\/$/, "");
  const html = `
  <div style="background:#f6f8fb;padding:24px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="padding:24px 24px 10px;">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">${SITE_NAME}</div>
        <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;color:#0f172a;">${payload.heading}</h1>
      </td></tr>
      <tr><td style="padding:10px 24px 0;font-size:15px;line-height:1.6;color:#334155;">${payload.body}</td></tr>
      <tr><td style="padding:20px 24px 28px;">
        <a href="${payload.ctaUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:600;">${payload.ctaLabel}</a>
      </td></tr>
      <tr><td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">You're receiving this because of your notification preferences on ${SITE_NAME}. Manage settings at <a href="${appUrl}/profile?tab=settings" style="color:#334155;">${appUrl}/profile</a>.</td></tr>
    </table>
  </div>`;

  const text = `${payload.heading}\n\n${payload.body}\n\n${payload.ctaLabel}: ${payload.ctaUrl}`;

  return { html, text };
}

function getProvider(): Provider {
  if (
    process.env.MAIL_PROVIDER === "mailgun" &&
    process.env.MAILGUN_API_KEY &&
    process.env.MAILGUN_DOMAIN
  ) {
    return "mailgun";
  }
  return "log";
}

export async function sendNotificationEmail(payload: NotificationEmailPayload) {
  const provider = getProvider();
  const { html, text } = renderTemplate(payload);

  if (provider === "log") {
    console.info(`[mail:log] to=${payload.to} subject=${payload.subject}\n${text}`);
    return { delivered: false, provider: "log" as const };
  }

  const domain = process.env.MAILGUN_DOMAIN!;
  const apiKey = process.env.MAILGUN_API_KEY!;
  const from = process.env.MAIL_FROM || `KeyAtlas <noreply@${domain}>`;

  const form = new URLSearchParams({
    from,
    to: payload.to,
    subject: payload.subject,
    text,
    html,
  });

  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailgun send failed: ${res.status} ${body}`);
  }

  return { delivered: true, provider: "mailgun" as const };
}

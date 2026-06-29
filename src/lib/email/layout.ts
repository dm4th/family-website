/**
 * Email layout primitives — a single restrained, editorial shell shared by all
 * transactional emails (booking notifications today; invitations later).
 *
 * Email HTML is its own dialect: no external stylesheets, inline styles only,
 * table-based structure for legacy clients. We keep it deliberately simple and
 * on-brand with the "private family office" palette (ivory surface, ink text,
 * a single forest accent for the call-to-action — bookings are Operations mode).
 */

/** A labelled fact shown in the email's detail block (e.g. "Dates" → "…"). */
export type EmailDetail = { label: string; value: string };

/** A single call-to-action button. */
export type EmailCta = { label: string; url: string };

export type EmailContent = {
  /** Hidden preheader text shown in inbox previews. */
  preview: string;
  /** Large serif-style heading at the top of the card. */
  heading: string;
  /** Body paragraphs, in order. Plain strings; rendered as <p>. */
  paragraphs: string[];
  /** Optional labelled detail rows (dates, property, guests…). */
  details?: EmailDetail[];
  /** Optional primary action button. */
  cta?: EmailCta;
};

const INK = "#23201c";
const MUTED = "#6b655c";
const IVORY = "#f7f4ee";
const CARD = "#fffdf8";
const RULE = "#e7e1d6";
const FOREST = "#2f4a3a";

/** Escape a string for safe interpolation into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render the full HTML document for a transactional email. */
export function renderEmailHtml(content: EmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(
          p,
        )}</p>`,
    )
    .join("");

  const details = content.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 20px;border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};">${content.details
        .map(
          (d) =>
            `<tr><td style="padding:10px 0;font-size:13px;color:${MUTED};width:120px;vertical-align:top;">${escapeHtml(
              d.label,
            )}</td><td style="padding:10px 0;font-size:14px;color:${INK};vertical-align:top;">${escapeHtml(
              d.value,
            )}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td style="border-radius:8px;background:${FOREST};"><a href="${escapeHtml(
        content.cta.url,
      )}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(
        content.cta.label,
      )}</a></td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${IVORY};">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(
    content.preview,
  )}</span>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${IVORY};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:${CARD};border:1px solid ${RULE};border-radius:14px;">
<tr><td style="padding:28px 28px 8px;">
<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};margin-bottom:14px;">Mathieson Family</div>
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:600;color:${INK};">${escapeHtml(
    content.heading,
  )}</h1>
${paragraphs}
${details}
${cta}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid ${RULE};">
<p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">You're receiving this because you're part of the Mathieson family portal. Manage bookings anytime from the family calendar.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Render the plaintext fallback for the same content. */
export function renderEmailText(content: EmailContent): string {
  const lines: string[] = [content.heading, ""];
  for (const p of content.paragraphs) {
    lines.push(p, "");
  }
  if (content.details?.length) {
    for (const d of content.details) {
      lines.push(`${d.label}: ${d.value}`);
    }
    lines.push("");
  }
  if (content.cta) {
    lines.push(`${content.cta.label}: ${content.cta.url}`, "");
  }
  lines.push(
    "—",
    "Mathieson family portal. Manage bookings from the family calendar.",
  );
  return lines.join("\n");
}

// Every email template in this app builds HTML by interpolating
// customer/lead/business data straight into template strings, with no
// templating engine doing this automatically. Customer name, in
// particular, is attacker-controllable end to end via the public,
// unauthenticated chat/portal signup with no character restrictions -
// without escaping, a customer's own name embedded in an email sent to
// the BUSINESS OWNER (e.g. dailyDigestService.js's lead-name list) lets
// that customer inject arbitrary HTML into an email a different person
// reads (stored HTML injection/XSS). Every caller building
// customer/lead-derived HTML should route it through this first.
const escapeHtml = (value) => {

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

};


// Same hex values frontend/src/index.css uses for --brand-600 under each
// :root[data-accent="..."] block, so an email visually matches whatever
// accent color the business picked in Settings.
const ACCENT_HEX = {
  orange: "#ea580c",
  blue: "#2563eb",
  violet: "#7c3aed",
  teal: "#0d9488"
};


const renderEmailLayout = ({ heading, bodyHtml, accentColor }) => {

  const accent = ACCENT_HEX[accentColor] || ACCENT_HEX.orange;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5; padding:24px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; width:100%; background:#ffffff; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background:${accent}; padding:20px 24px;">
                <span style="color:#ffffff; font-size:18px; font-weight:bold;">${heading}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px; color:#27272a; font-size:15px; line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px; border-top:1px solid #e4e4e7; color:#a1a1aa; font-size:12px;">
                Sent via Atlas
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

};


const renderEmailButton = (url, label, accentColor) => {

  const accent = ACCENT_HEX[accentColor] || ACCENT_HEX.orange;

  return `<a href="${url}" style="display:inline-block; padding:12px 24px; background:${accent}; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold;">${label}</a>`;

};


const sendEmail = async ({ to, subject, html }) => {

  const response = await fetch("https://api.resend.com/emails", {

    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`
    },

    body: JSON.stringify({
      // Resend's own shared "onboarding@resend.dev" sandbox address can
      // only deliver to the Resend ACCOUNT's own verified email - fine
      // for development, but it means every business's real customers
      // silently never receive a thing until a real domain is verified
      // (see docs/EMAIL_SETUP.md). RESEND_FROM_EMAIL lets that switch
      // happen with a one-line .env change once a domain is ready,
      // instead of a code change.
      from: process.env.RESEND_FROM_EMAIL || "Atlas <onboarding@resend.dev>",
      to: [to],
      subject,
      html
    })

  });

  if (!response.ok) {

    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Failed to send email");

  }

  return response.json();

};



const sendPasswordResetEmail = async (to, resetUrl) => {

  return sendEmail({

    to,

    subject: "Reset your Atlas password",

    html: renderEmailLayout({
      heading: "Atlas",
      bodyHtml: `
        <p>Someone requested a password reset for your Atlas account.</p>
        <p>${renderEmailButton(resetUrl, "Reset your password")}</p>
        <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      `
    })

  });

};



module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  escapeHtml,
  renderEmailLayout,
  renderEmailButton
};

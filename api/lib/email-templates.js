// api/lib/email-templates.js
// HTML email templates for Sovereign Acquisitions outreach.
// Pure string-based — no JSX, works in Edge runtime.

const BRAND_GOLD  = '#c9a84c';
const BRAND_DARK  = '#0f0f17';
const TEXT_MAIN   = '#1a1a2e';
const TEXT_MUTED  = '#6b7280';
const BG_PAGE     = '#f4f4f6';
const BG_CARD     = '#ffffff';
const BG_FOOTER   = '#1a1a2e';

// Escape HTML entities in user-supplied strings
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convert markdown-style bold (**text**) and newlines to HTML
function formatBody(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

/**
 * Outreach email template.
 * @param {object} opts
 * @param {string} opts.body            - Email body text (Claude's Email Body section)
 * @param {string} [opts.senderName]    - Name shown in footer (default: Sovereign Acquisitions)
 * @param {string} [opts.senderTitle]   - Sender title line
 * @param {string} [opts.unsubscribeUrl] - One-click unsubscribe URL
 */
export function outreachTemplate({ body, senderName, senderTitle, unsubscribeUrl }) {
  const name  = senderName  || 'Sovereign Acquisitions';
  const title = senderTitle || 'Deal Sourcing Team';
  const year  = new Date().getFullYear();
  const unsubLink = unsubscribeUrl ? `<a href="${esc(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Message from Sovereign Acquisitions</title>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_PAGE};padding:40px 0;">
  <tr>
    <td align="center">

      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BG_CARD};border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header bar -->
        <tr>
          <td style="background:${BRAND_DARK};padding:28px 40px;" align="left">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-left:3px solid ${BRAND_GOLD};padding-left:14px;">
                  <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.03em;">SOVEREIGN</div>
                  <div style="font-size:11px;color:${BRAND_GOLD};letter-spacing:0.12em;text-transform:uppercase;margin-top:2px;">Acquisitions</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Gold accent line -->
        <tr>
          <td style="background:${BRAND_GOLD};height:3px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;color:${TEXT_MAIN};font-size:15px;line-height:1.75;">
            ${formatBody(body)}
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #e5e7eb;font-size:0;height:1px;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="padding:24px 40px 36px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-left:3px solid ${BRAND_GOLD};padding-left:14px;">
                  <div style="font-size:14px;font-weight:600;color:${TEXT_MAIN};">${esc(name)}</div>
                  <div style="font-size:12px;color:${TEXT_MUTED};margin-top:2px;">${esc(title)}</div>
                  <div style="font-size:12px;color:${BRAND_GOLD};margin-top:4px;font-weight:500;">sovereigncmd.xyz</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${BG_FOOTER};padding:20px 40px;" align="center">
            <p style="margin:0;font-size:11px;color:#6b7280;line-height:1.8;">
              Sovereign Acquisitions Ltd &bull; 71-75 Shelton Street, London, WC2H 9JQ, United Kingdom<br>
              This message was sent on behalf of ${esc(name)}. &copy; ${year} Sovereign Acquisitions.<br>
              ${unsubLink ? `${unsubLink} &bull; ` : ''}<a href="https://sovereigncmd.xyz/legal.html#privacy" style="color:#6b7280;text-decoration:underline;">Privacy Policy</a>
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td>
  </tr>
</table>

</body>
</html>`;
}

/**
 * Parse Claude's outreach output into { subject, body } parts.
 * Handles both bold-header and plain-text formats.
 */
export function parseOutreachOutput(output) {
  const subjectMatch = output.match(
    /\*\*Subject Line[:\*]*\*?\*?\s*[\n:]+\s*([\s\S]+?)(?=\n\n|\*\*Email Body|\*\*Follow)/i
  );
  const bodyMatch = output.match(
    /\*\*Email Body[:\*]*\*?\*?\s*[\n:]+\s*([\s\S]+?)(?=\n\n\*\*Follow-up Note|\n\n\*\*|$)/i
  );

  return {
    subject: subjectMatch?.[1]?.trim() || '',
    body:    bodyMatch?.[1]?.trim()    || output,
  };
}

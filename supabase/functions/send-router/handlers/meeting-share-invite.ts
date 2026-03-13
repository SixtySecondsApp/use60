import { sendEmail } from '../../_shared/ses.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../../_shared/corsHelper.ts';

interface MeetingShareInviteRequest {
  to_email: string;
  meeting_title: string;
  share_url: string;
  sharer_name?: string;
}

function generateMeetingShareEmailTemplate(
  meetingTitle: string,
  shareUrl: string,
  sharerName?: string
): string {
  const titleLine = sharerName
    ? `${sharerName} shared a meeting with you`
    : 'A meeting has been shared with you';
  const subtitleLine = `Private access to: ${meetingTitle}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Meeting shared with you</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style type="text/css">
    body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    html { color-scheme: light !important; background-color: #030712 !important; margin: 0 !important; padding: 0 !important; }
    body { color-scheme: light !important; background-color: #030712 !important; margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-fill-color: #F3F4F6 !important; }
    * { color-scheme: light !important; forced-color-adjust: none !important; }
    u + .body .gmail-blend-screen, u + .body .gmail-blend-difference, .msg-html-content, .msg-html-content * { background-color: #111827 !important; color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF !important; forced-color-adjust: none !important; }
    u + .body { background-color: #111827 !important; color-scheme: light !important; }
    @media only screen and (max-width: 600px) {
      html, body { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; background-color: #111827 !important; color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF !important; overflow-x: hidden !important; }
      .email-container { width: 100% !important; max-width: 100% !important; margin: 0 !important; border-radius: 0 !important; background-color: #111827 !important; }
      .email-header { padding: 32px 20px 24px !important; }
      .email-logo { width: 64px !important; height: 64px !important; max-width: 64px !important; }
      .email-title { font-size: 24px !important; }
      .email-subtitle { font-size: 16px !important; }
      .email-content { padding: 24px 20px !important; }
      .email-button { padding: 12px 24px !important; font-size: 15px !important; }
      .email-footer { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0 !important; padding: 0 !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030712 !important; -webkit-font-smoothing: antialiased; color-scheme: light !important; -webkit-text-fill-color: #FFFFFF !important; color: #FFFFFF !important; width: 100% !important;">
  <div style="background-color: #111827 !important; min-height: 100vh; width: 100% !important; margin: 0 !important; padding: 0 !important;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #030712 !important; padding: 0; margin: 0 auto; width: 100% !important;">
    <tr style="background-color: #030712 !important;">
      <td align="center" style="padding: 20px 0; background-color: #030712 !important;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width: 600px; width: 100%; background-color: #111827 !important; border-radius: 16px; overflow: hidden; border: 1px solid #374151 !important;">
          <!-- Header with Logo -->
          <tr style="background-color: #111827 !important;">
            <td class="email-header" style="padding: 48px 40px 32px; text-align: center; background-color: #111827 !important; background: linear-gradient(135deg, #111827 0%, #1F2937 100%) !important;">
              <img src="https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png" alt="60" width="80" height="80" class="email-logo" style="display: block; margin: 0 auto 24px; border: 0; max-width: 80px; width: 80px; height: auto; background-color: transparent !important;" />
              <h1 class="email-title" style="color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF !important; font-size: 28px; font-weight: 700; margin: 0 0 12px 0; line-height: 1.2; letter-spacing: -0.02em; background-color: transparent !important;">${titleLine}</h1>
              <p class="email-subtitle" style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 18px; margin: 0; line-height: 1.5; font-weight: 400; background-color: transparent !important;">${subtitleLine}</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr style="background-color: #111827 !important;">
            <td class="email-content" style="padding: 40px 40px; background-color: #111827 !important; color: #F3F4F6 !important;">
              <!-- Welcome Message -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px; background-color: #111827 !important;">
                <tr style="background-color: #111827 !important;">
                  <td style="background-color: #111827 !important;">
                    <p style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0; text-align: center; background-color: #111827 !important;">You've been given private access to view the recording, summary, and transcript for this meeting.</p>
                  </td>
                </tr>
              </table>

              <!-- Meeting Details Section -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px; background-color: #111827 !important;">
                <tr style="background-color: #111827 !important;">
                  <td style="background-color: #111827 !important;">
                    <h3 style="color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF !important; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 20px 0; background-color: #111827 !important;">MEETING DETAILS</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #111827 !important;">
                      <tr style="background-color: #111827 !important;">
                        <td style="padding-bottom: 16px; background-color: #111827 !important;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #111827 !important;">
                            <tr style="background-color: #111827 !important;">
                              <td width="28" valign="top" style="padding-top: 2px; padding-right: 12px; background-color: #111827 !important;">
                                <span style="color: #10B981 !important; -webkit-text-fill-color: #10B981 !important; font-size: 18px; font-weight: bold; line-height: 1.5; display: block; background-color: #111827 !important;">&#9658;</span>
                              </td>
                              <td valign="top" style="background-color: #111827 !important;">
                                <p style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 14px; line-height: 1.8; margin: 0; background-color: #111827 !important;"><strong style="color: #FFFFFF !important;">${meetingTitle}</strong></p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr style="background-color: #111827 !important;">
                        <td style="padding-bottom: 16px; background-color: #111827 !important;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #111827 !important;">
                            <tr style="background-color: #111827 !important;">
                              <td width="28" valign="top" style="padding-top: 2px; padding-right: 12px; background-color: #111827 !important;">
                                <span style="color: #10B981 !important; -webkit-text-fill-color: #10B981 !important; font-size: 18px; font-weight: bold; line-height: 1.5; display: block; background-color: #111827 !important;">&#10003;</span>
                              </td>
                              <td valign="top" style="background-color: #111827 !important;">
                                <p style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 14px; line-height: 1.8; margin: 0; background-color: #111827 !important;">Recording, transcript &amp; AI summary included</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr style="background-color: #111827 !important;">
                        <td style="background-color: #111827 !important;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #111827 !important;">
                            <tr style="background-color: #111827 !important;">
                              <td width="28" valign="top" style="padding-top: 2px; padding-right: 12px; background-color: #111827 !important;">
                                <span style="color: #10B981 !important; -webkit-text-fill-color: #10B981 !important; font-size: 18px; font-weight: bold; line-height: 1.5; display: block; background-color: #111827 !important;">&#128274;</span>
                              </td>
                              <td valign="top" style="background-color: #111827 !important;">
                                <p style="color: #F3F4F6 !important; -webkit-text-fill-color: #F3F4F6 !important; font-size: 14px; line-height: 1.8; margin: 0; background-color: #111827 !important;">This link is personal to your email and expires in 30 days</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #111827 !important;">
                <tr style="background-color: #111827 !important;">
                  <td align="center" style="padding-bottom: 24px; background-color: #111827 !important;">
                    <a href="${shareUrl}" class="email-button" style="display: inline-block; padding: 14px 32px; background-color: #10B981 !important; background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important; color: #FFFFFF !important; -webkit-text-fill-color: #FFFFFF !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); line-height: 1.4;">View Meeting</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr style="background-color: #111827 !important;">
            <td class="email-footer" style="padding: 24px 40px; text-align: center; background-color: #111827 !important; border-top: 1px solid #374151 !important;">
              <p style="color: #D1D5DB !important; -webkit-text-fill-color: #D1D5DB !important; font-size: 14px; margin: 0 0 8px 0; font-weight: 500; line-height: 1.4; background-color: transparent !important;">Sent by Sixty Seconds</p>
              <p style="color: #9CA3AF !important; -webkit-text-fill-color: #9CA3AF !important; font-size: 12px; margin: 0; line-height: 1.4; background-color: transparent !important;">Questions? Contact us at <a href="mailto:support@use60.com" style="color: #10B981 !important; text-decoration: none;">support@use60.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  </div>
</body>
</html>`.trim();
}

export async function handleMeetingShareInvite(req: Request): Promise<Response> {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const cors = getCorsHeaders(req);

  try {
    const { to_email, meeting_title, share_url, sharer_name }: MeetingShareInviteRequest = await req.json();

    if (!to_email || !meeting_title || !share_url) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: to_email, meeting_title, share_url',
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const emailHtml = generateMeetingShareEmailTemplate(meeting_title, share_url, sharer_name);
    const emailSubject = `Meeting shared with you: ${meeting_title}`;
    const emailText = `A meeting has been shared with you: ${meeting_title}\n\nView it here: ${share_url}\n\nThis link is personal to your email and expires in 30 days.`;

    const result = await sendEmail({
      to: to_email,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
      from: 'app@use60.com',
      fromName: '60',
    });

    if (!result.success) {
      console.error('[meeting-share-invite] Failed to send email:', result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error || 'Failed to send email' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[meeting-share-invite] Sent to ${to_email} for meeting: ${meeting_title}`);
    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[meeting-share-invite] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
}

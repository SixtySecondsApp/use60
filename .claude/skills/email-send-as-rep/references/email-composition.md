# Email Send-as-Rep: Email Composition Reference

This document defines the technical rules for composing emails sent through the email-send-as-rep skill. Every email must be a valid RFC 2822 message that is indistinguishable from one the rep typed in their email client.

## 1. Gmail API Message Format

### RFC 2822 Structure

The Gmail API `messages.send` endpoint accepts a `raw` field containing the full RFC 2822 message encoded as base64url. The message must be constructed as a complete email with headers and body.

### Basic Message Structure

```
From: "Sarah Chen" <sarah@company.com>
To: "John Smith" <john@prospect.com>
Subject: Meeting follow-up: pricing discussion
Date: Thu, 13 Feb 2026 14:30:00 -0500
Message-ID: <unique-id@company.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit

Hi John,

Great speaking with you earlier today...

--
Sarah Chen
Account Executive | Company
sarah@company.com | (555) 123-4567
```

### Required Headers

| Header | Required | Notes |
|--------|----------|-------|
| `From` | YES | Rep's display name and email address |
| `To` | YES | Recipient email address(es) |
| `Subject` | YES | Email subject line |
| `Date` | YES | RFC 2822 formatted date |
| `Message-ID` | YES | Unique identifier for this message |
| `MIME-Version` | YES | Always `1.0` |
| `Content-Type` | YES | `text/plain` or `multipart/alternative` |

### Optional Headers

| Header | When Used | Notes |
|--------|-----------|-------|
| `Cc` | When CC recipients specified | Comma-separated |
| `Bcc` | When BCC recipients specified | Not visible to recipients |
| `Reply-To` | When different from From | Rarely used; do not set unless rep configured it |
| `In-Reply-To` | Replies only | Message-ID of the message being replied to |
| `References` | Replies only | Full chain of Message-IDs in the thread |
| `X-Mailer` | Optional | Can identify the sending system (use cautiously) |

### Message-ID Generation

Every outbound email must have a unique Message-ID. Format:

```
Message-ID: <{uuid}@{sender-domain}>
```

Example:
```
Message-ID: <a1b2c3d4-e5f6-7890-abcd-ef1234567890@company.com>
```

Rules:
- Use a UUID v4 for uniqueness
- Domain part must match the sender's email domain
- Never reuse a Message-ID
- Never fabricate a Message-ID that looks like it came from a different system

### Base64url Encoding

The Gmail API requires the entire RFC 2822 message to be base64url encoded:

```javascript
// Construct the RFC 2822 message as a string
const rawMessage = [
  `From: "${displayName}" <${fromEmail}>`,
  `To: ${toEmail}`,
  `Subject: ${subject}`,
  `Date: ${new Date().toUTCString()}`,
  `Message-ID: <${uuid()}@${domain}>`,
  `MIME-Version: 1.0`,
  `Content-Type: text/plain; charset=UTF-8`,
  ``,
  body
].join('\r\n');

// Base64url encode (NOT standard base64)
const encoded = Buffer.from(rawMessage)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
```

Note: Standard base64 uses `+` and `/`. Base64url uses `-` and `_`. Gmail rejects standard base64.

## 2. Thread-Aware Headers

Correct threading is critical. When a reply lands in the recipient's inbox, it must appear in the same conversation thread as the original email. Incorrect headers break threading and create confusion.

### In-Reply-To Header

Set to the `Message-ID` of the specific message being replied to:

```
In-Reply-To: <original-message-id@sender-domain.com>
```

Rules:
- Must be the exact Message-ID from the last message in the thread
- Must include the angle brackets `< >`
- Only one Message-ID (the most recent message)
- If the original message has no Message-ID (rare but possible), omit this header

### References Header

Contains the full chain of Message-IDs in the thread, space-separated:

```
References: <first-message-id@domain.com> <second-message-id@domain.com> <third-message-id@domain.com>
```

Rules:
- Include all Message-IDs from the thread, in chronological order
- Space-separated, each wrapped in angle brackets
- The last entry should match the In-Reply-To value
- If the References chain exceeds 20 entries, keep the first 5 and last 15 (per RFC 2822 recommendation)
- If the original thread has no References header, start a new chain with just the In-Reply-To value

### Building the References Chain

```javascript
function buildReferencesChain(threadMessages) {
  const messageIds = threadMessages
    .map(msg => msg.headers['Message-ID'])
    .filter(Boolean);

  // RFC 2822: if chain is very long, trim the middle
  if (messageIds.length > 20) {
    const first5 = messageIds.slice(0, 5);
    const last15 = messageIds.slice(-15);
    return [...first5, ...last15].join(' ');
  }

  return messageIds.join(' ');
}
```

### Gmail Thread-ID

Gmail has a proprietary `threadId` concept separate from RFC headers. When sending a reply through the Gmail API:

```json
{
  "raw": "base64url_encoded_message",
  "threadId": "18d1a2b3c4d5e6f7"
}
```

Include the `threadId` in the API request body to ensure Gmail groups the reply correctly. This is in ADDITION to the RFC headers -- both are needed for cross-client compatibility.

### Subject Line for Replies

```javascript
function getReplySubject(originalSubject) {
  // Remove existing Re: prefixes (don't stack them)
  const cleaned = originalSubject.replace(/^(Re:\s*)+/i, '').trim();
  return `Re: ${cleaned}`;
}

// Examples:
// "Pricing discussion" -> "Re: Pricing discussion"
// "Re: Pricing discussion" -> "Re: Pricing discussion" (not "Re: Re: Pricing discussion")
// "RE: RE: Pricing discussion" -> "Re: Pricing discussion" (normalize case too)
```

### Reply Recipients

When replying, determine the correct recipients:

| Action | To | CC |
|--------|----|----|
| Reply (default) | Original sender only | None |
| Reply All | Original sender + all To recipients (minus self) | All CC recipients (minus self) |
| Reply with redirect | As specified by rep | As specified by rep |

Always exclude the rep's own email from To and CC when replying all.

## 3. Signature Handling

### Signature Detection

When composing an email, the rep's signature must be appended. But first, check whether the provided body already contains a signature to avoid duplication.

Signature detection heuristics:

```
1. Check for common signature delimiters:
   - "-- \n" (RFC standard signature delimiter: dash-dash-space-newline)
   - "---" (common informal delimiter)
   - "--" followed by the rep's name

2. Check for signature-like content at the end:
   - Rep's full name
   - Rep's job title
   - Rep's phone number pattern
   - Rep's company name

3. If ANY of these are found in the last 10 lines of the body:
   - Do NOT append the signature (it's already there)
   - Log: signature_already_present = true
```

### Signature Appending

If no signature is detected, append it:

```
[body content]

--
[signature]
```

The delimiter is `-- \n` (dash, dash, space, newline). This is the RFC 3676 standard. The trailing space after the dashes is important -- many email clients use it to identify and format the signature differently.

### Signature Sources (Priority Order)

1. **User settings** -- check `user_settings.email_signature` for a stored signature
2. **Gmail API** -- fetch from `users.settings.sendAs` (the signature configured in Gmail)
3. **Default fallback** -- `{display_name}\n{job_title} | {company_name}\n{email}`

### Signature in Replies

For replies, the signature goes AFTER the new content but BEFORE the quoted original:

```
Hi John,

Thanks for the pricing details. Let me review and get back to you tomorrow.

--
Sarah Chen
Account Executive | Company
sarah@company.com

On Thu, Feb 13, 2026 at 10:30 AM, John Smith <john@prospect.com> wrote:
> Hi Sarah,
>
> Here are the pricing details you requested...
```

### Signature Format Preservation

- If the signature is HTML, preserve the HTML formatting
- If the signature is plain text, preserve whitespace and line breaks
- Never modify the signature content (no "improving" or "fixing" typos)
- The signature is the rep's identity -- treat it as immutable

## 4. HTML vs Plain Text Rules

### Default Format Selection

| Scenario | Default Format | Rationale |
|----------|---------------|-----------|
| New email (cold outreach) | Plain text | Higher deliverability, feels personal |
| New email (existing relationship) | Plain text | Matches typical rep behavior |
| Reply to plain text thread | Plain text | Match the thread format |
| Reply to HTML thread | HTML | Match the thread format |
| Email with links/formatting needed | HTML | Functional requirement |
| Email to enterprise/procurement | Plain text | Formal, no-nonsense |

### Plain Text Format

```
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit
```

Rules for plain text:
- Line width: wrap at 78 characters (RFC 2822 recommendation)
- Line endings: `\r\n` in the raw message (CRLF per RFC)
- No HTML tags
- URLs written out in full (no hyperlinks)
- Use spacing and dashes for visual structure, not HTML

### HTML Format

When HTML is needed, use `multipart/alternative` to include both plain text and HTML:

```
Content-Type: multipart/alternative; boundary="boundary-string"

--boundary-string
Content-Type: text/plain; charset=UTF-8

[plain text version]

--boundary-string
Content-Type: text/html; charset=UTF-8

<html>
<body>
[HTML version]
</body>
</html>

--boundary-string--
```

Rules for HTML:
- Always include a plain text alternative (multipart/alternative)
- Use inline CSS only (no external stylesheets, no `<style>` blocks in `<head>`)
- Use table-based layout for compatibility (email clients have limited CSS support)
- No JavaScript (email clients strip it)
- No external images unless the rep explicitly includes them (tracking pixel concerns)
- Use `<br>` for line breaks, `<p>` for paragraphs
- Background colors: use only on `<td>` elements, not `<body>` or `<div>`

### HTML Safety

When composing HTML emails:
- Sanitize any user-provided HTML (strip `<script>`, `onclick`, etc.)
- Validate all URLs (no `javascript:` protocol)
- No external resource loading (`<img src="https://...">`) unless the rep's signature contains images
- No forms or interactive elements
- No iframes or embeds

### Quoted Reply Format

For plain text replies, the quoted original uses `>` prefix:

```
On Thu, Feb 13, 2026 at 10:30 AM, John Smith <john@prospect.com> wrote:
> Original message line 1
> Original message line 2
>
> > Even older quoted text
> > uses double-angle brackets
```

For HTML replies, the quoted original uses a `<blockquote>`:

```html
<div>New reply content here</div>
<br>
<div class="gmail_quote">
  <div dir="ltr" class="gmail_attr">
    On Thu, Feb 13, 2026 at 10:30 AM, John Smith &lt;john@prospect.com&gt; wrote:
  </div>
  <blockquote style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
    Original message content
  </blockquote>
</div>
```

## 5. Attachment Support

### V1 Scope

Attachments are NOT supported in v1 of this skill. If the rep wants to attach a file:

- Inform them: "File attachments aren't supported yet in email sending. You can send the email without the attachment and share the file via a link, or send the email directly from Gmail."
- Suggest alternatives: cloud file links (Google Drive, Dropbox), linking to a use60 document
- Do NOT attempt to encode attachments -- the MIME handling is complex and must be tested thoroughly

### V2 Attachment Format (Future Reference)

When attachments are implemented, they will use `multipart/mixed`:

```
Content-Type: multipart/mixed; boundary="outer-boundary"

--outer-boundary
Content-Type: multipart/alternative; boundary="inner-boundary"

--inner-boundary
Content-Type: text/plain; charset=UTF-8

[body]

--inner-boundary--

--outer-boundary
Content-Type: application/pdf; name="proposal.pdf"
Content-Disposition: attachment; filename="proposal.pdf"
Content-Transfer-Encoding: base64

[base64-encoded file content]

--outer-boundary--
```

Planned limits for v2:
- Maximum attachment size: 10MB per file
- Maximum total attachments: 25MB per email (Gmail limit)
- Allowed types: PDF, DOCX, XLSX, PNG, JPG, GIF, CSV, TXT
- Blocked types: EXE, BAT, CMD, SCR, JS, VBS (executable files)

## 6. Character Encoding

### UTF-8 Everywhere

All emails are encoded as UTF-8. No exceptions.

```
Content-Type: text/plain; charset=UTF-8
```

### Encoding Rules

- Body text: UTF-8
- Subject line: UTF-8 with RFC 2047 encoding for non-ASCII characters
- Display names: UTF-8 with RFC 2047 encoding for non-ASCII characters
- Headers: ASCII only (per RFC 2822), with encoded-words for non-ASCII

### Subject Line Encoding (RFC 2047)

If the subject contains non-ASCII characters:

```
Subject: =?UTF-8?B?[base64-encoded-subject]?=
```

Example:
```
// "Reunión de seguimiento" (Spanish)
Subject: =?UTF-8?B?UmV1bmnDs24gZGUgc2VndWltaWVudG8=?=
```

For subjects that mix ASCII and non-ASCII, encode only the non-ASCII portions.

### Display Name Encoding

If the sender or recipient display name contains non-ASCII characters:

```
From: =?UTF-8?B?[base64-encoded-name]?= <email@domain.com>
```

### Emoji in Emails

Emoji are valid UTF-8 characters and are supported in:
- Email body (both plain text and HTML)
- Subject lines (with RFC 2047 encoding)

However, the skill should match the rep's style. If the rep doesn't use emoji, don't add them. If they do, preserve them.

## 7. Link Tracking Considerations

### Default Behavior

Link tracking (rewriting URLs through a tracking domain) is OFF by default for emails sent through this skill.

Rationale:
- Tracked links look like `https://track.domain.com/r/abc123` which triggers spam filters
- Recipients in security-conscious organizations may flag tracked links
- Cold outreach with tracked links has lower deliverability
- The rep is sending from their personal inbox -- tracking links look out of place

### When Tracking Is Acceptable

Link tracking may be enabled per-org by an admin:
- For links to the organization's own content (proposals, documents)
- For links to shared resources (case studies, landing pages)
- Never for cold outreach to new contacts
- Never for links to third-party websites

### Tracking Implementation (If Enabled)

When tracking is enabled:
1. Rewrite URLs through the organization's tracking domain
2. Use HTTPS only (never HTTP tracking links)
3. Use the organization's domain (not a generic tracking domain)
4. Track: click events (timestamp, link clicked)
5. Do NOT track: IP address, device info, location (privacy)
6. Store tracking data in `email_link_clicks` table, associated with the sent message ID

### Link Validation

Regardless of tracking status, validate all links in the email body:

```
1. Parse all URLs from the body (both plain text and HTML)
2. Verify each URL:
   - Has a valid protocol (http:// or https://)
   - Domain resolves (basic DNS check)
   - Is not on a known phishing/malware blocklist
   - Is not a localhost or internal URL
3. Flag invalid links to the rep before approval
```

## 8. Deliverability Checklist

Every email sent through this skill must pass these deliverability checks. Poor deliverability means emails land in spam, which damages the rep's sender reputation permanently.

### SPF (Sender Policy Framework)

- The rep's email domain must have a valid SPF record
- This is NOT something the skill configures -- it's a DNS requirement
- If SPF is not configured, warn the admin (once, not on every send)
- The skill sends through the Gmail/O365 API which handles SPF alignment automatically

### DKIM (DomainKeys Identified Mail)

- Gmail and O365 automatically sign outbound emails with DKIM
- No action required from the skill
- Emails sent through the API inherit the domain's DKIM configuration

### DMARC (Domain-based Message Authentication)

- Like SPF and DKIM, DMARC is a domain-level configuration
- The skill inherits the domain's DMARC policy
- If DMARC is set to `p=reject` and SPF/DKIM fail, emails will bounce
- This is extremely rare when using the official Gmail/O365 API

### From Header Alignment

The From header must exactly match the authenticated sender:

```
CORRECT: From: "Sarah Chen" <sarah@company.com>  (matches OAuth identity)
WRONG:   From: "Sarah Chen" <sales@company.com>   (doesn't match OAuth email)
WRONG:   From: "Company Sales" <sarah@company.com> (misleading display name)
```

The display name should be the rep's actual name as configured in their email account. Do not substitute, abbreviate, or modify it.

### Spam Trigger Avoidance

Content patterns that trigger spam filters -- avoid these:

| Pattern | Risk Level | Alternative |
|---------|-----------|-------------|
| ALL CAPS in subject | HIGH | Use normal capitalization |
| Multiple exclamation marks (!!!) | MEDIUM | Use at most one |
| "Free", "Act now", "Limited time" | MEDIUM | Use specific, honest language |
| Image-only email (no text) | HIGH | Always include text content |
| URL shorteners (bit.ly, tinyurl) | HIGH | Use full URLs |
| Hidden text (white on white) | HIGH | Never hide text |
| Excessive links (10+) | MEDIUM | Keep links minimal and relevant |
| No unsubscribe link (marketing) | HIGH | Not applicable for 1:1 emails |
| Mismatched From/Reply-To | MEDIUM | Keep them aligned |
| Large attachments | MEDIUM | Use cloud links instead (v2) |

### Sending Cadence

For deliverability, respect these cadence guidelines:

- New email accounts: ramp up slowly (10/day week 1, 20/day week 2, etc.)
- Established accounts: up to the configured daily limit
- After a period of inactivity: ease back in (don't go from 0 to 50 in one day)
- After bounces: reduce sending volume temporarily

### Bounce Handling

When an email bounces:

1. **Hard bounce** (mailbox doesn't exist): Mark the contact email as invalid. Do not retry. Increment bounce counter.
2. **Soft bounce** (mailbox full, server temporarily down): Retry once after 1 hour. If still bouncing after 3 attempts, treat as hard bounce.
3. **Bounce rate monitoring**: If the rep's bounce rate exceeds 5% in a day, alert the admin and consider pausing sends.

### Warm-Up Awareness

For reps who newly connected their email:

- Track the connection date
- For the first 7 days: suggest a lower daily limit (10/day)
- For days 8-14: suggest a moderate limit (25/day)
- After 14 days: allow full configured limit
- This is a suggestion to the admin, not an enforced gate (existing senders don't need warm-up)

## 9. Office 365 Specifics

### O365 API Message Format

Unlike Gmail (which takes raw RFC 2822), the O365 API takes a structured JSON payload:

```json
{
  "message": {
    "subject": "Meeting follow-up: pricing discussion",
    "body": {
      "contentType": "Text",
      "content": "Hi John,\n\nGreat speaking with you earlier today..."
    },
    "toRecipients": [
      {
        "emailAddress": {
          "address": "john@prospect.com",
          "name": "John Smith"
        }
      }
    ],
    "ccRecipients": [],
    "bccRecipients": [],
    "internetMessageHeaders": [
      {
        "name": "In-Reply-To",
        "value": "<original-message-id@domain.com>"
      },
      {
        "name": "References",
        "value": "<msg-1@domain.com> <msg-2@domain.com>"
      }
    ]
  },
  "saveToSentItems": true
}
```

### O365 Threading

O365 uses `conversationId` for threading (analogous to Gmail's `threadId`):

```json
{
  "message": {
    "conversationId": "AAQkAGI2...",
    ...
  }
}
```

Additionally set the `internetMessageHeaders` for `In-Reply-To` and `References` to ensure cross-platform threading works (e.g., when an O365 user replies to a Gmail user).

### O365 Content Types

| Value | Usage |
|-------|-------|
| `"Text"` | Plain text email |
| `"HTML"` | HTML formatted email |

Unlike Gmail where you construct the MIME yourself, O365 handles MIME construction. Provide either Text or HTML content -- not both. If you need multipart/alternative, use HTML content and O365 will generate the text version.

### O365 Signature Handling

O365 does not auto-append signatures when sending via API. The skill must:

1. Fetch the rep's signature from O365: `GET /me/mailboxSettings`
2. Append it to the body before sending
3. For HTML emails, include the signature HTML
4. For text emails, include the text version of the signature

### O365 Rate Limits

| Limit | Value |
|-------|-------|
| Per minute | 30 requests |
| Per day (mail send) | 10,000 recipients |

These are API-level limits. The skill's configured daily limit (default 50) is far below these, so API rate limits should rarely be hit.

## 10. Cross-Provider Compatibility

### Gmail to O365 Threading

When a Gmail user replies to an O365 user (or vice versa), threading depends entirely on the RFC headers (In-Reply-To, References). Provider-specific thread IDs (Gmail threadId, O365 conversationId) only work within their own ecosystem.

Rules for cross-provider threading:
1. Always set RFC In-Reply-To and References headers (these are universal)
2. Also set provider-specific thread IDs when available (for same-provider threading)
3. Test that replies appear in the correct thread in both Gmail and Outlook web clients

### Subject Line Normalization

Different providers handle the `Re:` prefix differently:
- Gmail: `Re: Subject`
- Outlook: `RE: Subject`
- Some systems: `Re[2]: Subject` or `Re: Re: Subject`

The skill normalizes to `Re: Subject` (single prefix, title case). This works across all providers.

### Display Name Encoding Differences

- Gmail: Accepts UTF-8 display names in From header
- O365: Accepts UTF-8 display names in the JSON payload
- Both: Properly encode for the wire format

The skill constructs the message using the provider's native format, so encoding differences are handled by the API.

### Date Format

Use RFC 2822 date format in the Date header:

```
Date: Thu, 13 Feb 2026 14:30:00 -0500
```

For O365 API, dates are ISO 8601:

```json
{
  "sentDateTime": "2026-02-13T14:30:00-05:00"
}
```

The skill formats dates according to the provider being used.

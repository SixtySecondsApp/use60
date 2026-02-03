/**
 * AWS SES Email Helper for Edge Functions
 *
 * Uses AWS Signature V4 to send emails via SES API
 * Replaces Resend for transactional emails
 */

const AWS_REGION = Deno.env.get("AWS_REGION") || "eu-west-2";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
const SES_FROM_EMAIL = Deno.env.get("SES_FROM_EMAIL") || "app@sixtyseconds.ai";
const SES_FROM_NAME = Deno.env.get("SES_FROM_NAME") || "60";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Create HMAC-SHA256 signature
 */
async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

/**
 * Create SHA-256 hash
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert ArrayBuffer to hex string
 */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get AWS Signature V4 signing key
 */
async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

/**
 * Sign a request using AWS Signature V4
 */
async function signRequest(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: string,
  region: string,
  service: string
): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  // Add required headers
  headers["x-amz-date"] = amzDate;
  headers["host"] = url.host;

  // Create canonical request
  const sortedHeaders = Object.keys(headers).sort();
  const signedHeaders = sortedHeaders.map((h) => h.toLowerCase()).join(";");
  const canonicalHeaders = sortedHeaders
    .map((h) => `${h.toLowerCase()}:${headers[h].trim()}`)
    .join("\n");

  const payloadHash = await sha256(body);

  const canonicalRequest = [
    method,
    url.pathname,
    url.search.slice(1), // Remove leading '?'
    canonicalHeaders + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  // Create string to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);

  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join("\n");

  // Calculate signature
  const signingKey = await getSigningKey(AWS_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  // Build authorization header
  const authorizationHeader = [
    `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return {
    ...headers,
    Authorization: authorizationHeader,
  };
}

/**
 * Send email via AWS SES
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, html, text, from, fromName, replyTo } = params;

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return { success: false, error: "AWS credentials not configured" };
  }

  const fromAddress = from || SES_FROM_EMAIL;
  const fromDisplayName = fromName || SES_FROM_NAME;
  const formattedFrom = `${fromDisplayName} <${fromAddress}>`;
  const recipients = Array.isArray(to) ? to : [to];

  // Build SES API request body
  const requestParams = new URLSearchParams();
  requestParams.append("Action", "SendEmail");
  requestParams.append("Version", "2010-12-01");
  requestParams.append("Source", formattedFrom);

  recipients.forEach((recipient, index) => {
    requestParams.append(`Destination.ToAddresses.member.${index + 1}`, recipient);
  });

  requestParams.append("Message.Subject.Data", subject);
  requestParams.append("Message.Subject.Charset", "UTF-8");

  if (html) {
    requestParams.append("Message.Body.Html.Data", html);
    requestParams.append("Message.Body.Html.Charset", "UTF-8");
  }

  if (text) {
    requestParams.append("Message.Body.Text.Data", text);
    requestParams.append("Message.Body.Text.Charset", "UTF-8");
  }

  if (replyTo) {
    requestParams.append("ReplyToAddresses.member.1", replyTo);
  }

  const body = requestParams.toString();
  const url = new URL(`https://email.${AWS_REGION}.amazonaws.com/`);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  try {
    const signedHeaders = await signRequest("POST", url, headers, body, AWS_REGION, "ses");

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: signedHeaders,
      body,
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[SES] Error response:", responseText);
      // Parse error from XML response
      const errorMatch = responseText.match(/<Message>([^<]+)<\/Message>/);
      const errorMessage = errorMatch ? errorMatch[1] : `HTTP ${response.status}`;
      return { success: false, error: `SES error: ${errorMessage}` };
    }

    // Parse MessageId from success response
    const messageIdMatch = responseText.match(/<MessageId>([^<]+)<\/MessageId>/);
    const messageId = messageIdMatch ? messageIdMatch[1] : undefined;

    return { success: true, messageId };
  } catch (error) {
    console.error("[SES] Request failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if SES is configured
 */
export function isSESConfigured(): boolean {
  return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
}

/**
 * Get default sender info
 */
export function getDefaultSender(): { email: string; name: string } {
  return {
    email: SES_FROM_EMAIL,
    name: SES_FROM_NAME,
  };
}

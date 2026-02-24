import { SES } from '@aws-sdk/client-ses';

// AWS SES Email Service
class EmailService {
  private sesClient: SES;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.sesClient = new SES({
      region: import.meta.env.VITE_AWS_REGION || 'eu-west-2',
      credentials: {
        accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || '',
        secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || '',
      },
    });
    
    this.fromEmail = 'workflows@sixtyseconds.ai';
    this.fromName = '60';
  }

  /**
   * Send email using AWS SES
   */
  async sendEmail(params: {
    to: string | string[];
    subject: string;
    plainText?: string;
    html?: string;
    replyTo?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { to, subject, plainText, html, replyTo } = params;
      
      // Ensure we have either plain text or HTML content
      if (!plainText && !html) {
        throw new Error('Either plain text or HTML content is required');
      }

      const recipients = Array.isArray(to) ? to : [to];
      
      // Validate email addresses
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of recipients) {
        if (!emailRegex.test(email)) {
          throw new Error(`Invalid email address: ${email}`);
        }
      }

      const sendParams = {
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: {
          ToAddresses: recipients,
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {} as any,
        },
        ...(replyTo && {
          ReplyToAddresses: [replyTo],
        }),
      };

      // Add content based on what's provided
      if (plainText) {
        sendParams.Message.Body.Text = {
          Data: plainText,
          Charset: 'UTF-8',
        };
      }

      if (html) {
        sendParams.Message.Body.Html = {
          Data: html,
          Charset: 'UTF-8',
        };
      }
      const result = await this.sesClient.sendEmail(sendParams);
      return {
        success: true,
        messageId: result.MessageId,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email',
      };
    }
  }

  /**
   * Send a simple text email
   */
  async sendTextEmail(to: string, subject: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendEmail({
      to,
      subject,
      plainText: text,
    });
  }

  /**
   * Send an HTML email with optional plain text fallback
   */
  async sendHtmlEmail(
    to: string, 
    subject: string, 
    html: string, 
    plainText?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendEmail({
      to,
      subject,
      html,
      plainText,
    });
  }

  /**
   * Create a professional HTML email template
   */
  createHtmlTemplate(params: {
    title: string;
    content: string;
    footerText?: string;
  }): string {
    const { title, content, footerText = 'Sent by 60' } = params;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #37bd7e 0%, #2d9a64 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #2d3748;
            font-size: 20px;
            margin-top: 0;
            margin-bottom: 20px;
        }
        .content p {
            margin-bottom: 16px;
            color: #4a5568;
        }
        .footer {
            background-color: #f7fafc;
            padding: 20px 30px;
            text-align: center;
            font-size: 14px;
            color: #718096;
            border-top: 1px solid #e2e8f0;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #37bd7e;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 10px 0;
        }
        .button:hover {
            background-color: #2d9a64;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>60</h1>
        </div>
        <div class="content">
            <h2>${title}</h2>
            ${content}
        </div>
        <div class="footer">
            ${footerText}
        </div>
    </div>
</body>
</html>`;
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;
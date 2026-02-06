-- Add email template for organization approval requests
-- Template sent to admins when a new organization is created that may be a duplicate

INSERT INTO encharge_email_templates (
  template_name,
  template_type,
  subject_line,
  html_body,
  text_body,
  variables,
  is_active,
  created_at,
  updated_at
) VALUES (
  'Organization Approval Request',
  'org_approval',
  'New Organization Requires Approval: {{newOrgName}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Organization Approval Required</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>New Organization Requires Your Approval</h2>

  <p>Hi Admin,</p>

  <p>A new organization has been created that may be a duplicate of an existing one. Your approval is required before the user can proceed.</p>

  <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0;">Organization Details</h3>
    <p style="margin: 8px 0;"><strong>New Organization:</strong> {{newOrgName}}</p>
    <p style="margin: 8px 0;"><strong>Similar to:</strong> {{similarOrgName}}</p>
    <p style="margin: 8px 0;"><strong>Created by:</strong> {{userName}} ({{userEmail}})</p>
  </div>

  <h3>What You Should Do:</h3>
  <ol>
    <li>Review both organization names</li>
    <li>Check if this is a duplicate or legitimate separate organization</li>
    <li>Approve if it''s a valid new organization</li>
    <li>Reject if it''s a duplicate (user should join existing org instead)</li>
  </ol>

  <p style="margin-top: 30px;">
    <a href="{{dashboardUrl}}/settings/organizations?pending=true" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review in Admin Dashboard</a>
  </p>

  <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">This notification was sent because a new organization similar to an existing one was created and requires admin approval before the user can proceed.</p>

  <p>Best regards,<br>The Sixty System</p>
</body>
</html>',
  'NEW ORGANIZATION REQUIRES APPROVAL

Hi Admin,

A new organization has been created that may be a duplicate of an existing one. Your approval is required before the user can proceed.

ORGANIZATION DETAILS:
- New Organization: {{newOrgName}}
- Similar to: {{similarOrgName}}
- Created by: {{userName}} ({{userEmail}})

WHAT YOU SHOULD DO:
1. Review both organization names
2. Check if this is a duplicate or legitimate separate organization
3. Approve if it''s a valid new organization
4. Reject if it''s a duplicate (user should join existing org instead)

Review in Admin Dashboard:
{{dashboardUrl}}/settings/organizations?pending=true

---

This notification was sent because a new organization similar to an existing one was created and requires admin approval before the user can proceed.

Best regards,
The Sixty System',
  '{"newOrgName": "Name of the new organization", "similarOrgName": "Name of the similar existing organization", "userName": "Full name of the user who created it", "userEmail": "Email of the user who created it", "dashboardUrl": "URL to the admin dashboard"}',
  true,
  NOW(),
  NOW()
) ON CONFLICT (template_type) DO UPDATE SET
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  subject_line = EXCLUDED.subject_line,
  variables = EXCLUDED.variables,
  updated_at = NOW();

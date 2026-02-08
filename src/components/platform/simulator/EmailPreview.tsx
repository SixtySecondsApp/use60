/**
 * EmailPreview Component
 * Renders email templates with sample data for preview in the onboarding simulator
 */

import React from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { processTemplate, type EmailTemplate, type TemplateVariables } from '@/lib/services/emailTemplateService';
import { Mail } from 'lucide-react';

interface EmailPreviewProps {
  template: EmailTemplate | null;
  variables: TemplateVariables;
  day: number;
}

export function EmailPreview({ template, variables, day }: EmailPreviewProps) {
  if (!template) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Preview
          </CardTitle>
          <CardDescription>Select a day to preview emails sent during the trial</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <p>No email template available for this day</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const processedSubject = processTemplate(template.subject_line, variables);
  const processedBody = processTemplate(template.email_body, variables);

  return (
    <Card className="h-full flex flex-col min-h-0 w-full max-w-full">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email Preview - Day {day}
        </CardTitle>
        <CardDescription>
          {template.template_name} ({template.template_type})
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto min-h-0">
        <div className="space-y-4">
          {/* Email Subject */}
          <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subject:</p>
            <p className="font-semibold text-gray-900 dark:text-white">{processedSubject}</p>
          </div>

          {/* Email Body - Render HTML */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900 overflow-auto max-h-[600px] w-full overflow-x-hidden">
            <div
              className="email-preview-content text-sm text-gray-900 dark:text-gray-100 w-full max-w-full overflow-x-hidden break-words [&_*]:max-w-full [&_*]:overflow-x-hidden [&_img]:max-w-full [&_img]:h-auto [&_table]:max-w-full [&_table]:table-auto [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:break-words [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:break-words [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:break-words [&_p]:mb-2 [&_p]:break-words [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:break-words [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processedBody) }}
            />
          </div>

          {/* Template Info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p><strong>Template ID:</strong> {template.id}</p>
            <p><strong>Type:</strong> {template.template_type}</p>
            {template.description && <p><strong>Description:</strong> {template.description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


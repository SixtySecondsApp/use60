/**
 * Email Templates Admin Page
 * Manage Encharge email templates programmatically - no Encharge UI needed
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  getAllTemplates,
  getTemplateByType,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendEmailWithTemplate,
  type EnchargeEmailTemplate,
} from '@/lib/services/enchargeTemplateService';
import { Plus, Edit, Trash2, Mail, Eye } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function EmailTemplates() {
  const { user } = useAuth();
  
  // Debug: Log when component mounts
  useEffect(() => {
    console.log('[EmailTemplates] Component mounted, pathname:', window.location.pathname);
  }, []);
  
  const [templates, setTemplates] = useState<EnchargeEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<EnchargeEmailTemplate | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewEmail, setPreviewEmail] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    template_name: '',
    template_type: '',
    subject_line: '',
    html_body: '',
    text_body: '',
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const allTemplates = await getAllTemplates();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const result = await createTemplate(formData);
      if (result.success) {
        setIsCreateDialogOpen(false);
        setFormData({
          template_name: '',
          template_type: '',
          subject_line: '',
          html_body: '',
          text_body: '',
        });
        loadTemplates();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating template:', error);
      alert('Failed to create template');
    }
  };

  const handleEdit = (template: EnchargeEmailTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      template_name: template.template_name,
      template_type: template.template_type,
      subject_line: template.subject_line,
      html_body: template.html_body,
      text_body: template.text_body || '',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedTemplate) return;

    try {
      const result = await updateTemplate(selectedTemplate.id, formData);
      if (result.success) {
        setIsEditDialogOpen(false);
        setSelectedTemplate(null);
        loadTemplates();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating template:', error);
      alert('Failed to update template');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const result = await deleteTemplate(templateId);
      if (result.success) {
        loadTemplates();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const handleSendTest = async (template: EnchargeEmailTemplate) => {
    if (!previewEmail) {
      alert('Please enter an email address');
      return;
    }

    try {
      const result = await sendEmailWithTemplate({
        template_type: template.template_type,
        to_email: previewEmail,
        to_name: 'Test User',
        variables: {
          user_name: 'Test User',
          days_remaining: 3,
          trial_end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        },
      });

      if (result.success) {
        alert('Test email sent successfully!');
        setIsPreviewOpen(false);
        setPreviewEmail('');
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      alert('Failed to send test email');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#37bd7e]"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Email Templates</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage email templates programmatically - no Encharge UI needed
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Email Template</DialogTitle>
              <DialogDescription>
                Create a new email template. Use {'{{variable}}'} syntax for dynamic content.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="template_name">Template Name</Label>
                <Input
                  id="template_name"
                  value={formData.template_name}
                  onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                  placeholder="Welcome to Sixty"
                />
              </div>
              <div>
                <Label htmlFor="template_type">Template Type</Label>
                <Input
                  id="template_type"
                  value={formData.template_type}
                  onChange={(e) => setFormData({ ...formData, template_type: e.target.value })}
                  placeholder="welcome"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Types: welcome, trial_ending, trial_expired, waitlist_invite, etc.
                </p>
              </div>
              <div>
                <Label htmlFor="subject_line">Subject Line</Label>
                <Input
                  id="subject_line"
                  value={formData.subject_line}
                  onChange={(e) => setFormData({ ...formData, subject_line: e.target.value })}
                  placeholder="Welcome to Sixty Seconds! 🎉"
                />
              </div>
              <div>
                <Label htmlFor="html_body">HTML Body</Label>
                <Textarea
                  id="html_body"
                  value={formData.html_body}
                  onChange={(e) => setFormData({ ...formData, html_body: e.target.value })}
                  rows={15}
                  className="font-mono text-sm"
                  placeholder="<html>...</html>"
                />
              </div>
              <div>
                <Label htmlFor="text_body">Plain Text Body (Optional)</Label>
                <Textarea
                  id="text_body"
                  value={formData.text_body}
                  onChange={(e) => setFormData({ ...formData, text_body: e.target.value })}
                  rows={5}
                  placeholder="Plain text version..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create Template</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{template.template_name}</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedTemplate(template);
                      setIsPreviewOpen(true);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>Type: {template.template_type}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Subject: {template.subject_line}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedTemplate(template);
                    setIsPreviewOpen(true);
                  }}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Send Test
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit_template_name">Template Name</Label>
              <Input
                id="edit_template_name"
                value={formData.template_name}
                onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit_subject_line">Subject Line</Label>
              <Input
                id="edit_subject_line"
                value={formData.subject_line}
                onChange={(e) => setFormData({ ...formData, subject_line: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit_html_body">HTML Body</Label>
              <Textarea
                id="edit_html_body"
                value={formData.html_body}
                onChange={(e) => setFormData({ ...formData, html_body: e.target.value })}
                rows={15}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="edit_text_body">Plain Text Body</Label>
              <Textarea
                id="edit_text_body"
                value={formData.text_body}
                onChange={(e) => setFormData({ ...formData, text_body: e.target.value })}
                rows={5}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>Update Template</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview/Test Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:w-[calc(100%-4rem)] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test email for: {selectedTemplate?.template_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="test_email">Test Email Address</Label>
              <Input
                id="test_email"
                type="email"
                value={previewEmail}
                onChange={(e) => setPreviewEmail(e.target.value)}
                placeholder="test@example.com"
              />
            </div>
            {selectedTemplate && (
              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                  <div className="text-sm font-semibold mb-2">Subject:</div>
                  <div className="mb-0">{selectedTemplate.subject_line}</div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="text-sm font-semibold p-3 bg-gray-50 dark:bg-gray-900 border-b">Preview:</div>
                  <div className="max-h-96 overflow-y-auto bg-[#030712] p-6">
                    <div
                      className="text-xs"
                      style={{ minHeight: '300px' }}
                      dangerouslySetInnerHTML={{ __html: selectedTemplate.html_body }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedTemplate && handleSendTest(selectedTemplate)}
              disabled={!previewEmail || !selectedTemplate}
            >
              <Mail className="w-4 h-4 mr-2" />
              Send Test Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

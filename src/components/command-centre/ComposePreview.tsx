import { useState, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type { Task } from '@/lib/database/models';

function getNextBusinessDay(daysAhead: number): Date {
  const date = new Date();
  let added = 0;
  while (added < daysAhead) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}

interface ComposePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onSent: () => void;
}

export function ComposePreview({ open, onOpenChange, task, onSent }: ComposePreviewProps) {
  const deliverable = task?.deliverable_data as Record<string, unknown> | undefined;
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Reset fields when task changes
  useEffect(() => {
    if (task) {
      setTo(task.contact_email || (deliverable?.to as string) || '');
      setCc((deliverable?.cc as string) || '');
      setSubject((deliverable?.subject as string) || '');
      setBody((deliverable?.body as string) || (deliverable?.content as string) || '');
    }
  }, [task, deliverable]);

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('email-send-as-rep', {
        body: {
          to,
          cc: cc || undefined,
          subject,
          body,
          task_id: task?.id,
          contact_id: task?.contact_id,
          deal_id: (task as any)?.deal_id,
        },
      });

      if (error) throw error;

      toast.success('Email sent from your Gmail');

      // Create follow-up task (3 business days later)
      try {
        const followUpDate = getNextBusinessDay(3);

        await supabase
          .from('tasks')
          .insert({
            title: `Follow up: ${subject}`,
            description: `Follow up on email sent to ${to} regarding "${subject}"`,
            task_type: 'follow_up',
            deliverable_type: 'follow_up_email',
            status: 'pending',
            ai_status: 'none',
            priority: 'medium',
            due_date: followUpDate.toISOString(),
            assigned_to: task?.assigned_to,
            created_by: task?.assigned_to,
            contact_id: task?.contact_id,
            contact_email: to,
            contact_name: (task as any)?.contact_name,
            company_id: (task as any)?.company_id,
            deal_id: (task as any)?.deal_id,
            parent_task_id: (task as any)?.parent_task_id || task?.id,
            source: 'auto_generated',
            metadata: {
              original_task_id: task?.id,
              original_subject: subject,
              sent_at: new Date().toISOString(),
            },
          });

        toast.info(`Follow-up task created for ${followUpDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
      } catch (err) {
        console.warn('Failed to create follow-up task:', err);
      }

      // Log activity
      try {
        await supabase
          .from('activities')
          .insert({
            activity_type: 'email_sent',
            subject: `Sent: ${subject}`,
            notes: `Email sent to ${to} via Command Centre`,
            user_id: task?.assigned_to,
            contact_id: task?.contact_id,
            deal_id: (task as any)?.deal_id,
            company_id: (task as any)?.company_id,
          });
      } catch (err) {
        console.warn('Failed to log activity:', err);
      }

      onSent();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Send Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="compose-to">To</Label>
            <Input
              id="compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-cc">CC (optional)</Label>
            <Input
              id="compose-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-body">Body</Label>
            <Textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Send Email</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

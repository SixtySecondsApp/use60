import { useState } from 'react';
import { Hash, Send, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

interface SlackPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  onSent: () => void;
}

const DEFAULT_CHANNELS = [
  { id: 'deals', label: '#deals' },
  { id: 'sales-alerts', label: '#sales-alerts' },
  { id: 'team-updates', label: '#team-updates' },
];

export function SlackPreview({ open, onOpenChange, task, onSent }: SlackPreviewProps) {
  const deliverable = task?.deliverable_data;
  const [channel, setChannel] = useState(deliverable?.channel || 'deals');
  const [message, setMessage] = useState(deliverable?.content || deliverable?.body || '');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Message cannot be empty');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('slack-post', {
        body: {
          channel,
          message,
          task_id: task.id,
        },
      });

      if (error) throw error;

      toast.success(`Posted to #${channel}`);
      onSent();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to post to Slack');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Post to Slack
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_CHANNELS.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <div className="rounded-lg border bg-muted/30 p-3">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[150px] border-0 bg-transparent p-0 focus-visible:ring-0 text-sm"
                placeholder="Slack message content..."
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Post to Slack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

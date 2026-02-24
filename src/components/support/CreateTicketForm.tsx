import { useState } from 'react';
import { Ticket, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateSupportTicket, type TicketCategory, type TicketPriority } from '@/lib/hooks/useSupportTickets';

interface CreateTicketFormProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'billing', label: 'Billing' },
  { value: 'how_to', label: 'How To' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Minor issue, no immediate impact' },
  { value: 'medium', label: 'Medium', description: 'Some impact on workflow' },
  { value: 'high', label: 'High', description: 'Significant impact on work' },
  { value: 'urgent', label: 'Urgent', description: 'Critical — blocking all work' },
];

export function CreateTicketForm({ open, onClose }: CreateTicketFormProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('other');
  const [priority, setPriority] = useState<TicketPriority>('medium');

  const { mutateAsync: createTicket, isPending } = useCreateSupportTicket();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    await createTicket({ subject: subject.trim(), description: description.trim(), category, priority });
    handleClose();
  };

  const handleClose = () => {
    setSubject('');
    setDescription('');
    setCategory('other');
    setPriority('medium');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
              <Ticket className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <DialogTitle>Open a Support Ticket</DialogTitle>
          </div>
          <DialogDescription>
            Describe your issue and our support team will get back to you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Briefly describe the issue"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide as much detail as possible — steps to reproduce, expected vs actual behaviour, etc."
              required
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} textValue={opt.label}>
                      <div className="flex flex-col">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {priority === 'urgent' && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700 dark:text-orange-400">
                Urgent tickets are escalated immediately. For immediate help, please also contact us via Slack.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!subject.trim() || !description.trim() || isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPending ? 'Submitting...' : 'Submit Ticket'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

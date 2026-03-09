/**
 * OnboardingSupportModal
 *
 * Lightweight support ticket modal for onboarding screens.
 * Works without an active org membership — uses the pending org_id directly.
 * Persists across refreshes via the support_tickets table.
 */

import { useState } from 'react';
import { Ticket, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

interface OnboardingSupportModalProps {
  open: boolean;
  onClose: () => void;
  orgId?: string;
  context?: string;
}

export function OnboardingSupportModal({ open, onClose, orgId, context }: OnboardingSupportModalProps) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim() || !user?.id) return;

    setSubmitting(true);
    try {
      const ticketDescription = context
        ? `${description.trim()}\n\n---\nContext: ${context}\nUser: ${user.email}`
        : `${description.trim()}\n\n---\nUser: ${user.email}`;

      if (!orgId) {
        // No org context — fall back to mailto
        const mailtoBody = encodeURIComponent(`${ticketDescription}\n\nSubject: ${subject.trim()}`);
        window.open(`mailto:support@use60.com?subject=${encodeURIComponent(subject.trim())}&body=${mailtoBody}`, '_blank');
        setSubmitted(true);
        toast.success('Opening your email client to send the ticket.');
        setTimeout(handleClose, 1500);
        return;
      }

      const { error } = await supabase
        .from('support_tickets')
        .insert({
          org_id: orgId,
          user_id: user.id,
          subject: subject.trim(),
          description: ticketDescription,
          category: 'other' as const,
          priority: 'medium' as const,
          status: 'open' as const,
        });

      if (error) throw error;

      setSubmitted(true);
      toast.success('Support ticket submitted. We\'ll get back to you soon.');
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error('[OnboardingSupportModal] Error creating ticket:', error);
      toast.error('Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubject('');
    setDescription('');
    setSubmitted(false);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
            <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Contact Support</h2>
              <p className="text-sm text-gray-400">We&apos;ll respond within 24 hours</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
                <p className="text-white font-medium">Ticket Submitted</p>
                <p className="text-sm text-gray-400 text-center">
                  We&apos;ve received your request and will get back to you at{' '}
                  <span className="text-white">{user?.email}</span>
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="support-subject" className="text-sm font-medium text-gray-300">
                    Subject
                  </label>
                  <input
                    id="support-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What do you need help with?"
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="support-description" className="text-sm font-medium text-gray-300">
                    Description
                  </label>
                  <textarea
                    id="support-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please describe your issue in detail..."
                    required
                    rows={4}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!subject.trim() || !description.trim() || submitting}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Ticket'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

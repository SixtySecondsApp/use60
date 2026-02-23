/**
 * EmailActionCenter
 *
 * Unified email action center for reviewing, editing, and sending AI-generated email drafts.
 * Supports both HITL approval records and notification-based email actions.
 */

import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail,
  Send,
  X,
  CheckCircle2,
  Edit,
  Clock,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ChevronRight,
  FlaskConical,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  useEmailActions,
  useEmailAction,
  useApproveEmailAction,
  useRejectEmailAction,
} from '@/lib/hooks/useEmailActions';
import { formatDistanceToNow } from 'date-fns';

// Helper to extract domain from email
function extractDomain(email: string): string | null {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || domain.includes('gmail') || domain.includes('yahoo') || domain.includes('hotmail') || domain.includes('outlook')) {
    return null; // Skip common personal email domains
  }
  return domain;
}

// Helper to get company logo URL using logo.dev
function getCompanyLogoUrl(email: string): string | null {
  const domain = extractDomain(email);
  if (!domain) return null;
  // Using logo.dev API for company logos
  return `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ`;
}

// Company Logo component with fallback
function CompanyLogo({ 
  email, 
  recipientName,
  size = 'md' 
}: { 
  email: string; 
  recipientName?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imageError, setImageError] = useState(false);
  const logoUrl = getCompanyLogoUrl(email);
  const domain = extractDomain(email);
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  if (!logoUrl || imageError) {
    // Fallback to initials or icon
    const initials = recipientName
      ? recipientName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : domain?.slice(0, 2).toUpperCase() || 'EM';
    
    return (
      <div className={cn(
        sizeClasses[size],
        'rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 border border-primary/10'
      )}>
        <span className="text-xs font-semibold text-primary">{initials}</span>
      </div>
    );
  }

  return (
    <div className={cn(
      sizeClasses[size],
      'rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center flex-shrink-0 border border-gray-200 dark:border-gray-700 overflow-hidden p-1.5'
    )}>
      <img
        src={logoUrl}
        alt={domain || 'Company'}
        className="w-full h-full object-contain"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

export default function EmailActionCenter() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { data: actions, isLoading } = useEmailActions();
  const { data: selectedAction } = useEmailAction(id);
  const approveMutation = useApproveEmailAction();
  const rejectMutation = useRejectEmailAction();

  const [editedContent, setEditedContent] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Filter actions by status, excluding dismissed ones
  const pendingActions = useMemo(
    () => actions?.filter(a => a.status === 'pending' && !dismissedIds.has(a.id)) || [],
    [actions, dismissedIds]
  );
  const completedActions = useMemo(
    () => actions?.filter(a => a.status !== 'pending' || dismissedIds.has(a.id)) || [],
    [actions, dismissedIds]
  );

  // Initialize edited content when action is selected
  useEffect(() => {
    if (selectedAction && !isEditing) {
      setEditedContent({
        to: selectedAction.emailContent.to,
        subject: selectedAction.emailContent.subject,
        body: selectedAction.emailContent.body,
      });
    }
  }, [selectedAction?.id]);

  const handleSelectAction = (actionId: string) => {
    navigate(`/email-actions/${actionId}`);
    setIsEditing(false);
    setEditedContent(null);
  };

  const handleBack = () => {
    navigate('/email-actions');
    setIsEditing(false);
    setEditedContent(null);
  };

  const handleApprove = async () => {
    if (!selectedAction) return;

    const content = isEditing && editedContent ? editedContent : undefined;
    
    // Immediately add to dismissed set for instant UI feedback
    setDismissedIds(prev => new Set(prev).add(selectedAction.id));
    navigate('/email-actions');
    setIsEditing(false);
    setEditedContent(null);
    
    // Then persist to database
    try {
      await approveMutation.mutateAsync({ emailAction: selectedAction, editedContent: content });
    } catch (error) {
      // Rollback on error
      setDismissedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedAction.id);
        return newSet;
      });
    }
  };

  const handleReject = async () => {
    if (!selectedAction) return;
    
    // Immediately add to dismissed set for instant UI feedback
    setDismissedIds(prev => new Set(prev).add(selectedAction.id));
    navigate('/email-actions');
    
    // Then persist to database
    try {
      await rejectMutation.mutateAsync(selectedAction);
    } catch (error) {
      // Rollback on error
      setDismissedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedAction.id);
        return newSet;
      });
    }
  };

  const handleEdit = () => {
    if (!selectedAction) return;
    setIsEditing(true);
    setEditedContent({
      to: selectedAction.emailContent.to,
      subject: selectedAction.emailContent.subject,
      body: selectedAction.emailContent.body,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'default', label: 'Pending' },
      approved: { variant: 'secondary', label: 'Sent' },
      sent: { variant: 'secondary', label: 'Sent' },
      rejected: { variant: 'destructive', label: 'Dismissed' },
      expired: { variant: 'outline', label: 'Expired' },
    };

    const config = variants[status] || { variant: 'outline' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const isSimulated = selectedAction?.metadata?.source === 'proactive_simulator';

  // Format body for display (convert markdown bold to HTML, handle newlines)
  const formatEmailBody = (body: string) => {
    if (!body) return '<p class="text-muted-foreground italic">No content</p>';
    
    // Convert **bold** to <strong>
    let formatted = body.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Normalize line breaks and convert to proper spacing
    // Split by double newlines (paragraphs) and single newlines (line breaks)
    formatted = formatted
      .split(/\n\n+/)
      .map(paragraph => {
        const lines = paragraph.split(/\n/).map(line => line.trim()).filter(Boolean);
        return `<p class="mb-4 last:mb-0">${lines.join('<br/>')}</p>`;
      })
      .join('');
    
    return formatted;
  };

  // Detail View (when an action is selected)
  if (id && selectedAction) {
    const recipientDomain = extractDomain(selectedAction.emailContent.to);
    
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Back Button & Header */}
          <div className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to all emails
            </Button>

            <div className="flex items-start gap-4">
              <CompanyLogo 
                email={selectedAction.emailContent.to} 
                recipientName={selectedAction.emailContent.recipientName}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {selectedAction.emailContent.recipientName || selectedAction.emailContent.to}
                  </h1>
                  {isSimulated && (
                    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                      <FlaskConical className="w-3 h-3" />
                      Simulated
                    </Badge>
                  )}
                </div>
                {recipientDomain && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {recipientDomain}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                  {getStatusBadge(selectedAction.status)}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDistanceToNow(new Date(selectedAction.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Email Card */}
          <Card className="mb-6 shadow-sm border-gray-200 dark:border-gray-800">
            <CardHeader className="pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium">
                    {isEditing ? 'Edit Email' : selectedAction.emailContent.subject}
                  </CardTitle>
                  {!isEditing && (
                    <p className="text-sm text-muted-foreground mt-1">
                      To: {selectedAction.emailContent.recipientName} &lt;{selectedAction.emailContent.to}&gt;
                    </p>
                  )}
                </div>
                {!isEditing && selectedAction.status === 'pending' && (
                  <Button variant="outline" size="sm" onClick={handleEdit}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      To
                    </Label>
                    <Input
                      value={editedContent?.to || ''}
                      onChange={(e) => setEditedContent({ ...editedContent!, to: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Subject
                    </Label>
                    <Input
                      value={editedContent?.subject || ''}
                      onChange={(e) => setEditedContent({ ...editedContent!, subject: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Body
                    </Label>
                    <Textarea
                      value={editedContent?.body || ''}
                      onChange={(e) => setEditedContent({ ...editedContent!, body: e.target.value })}
                      className="mt-1.5 min-h-[300px] font-normal leading-relaxed"
                      placeholder="Write your email..."
                    />
                  </div>
                </div>
              ) : (
                <div 
                  className="prose prose-sm max-w-none dark:prose-invert prose-p:my-3 prose-p:leading-relaxed prose-strong:text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: formatEmailBody(selectedAction.emailContent.body),
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          {selectedAction.status === 'pending' && (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                size="lg"
                className="flex-1"
              >
                {approveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {isEditing ? 'Save & Send' : 'Approve & Send'}
                  </>
                )}
              </Button>
              {isEditing && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setIsEditing(false);
                    if (selectedAction) {
                      setEditedContent({
                        to: selectedAction.emailContent.to,
                        subject: selectedAction.emailContent.subject,
                        body: selectedAction.emailContent.body,
                      });
                    }
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Dismiss
                  </>
                )}
              </Button>
            </div>
          )}

          {selectedAction.status !== 'pending' && (
            <Alert>
              <CheckCircle2 className="w-4 h-4" />
              <AlertDescription>
                This email has been {selectedAction.status === 'rejected' ? 'dismissed' : selectedAction.status}.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // List View (default)
  return (
    <div className="h-full">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                <Mail className="w-6 h-6 text-primary" />
                Email Action Center
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Review and send AI-generated email drafts
              </p>
            </div>
            {pendingActions.length > 0 && (
              <Badge variant="default" className="text-sm px-3 py-1.5">
                {pendingActions.length} pending
              </Badge>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="w-4 h-4" />
              Pending ({pendingActions.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Completed ({completedActions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-0">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 dark:border-gray-800 p-4"
                  >
                    <div className="flex items-start gap-4">
                      {/* Company logo placeholder */}
                      <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Recipient name + status */}
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-5 w-36" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        {/* Subject line */}
                        <Skeleton className="h-4 w-3/4" />
                        {/* Domain + timestamp */}
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      {/* Arrow */}
                      <Skeleton className="w-5 h-5 rounded flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingActions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Mail className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No pending emails</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    When AI generates email drafts for you to review, they'll appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingActions.map((action) => {
                  const recipientDomain = extractDomain(action.emailContent.to);
                  
                  return (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card
                        className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
                        onClick={() => handleSelectAction(action.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <CompanyLogo 
                              email={action.emailContent.to} 
                              recipientName={action.emailContent.recipientName}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-medium text-sm">
                                  {action.emailContent.recipientName || action.emailContent.to}
                                </p>
                                {action.metadata?.source === 'proactive_simulator' && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                                    <FlaskConical className="w-2.5 h-2.5" />
                                    Demo
                                  </Badge>
                                )}
                              </div>
                              {recipientDomain && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                                  <Building2 className="w-3 h-3" />
                                  {recipientDomain}
                                </p>
                              )}
                              <p className="text-sm text-foreground truncate mb-1">
                                {action.emailContent.subject}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-2" />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-0">
            {completedActions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No completed emails</h3>
                  <p className="text-sm text-muted-foreground">
                    Emails you've sent or dismissed will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {completedActions.map((action) => {
                  const recipientDomain = extractDomain(action.emailContent.to);
                  
                  return (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card
                        className="cursor-pointer transition-all hover:shadow-md opacity-75 hover:opacity-100"
                        onClick={() => handleSelectAction(action.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <CompanyLogo 
                              email={action.emailContent.to} 
                              recipientName={action.emailContent.recipientName}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-medium text-sm">
                                  {action.emailContent.recipientName || action.emailContent.to}
                                </p>
                                {getStatusBadge(action.status)}
                              </div>
                              {recipientDomain && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {recipientDomain}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-2" />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

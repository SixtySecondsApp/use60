import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Check, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGmailEmails, useGoogleServiceEnabled, useGmailMarkAsRead, useGmailTrash } from '@/lib/hooks/useGoogleIntegration';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/lib/supabase/clientV2';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export function EmailIcon() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const emailRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isGmailEnabled = useGoogleServiceEnabled('gmail');
  const markAsRead = useGmailMarkAsRead();
  const trashEmail = useGmailTrash();
  
  // Fetch contacts to match emails against
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', 'for-email-matching'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, full_name, company_id')
        .eq('owner_id', user.id)  // contacts table uses owner_id, not user_id
        .not('email', 'is', null);
      
      if (error) return [];
      return data || [];
    },
    enabled: isGmailEnabled && isOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Create a set of contact emails for quick lookup
  const contactEmails = useMemo(() => {
    return new Set(contacts.map((c: any) => c.email?.toLowerCase().trim()).filter(Boolean));
  }, [contacts]);
  
  // Fetch recent emails (inbox only, unread first)
  const { data: emailsData, isLoading, error: emailsError } = useGmailEmails('in:inbox', isGmailEnabled && isOpen);
  
  // Debug logging
  useEffect(() => {
    if (isOpen && isGmailEnabled) {
      console.log('[EmailIcon] Gmail enabled:', isGmailEnabled);
      console.log('[EmailIcon] Loading:', isLoading);
      if (emailsError) {
        console.log('[EmailIcon] Error:', emailsError);
      }
      if (emailsData) {
        console.log('[EmailIcon] Data:', emailsData);
      }
    }
  }, [isOpen, isGmailEnabled, isLoading, emailsError, emailsData]);
  
  // Handle different possible data structures
  const rawEmails = emailsData?.emails || emailsData?.messages || [];
  
  // Process emails similar to Email.tsx to get consistent structure
  const emails = useMemo(() => {
    if (!Array.isArray(rawEmails) || rawEmails.length === 0) {
      return [];
    }
    
    return rawEmails.map((msg: any) => {
      // If already processed (has from, fromName, etc.), use as-is
      if (msg.from && msg.fromName) {
        return msg;
      }
      
      // Otherwise, process from Gmail API format
      const headers = msg.payload?.headers || msg.headers || [];
      const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || '';
      
      // Extract sender name and email
      const fromMatch = fromHeader.match(/^(.+?)\s*<(.+)>$/);
      const fromName = fromMatch ? fromMatch[1].replace(/"/g, '') : fromHeader.split('@')[0];
      const fromEmail = fromMatch ? fromMatch[2] : fromHeader;
      
      // Extract date from headers (Gmail API puts it there, not on msg.date)
      const dateHeader = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value;
      const emailDate = dateHeader ? new Date(dateHeader) : (msg.internalDate ? new Date(Number(msg.internalDate)) : null);

      return {
        id: msg.id,
        from: fromEmail,
        fromName,
        subject: headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)',
        preview: msg.snippet || '',
        timestamp: emailDate,
        read: !msg.labelIds?.includes('UNREAD'),
        to: msg.to || []
      };
    });
  }, [rawEmails]);
  
  // Filter emails to only show those linked to CRM contacts
  const crmLinkedEmails = useMemo(() => {
    // If no contacts in CRM, show all emails (user might not have set up contacts yet)
    if (contactEmails.size === 0) {
      return emails;
    }
    
    return emails.filter((email: any) => {
      // Email structure: from is already the email address
      const fromEmail = email.from?.toLowerCase().trim();
      
      // Handle to emails - could be array or string
      const toEmails: string[] = [];
      if (Array.isArray(email.to)) {
        email.to.forEach((e: any) => {
          // Could be string or object with email property
          const emailStr = typeof e === 'string' ? e : e.email || e.address;
          if (emailStr) {
            const match = emailStr.match(/<([^>]+)>/);
            toEmails.push(match ? match[1].toLowerCase().trim() : emailStr.toLowerCase().trim());
          }
        });
      } else if (email.to) {
        const emailStr = typeof email.to === 'string' ? email.to : email.to.email || email.to.address;
        if (emailStr) {
          const match = emailStr.match(/<([^>]+)>/);
          toEmails.push(match ? match[1].toLowerCase().trim() : emailStr.toLowerCase().trim());
        }
      }
      
      // Check if from or to email matches a contact
      if (!fromEmail && toEmails.length === 0) return false;
      
      const matchesFrom = fromEmail && contactEmails.has(fromEmail);
      const matchesTo = toEmails.some((e: string) => contactEmails.has(e));
      
      return matchesFrom || matchesTo;
    });
  }, [emails, contactEmails]);
  
  const unreadEmails = crmLinkedEmails.filter((email: any) => !email.read);
  const unreadCount = unreadEmails.length;
  const recentEmails = crmLinkedEmails.slice(0, 5); // Show top 5

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emailRef.current &&
        panelRef.current &&
        !emailRef.current.contains(event.target as Node) &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  // Calculate panel position when opening
  const handleToggle = () => {
    if (!isOpen && emailRef.current) {
      const rect = emailRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 640;

      if (isMobile) {
        setPanelPosition({ top: 0, left: 0 });
      } else {
        setPanelPosition({
          top: rect.bottom + 8,
          left: Math.max(8, rect.left + rect.width - 384)
        });
      }
    }
    setIsOpen(!isOpen);
  };

  const handleViewFullPage = () => {
    navigate('/email');
    setIsOpen(false);
  };

  const handleMarkAsRead = (e: React.MouseEvent, emailId: string) => {
    e.stopPropagation();
    markAsRead.mutate({ messageId: emailId, read: true }, {
      onError: () => toast.error('Failed to mark email as read'),
    });
  };

  const handleTrash = (e: React.MouseEvent, emailId: string) => {
    e.stopPropagation();
    trashEmail.mutate(emailId, {
      onError: () => toast.error('Failed to delete email'),
    });
  };

  return (
    <>
      {/* Email Icon */}
      <div ref={emailRef} className="relative">
        <button
          onClick={handleToggle}
          className={cn(
            "relative p-2 rounded-lg transition-all duration-200",
            "hover:bg-gray-50 dark:hover:bg-gray-800/30 hover:scale-110",
            isOpen && "bg-gray-100 dark:bg-gray-800/50 scale-110"
          )}
          aria-label="Email"
          aria-expanded={isOpen}
        >
          <Mail className="w-5 h-5 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors" />
          
          {/* Unread Count Badge */}
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -right-1"
              >
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Email Summary Panel - Rendered as Portal */}
      {isOpen && createPortal(
        <AnimatePresence>
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[200] inset-0 sm:inset-auto"
            style={window.innerWidth >= 640 ? {
              top: `${panelPosition.top}px`,
              left: `${panelPosition.left}px`,
            } : {}}
          >
            <div className="
              w-full h-full sm:w-96 sm:h-auto sm:max-h-[600px]
              bg-white dark:bg-gray-900/95 backdrop-blur-sm
              border-0 sm:border border-gray-200 dark:border-gray-700/50
              rounded-none sm:rounded-lg shadow-2xl
              overflow-hidden flex flex-col
            ">
              {/* Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-custom p-4">
                {!isGmailEnabled ? (
                  <div className="text-center py-8">
                    <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Connect Gmail to view your emails
                    </p>
                    <button
                      onClick={handleViewFullPage}
                      className="px-4 py-2 bg-[#37bd7e] text-white rounded-lg hover:bg-[#2da76c] transition-colors text-sm"
                    >
                      Connect Gmail
                    </button>
                  </div>
                ) : isLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#37bd7e] mx-auto"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Loading emails...</p>
                  </div>
                ) : emailsError ? (
                  <div className="text-center py-8">
                    <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Error loading emails</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                      {emailsError.message || 'Failed to fetch emails. Check Gmail connection.'}
                    </p>
                    <button
                      onClick={handleViewFullPage}
                      className="px-4 py-2 bg-[#37bd7e] text-white rounded-lg hover:bg-[#2da76c] transition-colors text-sm"
                    >
                      Go to Email Settings
                    </button>
                  </div>
                ) : recentEmails.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    {contactEmails.size === 0 ? (
                      <>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No emails found</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Add contacts to your CRM to see linked emails</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No emails linked to CRM contacts</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Only emails from/to your CRM contacts are shown</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentEmails.map((email: any) => (
                      <div
                        key={email.id}
                        className={cn(
                          "p-3 rounded-lg border transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 group",
                          !email.read ? "border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10" : "border-gray-200 dark:border-gray-700"
                        )}
                        onClick={() => {
                          navigate('/email');
                          setIsOpen(false);
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                            {email.fromName || email.from || 'Unknown'}
                          </p>
                          {!email.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 line-clamp-1">
                          {email.subject || '(No Subject)'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {email.preview || email.snippet || ''}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          {email.timestamp && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {formatDistanceToNow(new Date(email.timestamp), { addSuffix: true })}
                            </p>
                          )}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                            {!email.read && (
                              <button
                                onClick={(e) => handleMarkAsRead(e, email.id)}
                                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title="Mark as read"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => handleTrash(e, email.id)}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={handleViewFullPage}
                  className="w-full px-4 py-2 bg-[#37bd7e] text-white rounded-lg hover:bg-[#2da76c] transition-colors text-sm font-medium"
                >
                  View Full Email Page
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}


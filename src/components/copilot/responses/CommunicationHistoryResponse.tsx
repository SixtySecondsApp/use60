import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CommunicationHistoryResponse as CommunicationHistoryResponseType } from '../types';
import { 
  Mail, 
  Phone, 
  Calendar, 
  CheckSquare, 
  FileText, 
  Clock, 
  AlertCircle,
  ExternalLink,
  Reply,
  MoreVertical,
  Star,
  Archive,
  Trash2,
  Send,
  ArrowRight,
  Plus
} from 'lucide-react';

interface CommunicationHistoryResponseProps {
  data: CommunicationHistoryResponseType;
  onActionClick?: (action: string, data?: any) => void;
}

export const CommunicationHistoryResponse: React.FC<CommunicationHistoryResponseProps> = ({ data, onActionClick }) => {
  const { contactName, dealName, communications, timeline, overdueFollowUps, nextActions, summary } = data.data;
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [hoveredEmailId, setHoveredEmailId] = useState<string | null>(null);

  const getIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'call': return <Phone className="w-4 h-4" />;
      case 'meeting': return <Calendar className="w-4 h-4" />;
      case 'task': return <CheckSquare className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'email': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'call': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'meeting': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'task': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {(contactName || dealName) && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white">
            {contactName && `Communication with ${contactName}`}
            {dealName && ` - ${dealName}`}
          </h3>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-400 mb-1">Total</div>
          <div className="text-2xl font-bold text-white">{summary.totalCommunications}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-400 mb-1">Emails</div>
          <div className="text-2xl font-bold text-white">{summary.emailsSent}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-400 mb-1">Calls</div>
          <div className="text-2xl font-bold text-white">{summary.callsMade}</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-400 mb-1">Meetings</div>
          <div className="text-2xl font-bold text-white">{summary.meetingsHeld}</div>
        </div>
      </div>

      {/* Overdue Follow-ups */}
      {overdueFollowUps.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Overdue Follow-ups ({overdueFollowUps.length})
          </h3>
          <div className="space-y-3">
            {overdueFollowUps.map((followUp) => (
              <div key={followUp.id} className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded ${getTypeColor(followUp.type)}`}>
                      {getIcon(followUp.type)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{followUp.title}</h4>
                      {followUp.contactName && (
                        <p className="text-sm text-gray-400">Contact: {followUp.contactName}</p>
                      )}
                      {followUp.dealName && (
                        <p className="text-sm text-gray-400">Deal: {followUp.dealName}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-400">{followUp.daysOverdue} days overdue</div>
                    <div className="text-xs text-gray-400">
                      Due: {new Date(followUp.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Actions */}
      {nextActions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-500" />
            Next Actions
          </h3>
          <div className="space-y-3">
            {nextActions.map((action) => (
              <div key={action.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded ${getTypeColor(action.type)}`}>
                      {getIcon(action.type)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{action.title}</h4>
                      {action.contactName && (
                        <p className="text-sm text-gray-400">Contact: {action.contactName}</p>
                      )}
                      {action.dealName && (
                        <p className="text-sm text-gray-400">Deal: {action.dealName}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {action.dueDate && (
                      <div className="text-sm text-gray-400">
                        {new Date(action.dueDate).toLocaleDateString()}
                      </div>
                    )}
                    <div className={`text-xs mt-1 px-2 py-1 rounded ${
                      action.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                      action.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {action.priority}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Communications - Enhanced Email Cards */}
      {communications.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-400" />
            Recent Emails ({communications.length})
          </h3>
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {communications.map((comm, index) => {
                const isExpanded = expandedEmailId === comm.id;
                const isHovered = hoveredEmailId === comm.id;
                
                return (
                  <motion.div
                    key={comm.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                    layout
                    className="group"
                    onMouseEnter={() => setHoveredEmailId(comm.id)}
                    onMouseLeave={() => setHoveredEmailId(null)}
                  >
                    <div
                      className={`
                        bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800/60 dark:to-gray-800/40
                        border border-gray-200 dark:border-gray-700/50 rounded-lg p-4
                        transition-all duration-200 cursor-pointer
                        hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5
                        ${isExpanded ? 'border-blue-500/50 shadow-xl shadow-blue-500/10' : ''}
                      `}
                      onClick={() => setExpandedEmailId(isExpanded ? null : comm.id)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Direction Indicator */}
                        <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                          ${comm.direction === 'sent' 
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                            : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}
                        `}>
                          {comm.direction === 'sent' ? (
                            <Send className="w-5 h-5" />
                          ) : (
                            <Mail className="w-5 h-5" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                                {comm.subject || '(No subject)'}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`
                                  text-xs px-2 py-1 rounded font-medium
                                  ${comm.direction === 'sent' 
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}
                                `}>
                                  {comm.direction === 'sent' ? 'Sent' : 'Received'}
                                </span>
                                {comm.participants && comm.participants.length > 0 && (
                                  <span className="text-xs text-gray-400 truncate">
                                    {comm.participants.slice(0, 2).join(', ')}
                                    {comm.participants.length > 2 && ` +${comm.participants.length - 2}`}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <div className="text-sm text-gray-400 whitespace-nowrap">
                                {new Date(comm.date).toLocaleTimeString([], { 
                                  hour: 'numeric', 
                                  minute: '2-digit',
                                  hour12: true 
                                })}
                              </div>
                              
                              {/* Quick Actions - Show on hover */}
                              <AnimatePresence>
                                {isHovered && !isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="flex items-center gap-1"
                                  >
                                    <button
                                      className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-blue-400 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onActionClick?.('reply', { emailId: comm.id });
                                      }}
                                      title="Reply"
                                    >
                                      <Reply className="w-4 h-4" />
                                    </button>
                                    <button
                                      className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-yellow-400 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onActionClick?.('star', { emailId: comm.id });
                                      }}
                                      title="Star"
                                    >
                                      <Star className="w-4 h-4" />
                                    </button>
                                    <button
                                      className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onActionClick?.('archive', { emailId: comm.id });
                                      }}
                                      title="Archive"
                                    >
                                      <Archive className="w-4 h-4" />
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>

                          {/* Email Preview/Snippet */}
                          {comm.summary && (
                            <motion.p 
                              className="text-sm text-gray-300 mt-2 leading-relaxed"
                              layout
                            >
                              {isExpanded ? comm.summary : comm.summary.substring(0, 150) + (comm.summary.length > 150 ? '...' : '')}
                            </motion.p>
                          )}

                          {/* Expanded Actions */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="mt-4 pt-4 border-t border-gray-700/50"
                              >
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition-colors text-sm font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onActionClick?.('reply', { emailId: comm.id, subject: comm.subject });
                                    }}
                                  >
                                    <Reply className="w-4 h-4" />
                                    Reply
                                  </button>
                                  <button
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700/30 text-gray-300 border border-gray-600/30 hover:bg-gray-700/50 transition-colors text-sm font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onActionClick?.('forward', { emailId: comm.id });
                                    }}
                                  >
                                    <ArrowRight className="w-4 h-4" />
                                    Forward
                                  </button>
                                  <button
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700/30 text-gray-300 border border-gray-600/30 hover:bg-gray-700/50 transition-colors text-sm font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(`https://mail.google.com/mail/u/0/#inbox/${comm.id}`, '_blank');
                                    }}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    Open in Gmail
                                  </button>
                                  <div className="flex-1" />
                                  <button
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20 transition-colors text-sm font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onActionClick?.('star', { emailId: comm.id });
                                    }}
                                  >
                                    <Star className="w-4 h-4" />
                                    Star
                                  </button>
                                  <button
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700/30 text-gray-400 border border-gray-600/30 hover:bg-gray-700/50 hover:text-gray-300 transition-colors text-sm font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onActionClick?.('archive', { emailId: comm.id });
                                    }}
                                  >
                                    <Archive className="w-4 h-4" />
                                    Archive
                                  </button>
                                  <button
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors text-sm font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onActionClick?.('add_to_task', { emailId: comm.id, subject: comm.subject, summary: comm.summary });
                                    }}
                                  >
                                    <Plus className="w-4 h-4" />
                                    Add to Task
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Related Deal Badge */}
                          {comm.relatedDealName && (
                            <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-xs font-medium">
                              <FileText className="w-3 h-3" />
                              {comm.relatedDealName}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Timeline</h3>
          <div className="space-y-3">
            {timeline.map((event) => (
              <div key={event.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-white">{event.title}</h4>
                    {event.description && (
                      <p className="text-sm text-gray-300 mt-1">{event.description}</p>
                    )}
                    {event.relatedTo && (
                      <div className="text-xs text-gray-400 mt-1">Related to: {event.relatedTo}</div>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    {new Date(event.date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, Plus, ChevronDown, ChevronRight, X,
  Users, Building2, Mail, Phone, Calendar, Target,
  TrendingUp, Clock, CheckCircle, FileText, Link2,
  MessageSquare, Zap, Brain, Search, Filter,
  BarChart3, DollarSign, UserPlus, RefreshCw,
  Folder, Settings, Bell, Loader2,
  ArrowRight, ExternalLink, Check, AlertCircle,
  PenTool, ListTodo, Workflow, Database, Bot,
  Lightbulb, Rocket, Star, Gift, BookOpen,
  Mic, Paperclip, Image, AtSign
} from 'lucide-react';

export default function SalesCopilotPage() {
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [showConnectors, setShowConnectors] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [progress, setProgress] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [contextItems, setContextItems] = useState([]);
  const messagesEndRef = useRef(null);

  const connectedIntegrations = [
    { id: 'salesforce', name: 'Salesforce', icon: Database, status: 'connected', color: 'blue' },
    { id: 'hubspot', name: 'HubSpot', icon: Target, status: 'connected', color: 'orange' },
    { id: 'gmail', name: 'Gmail', icon: Mail, status: 'connected', color: 'red' },
    { id: 'calendar', name: 'Calendar', icon: Calendar, status: 'connected', color: 'emerald' },
  ];

  const suggestedActions = [
    { id: 'research', icon: Search, label: 'Research a prospect', desc: 'Deep-dive on any company or contact', gradient: 'from-blue-500 to-cyan-500' },
    { id: 'email', icon: Mail, label: 'Draft an email', desc: 'Personalized outreach with context', gradient: 'from-violet-500 to-purple-500' },
    { id: 'prep', icon: Calendar, label: 'Prep for a meeting', desc: 'Get briefed before your call', gradient: 'from-emerald-500 to-teal-500' },
    { id: 'sequence', icon: Workflow, label: 'Build a sequence', desc: 'Multi-touch campaign creation', gradient: 'from-amber-500 to-orange-500' },
    { id: 'analyze', icon: BarChart3, label: 'Analyze my pipeline', desc: 'Insights on deals and forecasts', gradient: 'from-pink-500 to-rose-500' },
    { id: 'followup', icon: RefreshCw, label: 'Generate follow-ups', desc: 'Based on recent conversations', gradient: 'from-indigo-500 to-blue-500' },
  ];

  const quickPrompts = [
    "What deals need attention today?",
    "Draft a follow-up to my last 3 meetings",
    "Who hasn't responded in 7 days?",
    "Prep me for my next call",
    "Find warm leads in my CRM",
    "Summarize this week's activity",
  ];

  const startWorkspace = (action) => {
    setActiveWorkspace(action);
    setIsProcessing(true);
    setProgress([
      { id: 1, label: 'Connecting to your CRM...', status: 'complete' },
    ]);
    setContextItems([
      { type: 'crm', label: 'Salesforce', count: 'Pipeline data' },
    ]);

    setTimeout(() => {
      setProgress(prev => [...prev, { id: 2, label: 'Pulling recent activities...', status: 'complete' }]);
      setContextItems(prev => [...prev, { type: 'activity', label: 'Email threads', count: '12 recent' }]);
    }, 800);

    setTimeout(() => {
      setProgress(prev => [...prev, { id: 3, label: 'Analyzing patterns...', status: 'active' }]);
      setContextItems(prev => [...prev, { type: 'calendar', label: 'Meetings', count: '5 this week' }]);
    }, 1600);

    setTimeout(() => {
      setProgress(prev => prev.map(p => p.id === 3 ? { ...p, status: 'complete' } : p));
      setProgress(prev => [...prev, { id: 4, label: 'Generating insights...', status: 'active' }]);
    }, 2400);

    setTimeout(() => {
      setProgress(prev => prev.map(p => ({ ...p, status: 'complete' })));
      setIsProcessing(false);
      setArtifacts([
        { id: 1, type: 'insight', title: 'Pipeline Analysis', preview: '3 deals at risk, 2 ready to close' },
        { id: 2, type: 'draft', title: 'Follow-up Emails', preview: '5 personalized drafts ready' },
      ]);
      setConversations([{
        role: 'assistant',
        content: "I've analyzed your pipeline and found some important insights. You have 3 deals that need immediate attention and 2 that are ready to close this week. I've also drafted 5 personalized follow-up emails based on your recent conversations. Want me to walk you through the priority deals first?",
        timestamp: new Date(),
      }]);
    }, 3200);
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;
    
    const newMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    
    setConversations(prev => [...prev, newMessage]);
    setMessage('');
    setIsProcessing(true);

    setTimeout(() => {
      setConversations(prev => [...prev, {
        role: 'assistant',
        content: "I'm looking into that now. Let me pull the relevant data from your CRM and analyze the context...",
        timestamp: new Date(),
      }]);
      setIsProcessing(false);
    }, 1500);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversations]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative z-10">
        {activeWorkspace ? (
          <div className="flex-1 flex">
            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="p-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeWorkspace.gradient} flex items-center justify-center shadow-lg`}>
                    <activeWorkspace.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-semibold">{activeWorkspace.label}</h2>
                    <p className="text-xs text-slate-400">{activeWorkspace.desc}</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-auto p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {conversations.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/25">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <div className={`max-w-xl ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-2xl rounded-br-md px-5 py-3 shadow-lg shadow-violet-500/20'
                          : 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl rounded-bl-md px-5 py-3 text-slate-200'
                      }`}>
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))}
                  
                  {isProcessing && (
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                      <div className="flex items-center gap-3 px-5 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-sm text-slate-400">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input Area */}
              <div className="p-6">
                <div className="max-w-3xl mx-auto">
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 focus-within:border-violet-500/50 transition-all shadow-xl shadow-black/20">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask anything about your sales..."
                      rows={2}
                      className="w-full resize-none bg-transparent outline-none text-white placeholder-slate-500 text-sm"
                    />
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1">
                        <button className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                          <Paperclip className="w-5 h-5" />
                        </button>
                        <button className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                          <Image className="w-5 h-5" />
                        </button>
                        <button className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                          <AtSign className="w-5 h-5" />
                        </button>
                      </div>
                      <button
                        onClick={handleSendMessage}
                        disabled={!message.trim()}
                        className={`px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all ${
                          message.trim()
                            ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
                            : 'bg-white/5 text-slate-600'
                        }`}
                      >
                        <Send className="w-4 h-4" />
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel */}
            <div className="w-80 border-l border-white/5 flex-shrink-0 overflow-auto bg-white/[0.02] backdrop-blur-xl">
              {/* Progress */}
              <div className="p-5 border-b border-white/5">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Progress
                </h3>
                <div className="flex items-center gap-2 mb-4">
                  {[1, 2, 3, 4].map((step) => {
                    const progressItem = progress.find(p => p.id === step);
                    const status = progressItem?.status || 'pending';
                    return (
                      <React.Fragment key={step}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                          status === 'complete' 
                            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                            : status === 'active'
                              ? 'bg-gradient-to-br from-violet-400 to-purple-600 text-white animate-pulse shadow-lg shadow-violet-500/25'
                              : 'bg-white/5 text-slate-600 border border-white/10'
                        }`}>
                          {status === 'complete' ? <Check className="w-3.5 h-3.5" /> : step}
                        </div>
                        {step < 4 && (
                          <div className={`flex-1 h-0.5 rounded-full transition-all ${
                            status === 'complete' 
                              ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' 
                              : 'bg-white/10'
                          }`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {progress.length > 0 ? (
                    progress.map((p) => (
                      <motion.div 
                        key={p.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2"
                      >
                        {p.status === 'active' ? (
                          <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span className={`text-xs ${p.status === 'active' ? 'text-violet-300' : 'text-slate-400'}`}>{p.label}</span>
                      </motion.div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Steps will show as the task unfolds.</p>
                  )}
                </div>
              </div>

              {/* Artifacts */}
              <div className="p-5 border-b border-white/5">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  Artifacts
                </h3>
                {artifacts.length > 0 ? (
                  <div className="space-y-2">
                    {artifacts.map((artifact, i) => (
                      <motion.button
                        key={artifact.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-left transition-all hover:bg-white/10 hover:border-violet-500/30 group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                            <FileText className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-sm font-medium text-white">{artifact.title}</span>
                        </div>
                        <p className="text-xs text-slate-400 pl-8">{artifact.preview}</p>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex gap-1.5 mb-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-5 h-10 rounded-lg bg-gradient-to-b from-white/10 to-white/5" />
                      ))}
                    </div>
                    <p className="text-sm text-slate-500">Outputs will appear here.</p>
                  </div>
                )}
              </div>

              {/* Context */}
              <div className="p-5 border-b border-white/5">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Context
                </h3>
                {contextItems.length > 0 ? (
                  <div className="space-y-2">
                    {contextItems.map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          item.type === 'crm' ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/20' : 
                          item.type === 'activity' ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20' : 
                          'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20'
                        }`}>
                          {item.type === 'crm' ? <Database className="w-4 h-4 text-blue-400" /> :
                           item.type === 'activity' ? <Mail className="w-4 h-4 text-amber-400" /> :
                           <Calendar className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.label}</p>
                          <p className="text-xs text-slate-500">{item.count}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex gap-2 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5" />
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5" />
                    </div>
                    <p className="text-sm text-slate-500">Data sources will appear here.</p>
                  </div>
                )}
              </div>

              {/* Connected Integrations */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-purple-400" />
                    Connected
                  </h3>
                </div>
                <div className="space-y-2">
                  {connectedIntegrations.map((integration) => (
                    <div
                      key={integration.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                        integration.color === 'blue' ? 'bg-blue-500/10 border-blue-500/20' :
                        integration.color === 'orange' ? 'bg-orange-500/10 border-orange-500/20' :
                        integration.color === 'red' ? 'bg-red-500/10 border-red-500/20' : 
                        'bg-emerald-500/10 border-emerald-500/20'
                      }`}>
                        <integration.icon className={`w-4 h-4 ${
                          integration.color === 'blue' ? 'text-blue-400' :
                          integration.color === 'orange' ? 'text-orange-400' :
                          integration.color === 'red' ? 'text-red-400' : 'text-emerald-400'
                        }`} />
                      </div>
                      <span className="text-sm text-slate-300 flex-1">{integration.name}</span>
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                    </div>
                  ))}
                  <button className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all mt-3 border border-dashed border-white/10">
                    <Plus className="w-4 h-4" />
                    Add connector
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Welcome View
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-3xl w-full">
              {/* Headline */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10"
              >
                <h1 className="text-4xl font-bold text-white mb-3 bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent">
                  Let's close more deals today
                </h1>
                <p className="text-slate-400 text-lg">Your AI sales copilot is ready to help</p>
              </motion.div>

              {/* Suggested Actions Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-3 gap-4 mb-8"
              >
                {suggestedActions.map((action, i) => (
                  <motion.button
                    key={action.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    onClick={() => startWorkspace(action)}
                    className="group relative p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 text-left transition-all hover:bg-white/[0.06] hover:border-white/20 hover:scale-[1.02] hover:shadow-2xl hover:shadow-violet-500/10"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                      <action.icon className="w-6 h-6 text-white" />
                    </div>
                    <p className="font-semibold text-white mb-1 group-hover:text-white transition-colors">{action.label}</p>
                    <p className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors">{action.desc}</p>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </motion.button>
                ))}
              </motion.div>

              {/* Input Box */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/20"
              >
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what you want to accomplish..."
                  rows={3}
                  className="w-full resize-none bg-transparent outline-none text-white placeholder-slate-500 text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-1">
                    <button className="p-2.5 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <button className="p-2.5 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                      <Image className="w-5 h-5" />
                    </button>
                    <button className="p-2.5 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                      <AtSign className="w-5 h-5" />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (message.trim()) {
                        startWorkspace({ label: 'Custom Task', desc: message, icon: Sparkles, gradient: 'from-violet-500 to-purple-600' });
                      }
                    }}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold flex items-center gap-2 hover:from-violet-400 hover:to-purple-500 transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-105"
                  >
                    Let's go
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>

              {/* Quick Prompts */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-8"
              >
                <p className="text-xs font-semibold text-slate-500 mb-4 text-center tracking-wider">TRY ASKING</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {quickPrompts.map((prompt, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.05 }}
                      onClick={() => setMessage(prompt)}
                      className="px-4 py-2 rounded-full text-sm bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                      {prompt}
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Connected Status */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-10 flex justify-center"
              >
                <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                  <div className="flex -space-x-2">
                    {connectedIntegrations.slice(0, 4).map((integration) => (
                      <div
                        key={integration.id}
                        className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-slate-900 ${
                          integration.color === 'blue' ? 'bg-blue-500' :
                          integration.color === 'orange' ? 'bg-orange-500' :
                          integration.color === 'red' ? 'bg-red-500' : 'bg-emerald-500'
                        }`}
                      >
                        <integration.icon className="w-3 h-3 text-white" />
                      </div>
                    ))}
                  </div>
                  <span className="text-sm text-slate-400">4 integrations connected</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
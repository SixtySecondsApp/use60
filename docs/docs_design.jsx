import React, { useState, useEffect } from 'react';
import { Search, Plus, Sparkles, Send, Check, X, ChevronDown, ChevronRight, Filter, Download, Trash2, RefreshCw, MoreHorizontal, Building2, Mail, Linkedin, Phone, Globe, TrendingUp, AlertCircle, Clock, CheckCircle2, Loader2, ArrowRight, MessageSquare, Table2, Zap, Target, Users, ExternalLink } from 'lucide-react';

const DynamicTablesUI = () => {
  const [activeView, setActiveView] = useState('table');
  const [selectedRows, setSelectedRows] = useState([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  const [showPushModal, setShowPushModal] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'user', content: 'Find me 50 VP Sales at Series B SaaS companies in the US with 50-200 employees' },
    { role: 'assistant', content: "I'll search Apollo for that. Building your table now...", status: 'complete' },
    { role: 'assistant', content: 'Found 47 matching leads. I\'ve created a table with columns: Name, Title, Company, Company Size, Funding Stage, Email, LinkedIn URL. Want me to enrich these further?', status: 'complete', hasTable: true },
  ]);
  const [inputValue, setInputValue] = useState('');

  const leads = [
    { id: 1, name: 'Sarah Chen', title: 'VP of Sales', company: 'Acme SaaS', companySize: '120', funding: 'Series B', email: 'sarah@acmesaas.com', linkedin: 'linkedin.com/in/sarahchen', phone: '+1 415-555-0123', enrichment: { activity: 'Posted about AI in sales automation 2 days ago', icpScore: 9, confidence: 95 }, status: 'enriched' },
    { id: 2, name: 'Michael Torres', title: 'CRO', company: 'DataFlow Inc', companySize: '85', funding: 'Series B', email: 'mtorres@dataflow.io', linkedin: 'linkedin.com/in/mtorres', phone: '+1 628-555-0456', enrichment: { activity: 'Recently promoted from VP Sales (3 weeks ago)', icpScore: 8, confidence: 88 }, status: 'enriched' },
    { id: 3, name: 'Emily Watson', title: 'VP Sales', company: 'CloudMetrics', companySize: '156', funding: 'Series B', email: 'emily.w@cloudmetrics.com', linkedin: 'linkedin.com/in/emilywatson', phone: '+1 510-555-0789', enrichment: { activity: 'Shared article on revenue operations best practices', icpScore: 9, confidence: 92 }, status: 'enriched' },
    { id: 4, name: 'James Liu', title: 'VP of Sales', company: 'TechStack Pro', companySize: '98', funding: 'Series B', email: 'jliu@techstackpro.com', linkedin: 'linkedin.com/in/jamesliu', phone: '', enrichment: { activity: 'Hiring 3 SDRs - likely scaling outbound', icpScore: 10, confidence: 97 }, status: 'enriched' },
    { id: 5, name: 'Amanda Foster', title: 'CRO', company: 'RevenueAI', companySize: '142', funding: 'Series B', email: 'amanda@revenueai.co', linkedin: 'linkedin.com/in/amandafoster', phone: '+1 415-555-0321', enrichment: null, status: 'pending' },
    { id: 6, name: 'David Park', title: 'VP Sales', company: 'ScaleUp HQ', companySize: '67', funding: 'Series B', email: '', linkedin: 'linkedin.com/in/davidpark', phone: '+1 650-555-0654', enrichment: null, status: 'no_email' },
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'enriched':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-full text-xs font-medium"><CheckCircle2 className="w-3 h-3" />Enriched</span>;
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20 rounded-full text-xs font-medium"><Clock className="w-3 h-3" />Pending</span>;
      case 'no_email':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-full text-xs font-medium"><AlertCircle className="w-3 h-3" />No Email</span>;
      default:
        return null;
    }
  };

  const getScoreColor = (score) => {
    if (score >= 9) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10';
    if (score >= 7) return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10';
    if (score >= 5) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10';
    return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/10';
  };

  const toggleRowSelection = (id) => {
    setSelectedRows(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const selectAllRows = () => {
    if (selectedRows.length === leads.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(leads.map(l => l.id));
    }
  };

  const handleEnrich = () => {
    setIsEnriching(true);
    setEnrichmentProgress(0);
    const interval = setInterval(() => {
      setEnrichmentProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsEnriching(false);
          return 100;
        }
        return prev + 2;
      });
    }, 50);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">60</span>
              </div>
              <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">use60</span>
              <span className="text-gray-400 dark:text-gray-500 mx-2">/</span>
              <span className="text-gray-700 dark:text-gray-300 font-medium">Dynamic Tables</span>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition-colors">
                <Download className="w-4 h-4" />
              </button>
              <button className="px-4 py-2 text-sm font-semibold bg-blue-600 dark:bg-blue-500/10 text-white dark:text-blue-400 border border-blue-600 dark:border-blue-500/20 hover:bg-blue-700 dark:hover:bg-blue-500/20 rounded-lg transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Table
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">47</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Leads</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">41</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Enriched</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">31</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">ICP Score 7+</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">44</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Verified Emails</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chat Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden h-full flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Copilot</h3>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-xl px-4 py-3 ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 dark:bg-blue-500 text-white' 
                        : 'bg-gray-100 dark:bg-gray-800/50 text-gray-900 dark:text-gray-100'
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      {msg.hasTable && (
                        <div className="mt-3 p-2 bg-white/10 dark:bg-gray-900/30 rounded-lg flex items-center gap-2">
                          <Table2 className="w-4 h-4" />
                          <span className="text-xs font-medium">VP Sales - Series B SaaS</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {isEnriching && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] bg-gray-100 dark:bg-gray-800/50 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                        <span className="text-sm text-gray-900 dark:text-gray-100">Enriching leads...</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                          style={{ width: `${enrichmentProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{Math.round(enrichmentProgress / 100 * 47)} of 47 leads processed</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <div className="relative">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask the copilot..."
                    className="w-full px-4 py-3 pr-12 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors">
                    <ArrowRight className="w-4 h-4 text-white" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50 rounded-lg transition-colors">
                    Add enrichment column
                  </button>
                  <button className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50 rounded-lg transition-colors">
                    Filter by ICP score
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Table Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Table2 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">VP Sales - Series B SaaS</h3>
                    </div>
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">47 leads</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition-colors flex items-center gap-2 border border-gray-200 dark:border-gray-700/50">
                      <Filter className="w-4 h-4" />
                      Filter
                    </button>
                    <button 
                      onClick={handleEnrich}
                      disabled={isEnriching}
                      className="px-3 py-2 text-sm font-semibold bg-violet-600 dark:bg-violet-500/10 text-white dark:text-violet-400 border border-violet-600 dark:border-violet-500/20 hover:bg-violet-700 dark:hover:bg-violet-500/20 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      Enrich
                    </button>
                  </div>
                </div>

                {selectedRows.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{selectedRows.length} leads selected</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowPushModal(true)}
                        className="px-3 py-1.5 text-sm font-semibold bg-emerald-600 dark:bg-emerald-500/10 text-white dark:text-emerald-400 border border-emerald-600 dark:border-emerald-500/20 hover:bg-emerald-700 dark:hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Push to Instantly
                      </button>
                      <button className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2">
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedRows.length === leads.length}
                          onChange={selectAllRows}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Lead</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Company</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-violet-500" />
                          LinkedIn Activity
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-violet-500" />
                          ICP Score
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {leads.map((lead) => (
                      <tr 
                        key={lead.id} 
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                          selectedRows.includes(lead.id) ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(lead.id)}
                            onChange={() => toggleRowSelection(lead.id)}
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{lead.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{lead.title}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{lead.company}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{lead.companySize} employees • {lead.funding}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`} className="w-7 h-7 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg flex items-center justify-center transition-colors group">
                                <Mail className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                              </a>
                            ) : (
                              <div className="w-7 h-7 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-center justify-center">
                                <Mail className="w-3.5 h-3.5 text-red-400" />
                              </div>
                            )}
                            <a href={`https://${lead.linkedin}`} target="_blank" rel="noopener noreferrer" className="w-7 h-7 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg flex items-center justify-center transition-colors group">
                              <Linkedin className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                            </a>
                            {lead.phone && (
                              <a href={`tel:${lead.phone}`} className="w-7 h-7 bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg flex items-center justify-center transition-colors group">
                                <Phone className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          {lead.enrichment ? (
                            <div className="flex items-start gap-2">
                              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{lead.enrichment.activity}</p>
                              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{lead.enrichment.confidence}%</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500 italic">Pending enrichment...</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {lead.enrichment ? (
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${getScoreColor(lead.enrichment.icpScore)}`}>
                              {lead.enrichment.icpScore}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(lead.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Column Button */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <button className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-500/30 rounded-xl text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">Add AI Enrichment Column</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Push to Instantly Modal */}
      {showPushModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-gray-900/40 dark:bg-black/80 backdrop-blur-sm" onClick={() => setShowPushModal(false)} />
          <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Push to Instantly</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedRows.length} leads selected</p>
                </div>
              </div>
              <button onClick={() => setShowPushModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Select Campaign</label>
                <select className="w-full px-4 py-2.5 bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option>Q1 Outbound - VP Sales</option>
                  <option>Series B SaaS Campaign</option>
                  <option>Create new campaign...</option>
                </select>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg space-y-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Variable Mapping</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800/50 rounded-lg">
                    <span className="text-gray-500 dark:text-gray-400">{'{{first_name}}'}</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">Name</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800/50 rounded-lg">
                    <span className="text-gray-500 dark:text-gray-400">{'{{company}}'}</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">Company</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-800/50 rounded-lg col-span-2">
                    <span className="text-gray-500 dark:text-gray-400">{'{{personalized_line}}'}</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">LinkedIn Activity</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Ready to send</p>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400/80 mt-1">{selectedRows.length} leads with verified emails will be added to the campaign with personalized first lines from enrichment data.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowPushModal(false)} className="px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition-colors border border-gray-200 dark:border-gray-700/50">
                Cancel
              </button>
              <button className="px-4 py-2.5 text-sm font-semibold bg-emerald-600 dark:bg-emerald-500/10 text-white dark:text-emerald-400 border border-emerald-600 dark:border-emerald-500/20 hover:bg-emerald-700 dark:hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-2">
                <Send className="w-4 h-4" />
                Push {selectedRows.length} Leads
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DynamicTablesUI;
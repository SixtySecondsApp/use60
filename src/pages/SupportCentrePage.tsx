import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageSquare, Ticket, ChevronRight, Zap, BookOpen, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SupportAIChat } from '@/components/support/SupportAIChat';
import { TicketList } from '@/components/support/TicketList';
import { CreateTicketForm } from '@/components/support/CreateTicketForm';

const SUGGESTED_QUESTIONS = [
  'How do I connect my calendar?',
  'How do I set up the AI Notetaker?',
  'Can I export my meeting transcripts?',
  'How do I invite team members?',
  'What integrations are supported?',
  'How does the AI copilot work?',
];

export default function SupportCentrePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'ask-ai' | 'my-tickets'>('ask-ai');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiChatQuery, setAiChatQuery] = useState('');
  const [showCreateTicket, setShowCreateTicket] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setAiChatQuery(searchQuery);
    setActiveTab('ask-ai');
  };

  const handleSuggestedQuestion = (question: string) => {
    setAiChatQuery(question);
    setActiveTab('ask-ai');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Search Hero */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-blue-900 dark:via-blue-800 dark:to-indigo-900 px-6 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-2">How can we help?</h2>
          <p className="text-blue-200 mb-6 text-sm">
            Search our docs or ask the AI assistant anything about 60
          </p>

          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or ask a question..."
              className="pl-12 pr-28 h-12 text-base bg-white dark:bg-gray-900 border-0 shadow-xl rounded-xl focus-visible:ring-2 focus-visible:ring-white/50"
            />
            <Button
              type="submit"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Ask AI
            </Button>
          </form>

          {/* Suggested questions */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                onClick={() => handleSuggestedQuestion(question)}
                className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="max-w-4xl mx-auto px-6 -mt-6 mb-6 relative z-10">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => handleSuggestedQuestion('How do I get started with 60?')}>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
              <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Getting Started</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Onboarding guides</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 mt-0.5 shrink-0" />
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => navigate('/docs')}>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10">
              <BookOpen className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Documentation</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Full feature docs</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 mt-0.5 shrink-0" />
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => setShowCreateTicket(true)}>
            <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-500/10">
              <HelpCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Contact Support</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Open a ticket</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 mt-0.5 shrink-0" />
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-1 rounded-xl shadow-sm">
              <TabsTrigger value="ask-ai" className="flex items-center gap-2 rounded-lg">
                <MessageSquare className="w-4 h-4" />
                Ask AI
              </TabsTrigger>
              <TabsTrigger value="my-tickets" className="flex items-center gap-2 rounded-lg">
                <Ticket className="w-4 h-4" />
                My Tickets
              </TabsTrigger>
            </TabsList>

            <Button
              onClick={() => setShowCreateTicket(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Ticket className="w-4 h-4 mr-2" />
              New Ticket
            </Button>
          </div>

          <TabsContent value="ask-ai" className="mt-0">
            <SupportAIChat
              initialQuery={aiChatQuery}
              onEscalate={() => setShowCreateTicket(true)}
            />
          </TabsContent>

          <TabsContent value="my-tickets" className="mt-0">
            <TicketList onCreateTicket={() => setShowCreateTicket(true)} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Ticket Dialog */}
      <CreateTicketForm
        open={showCreateTicket}
        onClose={() => setShowCreateTicket(false)}
      />
    </div>
  );
}

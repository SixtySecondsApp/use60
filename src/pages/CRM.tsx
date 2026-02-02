import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CompaniesTable from '@/pages/companies/CompaniesTable';
import ContactsTable from '@/pages/contacts/ContactsTable';
import { PipelinePage } from '@/pages/PipelinePage';
import MeetingsPage from '@/pages/MeetingsPage';
import { 
  Building2, 
  Users, 
  Heart, 
  Video 
} from 'lucide-react';

export default function CRM() {
  const [activeTab, setActiveTab] = useState('companies');

  // Handle URL tab parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['companies', 'contacts', 'deals', 'meetings'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);
  
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gradient-to-br dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-[#1E293B] dark:text-gray-100 overflow-x-hidden">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 max-w-full">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#1E293B] dark:text-white">Customer Relationship Management</h1>
              <p className="text-xs sm:text-sm text-[#64748B] dark:text-gray-400 mt-1">
                Manage your companies, contacts, deals, and meetings
              </p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(tab) => {
            setActiveTab(tab);
            // Update URL without page refresh
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tab);
            window.history.replaceState({}, '', url.toString());
          }} className="space-y-6">
            <TabsList className="bg-[#E2E8F0] dark:bg-gray-900/50 backdrop-blur-xl border border-[#E2E8F0] dark:border-gray-800/50">
              <TabsTrigger 
                value="companies" 
                className="flex items-center gap-2 data-[state=active]:bg-[#37bd7e]/10 data-[state=active]:text-white"
              >
                <Building2 className="w-4 h-4" />
                Companies
              </TabsTrigger>
              <TabsTrigger 
                value="contacts" 
                className="flex items-center gap-2 data-[state=active]:bg-[#37bd7e]/10 data-[state=active]:text-white"
              >
                <Users className="w-4 h-4" />
                Contacts
              </TabsTrigger>
              <TabsTrigger 
                value="deals" 
                className="flex items-center gap-2 data-[state=active]:bg-[#37bd7e]/10 data-[state=active]:text-white"
              >
                <Heart className="w-4 h-4" />
                Deals
              </TabsTrigger>
              <TabsTrigger 
                value="meetings" 
                className="flex items-center gap-2 data-[state=active]:bg-[#37bd7e]/10 data-[state=active]:text-white"
              >
                <Video className="w-4 h-4" />
                Meetings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="companies" className="space-y-0">
              <CompaniesTable />
            </TabsContent>

            <TabsContent value="contacts" className="space-y-0">
              <ContactsTable />
            </TabsContent>

            <TabsContent value="deals" className="space-y-0">
              <PipelinePage />
            </TabsContent>

            <TabsContent value="meetings" className="space-y-0">
              <MeetingsPage />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

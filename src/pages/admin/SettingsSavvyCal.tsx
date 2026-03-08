import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Edit, Save, XCircle, Upload, Search, Copy, Zap, ExternalLink, ChevronDown, ChevronUp, Loader2, ShieldCheck, Play, TestTube2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useSavvyCalIntegration } from '@/lib/hooks/useSavvyCalIntegration';
import logger from '@/lib/utils/logger';

type BookingSource = {
  id: string;
  name: string;
  api_name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  sort_order: number;
};

type SourceMapping = {
  id: string;
  link_id: string;
  source: string;
  source_id: string | null;
  meeting_link: string | null;
  private_link: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type EditingMapping = {
  id: string | null;
  link_id: string;
  source: string;
  source_id: string | null;
  meeting_link: string;
  private_link: string;
  notes: string;
  isCustomSource: boolean;
};

export default function SettingsSavvyCal() {
  const { userData: user } = useUser();
  const { activeOrgId } = useOrg();
  const [mappings, setMappings] = useState<SourceMapping[]>([]);
  const [bookingSources, setBookingSources] = useState<BookingSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingMapping, setEditingMapping] = useState<EditingMapping>({
    id: null,
    link_id: '',
    source: '',
    source_id: null,
    meeting_link: '',
    private_link: '',
    notes: '',
    isCustomSource: false,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingLink, setIsFetchingLink] = useState(false);
  const [lastFetchedLinkId, setLastFetchedLinkId] = useState<string | null>(null);
  const [showWebhookGuide, setShowWebhookGuide] = useState(true);

  // Use org-specific SavvyCal integration
  const {
    webhookUrl,
    webhookVerified,
    hasApiToken,
    checking: webhookChecking,
    checkWebhook,
    canManage,
  } = useSavvyCalIntegration();

  const copyWebhookUrl = async () => {
    if (!webhookUrl) {
      toast.error('Webhook URL not available. Please configure SavvyCal on the Integrations page first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success('Webhook URL copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  const handleCheckWebhook = async () => {
    try {
      await checkWebhook();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to verify webhook');
    }
  };

  useEffect(() => {
    fetchBookingSources();
    fetchMappings();
  }, [user]);

  const suggestSourceFromLinkName = (name: string | null): BookingSource | null => {
    if (!name) return null;
    
    const lowerName = name.toLowerCase();
    
    // Try to match against booking sources
    for (const source of bookingSources) {
      const sourceNameLower = source.name.toLowerCase();
      const sourceApiName = source.api_name?.toLowerCase() || '';
      
      // Match against api_name first (more reliable)
      if (sourceApiName && lowerName.includes(sourceApiName)) {
        return source;
      }
      
      // Direct match against display name
      if (lowerName.includes(sourceNameLower) || sourceNameLower.includes(lowerName)) {
        return source;
      }
      
      // Keyword matching with api_name
      if (sourceApiName.includes('facebook') && (lowerName.includes('fb') || lowerName.includes('facebook'))) {
        return source;
      }
      if (sourceApiName.includes('linkedin') && lowerName.includes('linkedin')) {
        return source;
      }
      if (sourceApiName.includes('google') && lowerName.includes('google')) {
        return source;
      }
      if (sourceApiName.includes('website') && (lowerName.includes('website') || lowerName.includes('homepage'))) {
        return source;
      }
      if (sourceApiName.includes('email') && lowerName.includes('email')) {
        return source;
      }
      if (sourceApiName.includes('referral') && lowerName.includes('referral')) {
        return source;
      }
      if (sourceApiName.includes('client_call') && (lowerName.includes('client') || lowerName.includes('call'))) {
        return source;
      }
      if (sourceApiName.includes('personal_link') && (lowerName.includes('personal') || lowerName.includes('link'))) {
        return source;
      }
      
      // Fallback: keyword matching with display name
      if (sourceNameLower.includes('facebook') && (lowerName.includes('fb') || lowerName.includes('facebook'))) {
        return source;
      }
      if (sourceNameLower.includes('linkedin') && lowerName.includes('linkedin')) {
        return source;
      }
      if (sourceNameLower.includes('google') && lowerName.includes('google')) {
        return source;
      }
      if (sourceNameLower.includes('website') && (lowerName.includes('website') || lowerName.includes('homepage'))) {
        return source;
      }
      if (sourceNameLower.includes('email') && lowerName.includes('email')) {
        return source;
      }
      if (sourceNameLower.includes('referral') && lowerName.includes('referral')) {
        return source;
      }
    }
    
    return null;
  };

  // Auto-fetch function (called automatically when new link_id is detected)
  const handleAutoFetchLinkDetails = async (linkId: string) => {
    if (!linkId.trim()) return;

    setIsFetchingLink(true);
    setLastFetchedLinkId(linkId);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-router', {
        body: { action: 'savvycal_link', link_id: linkId.trim() },
      });

      if (error) throw error;

      if (data.success && data.link) {
        const link = data.link;
        
        // Use private_name for source matching (it often contains source info)
        const sourceText = link.private_name || link.name || link.slug;
        
        // Suggest source based on private_name first, then name, then slug
        const suggestedSource = suggestSourceFromLinkName(sourceText);
        
        // Format meeting link (slug with leading slash)
        const meetingLink = link.slug ? `/${link.slug}` : '';
        
        // Update notes with link information
        const notes = [
          `Link: ${link.name || link.slug}`,
          link.private_name ? `Private Link: ${link.private_name}` : null,
          link.description ? `Description: ${link.description}` : null,
          `URL: ${link.url || `https://savvycal.com/${link.slug}`}`,
        ].filter(Boolean).join('\n');

        // If we found a matching source, set it
        if (suggestedSource) {
          setEditingMapping(prev => ({
            ...prev,
            link_id: linkId,
            source: suggestedSource.name,
            source_id: suggestedSource.id,
            meeting_link: meetingLink,
            private_link: link.private_name || '',
            isCustomSource: false,
            notes: notes,
          }));
          toast.success(`Auto-fetched link details. Mapped to source: ${suggestedSource.name}`);
        } else {
          // Use private_name or link name as custom source
          setEditingMapping(prev => ({
            ...prev,
            link_id: linkId,
            source: link.private_name || link.name || link.slug,
            source_id: null,
            meeting_link: meetingLink,
            private_link: link.private_name || '',
            isCustomSource: true,
            notes: notes,
          }));
          toast.success('Auto-fetched link details. Please select or enter a source.');
        }
      } else if (data.deleted) {
        // Handle deleted link (404) - mark as deleted
        const deletedNote = 'deleted Link';
        const notes = [
          `Link ID: ${linkId}`,
          deletedNote,
        ].join('\n');
        
        setEditingMapping(prev => ({
          ...prev,
          link_id: linkId,
          notes: notes,
        }));
        toast.warning('Link not found in SavvyCal (may have been deleted). Marked as deleted.');
      } else {
        throw new Error(data.error || 'Failed to fetch link details');
      }
    } catch (error: any) {
      logger.error('Error auto-fetching link details:', error);
      // Don't show error toast for auto-fetch, just log it
      // User can manually click "Fetch from API" if needed
    } finally {
      setIsFetchingLink(false);
    }
  };

  // Auto-fetch link details when a new link_id is entered (for new mappings only)
  useEffect(() => {
    const linkId = editingMapping.link_id.trim();
    
    // Only auto-fetch if:
    // 1. It's a new mapping (id is null)
    // 2. Link ID is not empty
    // 3. We haven't already fetched this link_id
    // 4. We're not currently fetching
    // 5. Booking sources are loaded
    if (
      !editingMapping.id &&
      linkId &&
      linkId !== lastFetchedLinkId &&
      !isFetchingLink &&
      bookingSources.length > 0 &&
      isEditing
    ) {
      // Debounce: wait 1 second after user stops typing
      const timeoutId = setTimeout(() => {
        handleAutoFetchLinkDetails(linkId);
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMapping.link_id, editingMapping.id, isEditing, bookingSources.length, lastFetchedLinkId, isFetchingLink]);

  const fetchBookingSources = async () => {
    try {
      setIsLoadingSources(true);
      const { data, error } = await supabase
        .from('booking_sources')
        .select('id, name, api_name, description, category, icon, color, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setBookingSources(data || []);
    } catch (error) {
      logger.error('Error fetching booking sources:', error);
      toast.error('Failed to load booking sources');
    } finally {
      setIsLoadingSources(false);
    }
  };

  const fetchMappings = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from('savvycal_source_mappings')
        .select('*');
      
      // Filter by org_id if available, otherwise show mappings with null org_id or created by user
      if (activeOrgId) {
        query = query.eq('org_id', activeOrgId);
      } else if (user?.id) {
        // If no org_id, show mappings where org_id is null or created by current user
        query = query.or(`org_id.is.null,created_by.eq.${user.id}`);
      } else {
        // No user, show only null org_id mappings
        query = query.is('org_id', null);
      }
      
      const { data, error } = await query
        .order('source', { ascending: true })
        .order('link_id', { ascending: true });

      if (error) throw error;
      setMappings(data || []);
    } catch (error) {
      logger.error('Error fetching source mappings:', error);
      toast.error('Failed to load source mappings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (mapping: SourceMapping) => {
    // Check if source matches a predefined booking source
    const matchedSource = bookingSources.find(bs => bs.name === mapping.source);
    setEditingMapping({
      id: mapping.id,
      link_id: mapping.link_id,
      source: mapping.source,
      source_id: mapping.source_id || matchedSource?.id || null,
      meeting_link: mapping.meeting_link || '',
      private_link: mapping.private_link || '',
      notes: mapping.notes || '',
      isCustomSource: !matchedSource,
    });
    setIsEditing(true);
  };

  const handleAddNew = () => {
    setEditingMapping({
      id: null,
      link_id: '',
      source: '',
      source_id: null,
      meeting_link: '',
      private_link: '',
      notes: '',
      isCustomSource: false,
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingMapping({
      id: null,
      link_id: '',
      source: '',
      source_id: null,
      meeting_link: '',
      private_link: '',
      notes: '',
      isCustomSource: false,
    });
  };

  const handleSave = async () => {
    if (!user?.id) {
      toast.error('User information not available');
      return;
    }

    if (!editingMapping.link_id.trim() || !editingMapping.source.trim()) {
      toast.error('Link ID and Source are required');
      return;
    }

    try {
      // Get source name from source_id if using predefined source
      let sourceName = editingMapping.source;
      if (editingMapping.source_id && !editingMapping.isCustomSource) {
        const selectedSource = bookingSources.find(bs => bs.id === editingMapping.source_id);
        if (selectedSource) {
          sourceName = selectedSource.name;
        }
      }

      if (editingMapping.id) {
        // Update existing
        let updateQuery = supabase
          .from('savvycal_source_mappings')
          .update({
            link_id: editingMapping.link_id.trim(),
            source: sourceName.trim(),
            source_id: editingMapping.isCustomSource ? null : editingMapping.source_id,
            meeting_link: editingMapping.meeting_link.trim() || null,
            private_link: editingMapping.private_link.trim() || null,
            notes: editingMapping.notes.trim() || null,
          })
          .eq('id', editingMapping.id);
        
        if (activeOrgId) {
          updateQuery = updateQuery.eq('org_id', activeOrgId);
        }
        
        const { error } = await updateQuery;

        if (error) throw error;
        toast.success('Source mapping updated');
      } else {
        // Create new
        const { error } = await supabase
          .from('savvycal_source_mappings')
          .insert({
            link_id: editingMapping.link_id.trim(),
            source: sourceName.trim(),
            source_id: editingMapping.isCustomSource ? null : editingMapping.source_id,
            meeting_link: editingMapping.meeting_link.trim() || null,
            private_link: editingMapping.private_link.trim() || null,
            notes: editingMapping.notes.trim() || null,
            created_by: user.id,
            org_id: activeOrgId || null,
          });

        if (error) {
          if (error.code === '23505') {
            toast.error('A mapping for this link ID already exists');
          } else {
            throw error;
          }
          return;
        }
        toast.success('Source mapping created');
      }

      setIsEditing(false);
      setEditingMapping({
        id: null,
        link_id: '',
        source: '',
        source_id: null,
        meeting_link: '',
        private_link: '',
        notes: '',
        isCustomSource: false,
      });
      fetchMappings();
    } catch (error: any) {
      logger.error('Error saving source mapping:', error);
      toast.error(error.message || 'Failed to save source mapping');
    }
  };


  // Manual fetch function (called when user clicks "Fetch from API" button)
  const handleFetchLinkDetails = async () => {
    if (!editingMapping.link_id.trim()) {
      toast.error('Please enter a link ID first');
      return;
    }

    setIsFetchingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-router', {
        body: { action: 'savvycal_link', link_id: editingMapping.link_id.trim() },
      });

      if (error) throw error;

      if (data.success && data.link) {
        const link = data.link;
        
        // Use private_name for source matching (it often contains source info)
        const sourceText = link.private_name || link.name || link.slug;
        
        // Suggest source based on private_name first, then name, then slug
        const suggestedSource = suggestSourceFromLinkName(sourceText);
        
        // Format meeting link (slug with leading slash)
        const meetingLink = link.slug ? `/${link.slug}` : '';
        
        // Update notes with link information
        const notes = [
          `Link: ${link.name || link.slug}`,
          link.private_name ? `Private Link: ${link.private_name}` : null,
          link.description ? `Description: ${link.description}` : null,
          `URL: ${link.url || `https://savvycal.com/${link.slug}`}`,
        ].filter(Boolean).join('\n');

        // If we found a matching source, set it
        if (suggestedSource) {
          setEditingMapping({
            ...editingMapping,
            source: suggestedSource.name,
            source_id: suggestedSource.id,
            meeting_link: meetingLink,
            private_link: link.private_name || '',
            isCustomSource: false,
            notes: notes,
          });
          toast.success(`Fetched link details. Suggested source: ${suggestedSource.name}`);
        } else {
          // Use private_name or link name as custom source
          setEditingMapping({
            ...editingMapping,
            source: link.private_name || link.name || link.slug,
            source_id: null,
            meeting_link: meetingLink,
            private_link: link.private_name || '',
            isCustomSource: true,
            notes: notes,
          });
          toast.success('Fetched link details. Please select or enter a source.');
        }
      } else if (data.deleted) {
        // Handle deleted link (404)
        const existingNotes = editingMapping.notes || '';
        const deletedNote = 'deleted Link';
        const updatedNotes = existingNotes 
          ? `${existingNotes}\n${deletedNote}`
          : deletedNote;
        
        setEditingMapping({
          ...editingMapping,
          notes: updatedNotes,
        });
        toast.warning('Link not found in SavvyCal (may have been deleted). Added "deleted Link" to notes.');
      } else {
        throw new Error(data.error || 'Failed to fetch link details');
      }
    } catch (error: any) {
      logger.error('Error fetching link details:', error);
      toast.error(error.message || 'Failed to fetch link details from SavvyCal API');
    } finally {
      setIsFetchingLink(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this source mapping?')) {
      return;
    }

    try {
      let deleteQuery = supabase
        .from('savvycal_source_mappings')
        .delete()
        .eq('id', id);
      
      if (activeOrgId) {
        deleteQuery = deleteQuery.eq('org_id', activeOrgId);
      }
      
      const { error } = await deleteQuery;

      if (error) throw error;
      toast.success('Source mapping deleted');
      fetchMappings();
    } catch (error) {
      logger.error('Error deleting source mapping:', error);
      toast.error('Failed to delete source mapping');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setIsUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('CSV file must have at least a header and one data row');
        return;
      }

      // Parse CSV header
      const headers = lines[0].split(',').map(h => h.trim());
      const linkIdIndex = headers.findIndex(h => h.toLowerCase() === 'link_id');
      
      if (linkIdIndex === -1) {
        toast.error('CSV file must contain a "link_id" column');
        return;
      }

      // Extract unique link IDs
      const linkIds = new Set<string>();
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const linkId = values[linkIdIndex];
        if (linkId && linkId !== '') {
          linkIds.add(linkId);
        }
      }

      // Create mappings for each link ID (with source as "Unknown" initially)
      if (!user?.id) {
        toast.error('User information not available');
        return;
      }

      // Find "Unknown" source ID if it exists
      const unknownSource = bookingSources.find(bs => bs.name === 'Unknown');
      
      // Fetch meeting links for all link IDs in parallel
      toast.info(`Fetching meeting links for ${linkIds.size} link(s)...`);
      const linkDetailsMap = new Map<string, { meeting_link: string | null; private_link: string | null; notes: string }>();
      
      // Fetch details for each link ID
      const fetchPromises = Array.from(linkIds).map(async (linkId) => {
        try {
          const { data, error } = await supabase.functions.invoke('fetch-router', {
            body: { action: 'savvycal_link', link_id: linkId },
          });
          
          if (!error && data.success && data.link) {
            const meetingLink = data.link.slug ? `/${data.link.slug}` : null;
            const privateLink = data.link.private_name || null;
            const notes = [
              'Auto-imported from CSV',
              `Link: ${data.link.name || data.link.slug}`,
              data.link.private_name ? `Private Link: ${data.link.private_name}` : null,
              data.link.description ? `Description: ${data.link.description}` : null,
            ].filter(Boolean).join('\n');
            linkDetailsMap.set(linkId, { meeting_link: meetingLink, private_link: privateLink, notes });
          } else if (data?.deleted) {
            linkDetailsMap.set(linkId, { meeting_link: null, private_link: null, notes: 'Auto-imported from CSV\ndeleted Link' });
          } else {
            linkDetailsMap.set(linkId, { meeting_link: null, private_link: null, notes: 'Auto-imported from CSV' });
          }
        } catch (error) {
          logger.error(`Error fetching link ${linkId}:`, error);
          linkDetailsMap.set(linkId, { meeting_link: null, private_link: null, notes: 'Auto-imported from CSV' });
        }
      });
      
      await Promise.all(fetchPromises);
      
      const mappingsToInsert = Array.from(linkIds).map(linkId => {
        const details = linkDetailsMap.get(linkId) || { meeting_link: null, private_link: null, notes: 'Auto-imported from CSV' };
        
        // Try to suggest source from private_link
        const suggestedSource = details.private_link ? suggestSourceFromLinkName(details.private_link) : null;
        
        return {
          link_id: linkId,
          source: suggestedSource?.name || 'Unknown',
          source_id: suggestedSource?.id || unknownSource?.id || null,
          meeting_link: details.meeting_link,
          private_link: details.private_link,
          notes: details.notes,
          created_by: user.id,
          org_id: activeOrgId || null,
        };
      });

      // Use upsert to avoid duplicates
      const { error } = await supabase
        .from('savvycal_source_mappings')
        .upsert(mappingsToInsert, {
          onConflict: 'link_id,org_id',
          ignoreDuplicates: false,
        });

      if (error) throw error;

      const fetchedCount = Array.from(linkDetailsMap.values()).filter(d => d.meeting_link).length;
      const deletedCount = Array.from(linkDetailsMap.values()).filter(d => d.notes.includes('deleted Link')).length;
      
      let message = `Imported ${linkIds.size} link ID(s) from CSV.`;
      if (fetchedCount > 0) {
        message += ` ${fetchedCount} meeting link(s) automatically fetched.`;
      }
      if (deletedCount > 0) {
        message += ` ${deletedCount} deleted link(s) marked.`;
      }
      message += ' Please update the source for each mapping.';
      
      toast.success(message);
      fetchMappings();
    } catch (error: any) {
      logger.error('Error uploading CSV:', error);
      toast.error(error.message || 'Failed to process CSV file');
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#37bd7e]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Webhook Setup Card */}
        <Card className="border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-600 p-2 rounded-lg">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Enable Instant Lead Sync</CardTitle>
                    <CardDescription>
                      Add this webhook to SavvyCal so new bookings appear instantly in your CRM
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowWebhookGuide(!showWebhookGuide)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showWebhookGuide ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Add this webhook URL to your SavvyCal account so new bookings, cancellations, and reschedules appear <strong>instantly</strong> — no waiting for manual imports!
              </p>

              {/* Webhook URL with Copy Button */}
              {webhookUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white dark:bg-slate-800 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                      {webhookUrl}
                    </div>
                    <Button
                      onClick={copyWebhookUrl}
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-2 border-purple-400 dark:border-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                  {webhookVerified && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Webhook verified in SavvyCal</span>
                    </div>
                  )}
                  {hasApiToken && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckWebhook}
                      disabled={webhookChecking || !canManage}
                      className="mt-2"
                    >
                      {webhookChecking ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 mr-2" />
                      )}
                      Verify Webhook is Installed
                    </Button>
                  )}
                </div>
              ) : (
                <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700">
                  <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
                    <strong>Webhook URL not available.</strong> Please configure your SavvyCal API token on the{' '}
                    <a href="/integrations" className="underline hover:text-amber-900 dark:hover:text-amber-100">
                      Integrations page
                    </a>{' '}
                    to get your organization's unique webhook URL.
                  </AlertDescription>
                </Alert>
              )}

              {showWebhookGuide && (
                <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-700 space-y-3">
                  <h5 className="font-medium text-sm text-gray-900 dark:text-white">How to set up in SavvyCal:</h5>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li>
                      Go to{' '}
                      <a
                        href="https://savvycal.com/integrations"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-700 dark:text-purple-400 hover:underline inline-flex items-center gap-1"
                      >
                        SavvyCal Integrations page
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>In the <strong>Webhooks</strong> section, click the <strong>+</strong> button to add a webhook</li>
                    <li>Paste the URL above into the endpoint URL field</li>
                    <li>Select all event types you want to receive (recommended: <strong>All Events</strong>)</li>
                    <li>Save your webhook configuration</li>
                  </ol>

                  <Alert className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700">
                    <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                      <strong>Why add the webhook?</strong> Without it, you need to manually import bookings.
                      With the webhook, SavvyCal notifies us the moment someone books, cancels, or reschedules —
                      so your leads appear in seconds with automatic source tracking!
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>

        {/* Integration Tests Card */}
        <Card className="border-2 border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-cyan-600 p-2 rounded-lg">
                  <TestTube2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Integration Tests</CardTitle>
                  <CardDescription>
                    Run diagnostic tests to verify your SavvyCal integration is working correctly
                  </CardDescription>
                </div>
              </div>
              <Link to="/platform/integrations/savvycal/tests">
                <Button className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white">
                  <Play className="h-4 w-4" />
                  Run Tests
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Tests include: API connectivity, webhook configuration, webhook signing secret, lead data integrity, and more.</p>
            </div>
          </CardContent>
        </Card>

        {/* Source Mappings Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>SavvyCal Source Mappings</CardTitle>
                <CardDescription>
                  Map SavvyCal booking link IDs to lead sources for conversion tracking
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <label htmlFor="csv-upload">
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    disabled={isUploading}
                    asChild
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      Import from CSV
                    </span>
                  </Button>
                </label>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
                <Button onClick={handleAddNew} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Mapping
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isEditing && (
              <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link ID</label>
                    <div className="flex gap-2">
                      <Input
                        value={editingMapping.link_id}
                        onChange={(e) =>
                          setEditingMapping({ ...editingMapping, link_id: e.target.value })
                        }
                        placeholder="link_01G546GHBJD033660AV798D5FY"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleFetchLinkDetails}
                        disabled={!editingMapping.link_id.trim() || isFetchingLink}
                        className="whitespace-nowrap"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        {isFetchingLink ? 'Fetching...' : 'Fetch from API'}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
                    <div className="space-y-2">
                      <Select
                        value={editingMapping.isCustomSource ? 'custom' : editingMapping.source_id || ''}
                        onValueChange={(value) => {
                          if (value === 'custom') {
                            setEditingMapping({
                              ...editingMapping,
                              isCustomSource: true,
                              source_id: null,
                              source: '',
                            });
                          } else {
                            const selectedSource = bookingSources.find(bs => bs.id === value);
                            setEditingMapping({
                              ...editingMapping,
                              isCustomSource: false,
                              source_id: value,
                              source: selectedSource?.name || '',
                            });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a source or enter custom" />
                        </SelectTrigger>
                        <SelectContent>
                          {bookingSources.map((source) => (
                            <SelectItem key={source.id} value={source.id}>
                              <span className="flex items-center gap-2">
                                {source.icon && <span>{source.icon}</span>}
                                <span>{source.name}</span>
                                {source.description && (
                                  <span className="text-xs text-gray-500 ml-2">
                                    {source.description}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">+ Custom Source</SelectItem>
                        </SelectContent>
                      </Select>
                      {editingMapping.isCustomSource && (
                        <Input
                          value={editingMapping.source}
                          onChange={(e) =>
                            setEditingMapping({ ...editingMapping, source: e.target.value })
                          }
                          placeholder="Enter custom source name"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Link</label>
                    <Input
                      value={editingMapping.meeting_link}
                      onChange={(e) =>
                        setEditingMapping({ ...editingMapping, meeting_link: e.target.value })
                      }
                      placeholder="/bookdemo, /demo, /chatwithus"
                      className="font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The SavvyCal meeting link slug (e.g., /bookdemo)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Private Link</label>
                    <Input
                      value={editingMapping.private_link}
                      onChange={(e) =>
                        setEditingMapping({ ...editingMapping, private_link: e.target.value })
                      }
                      placeholder="Private link name (often contains source info)"
                      className="font-medium"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Private link name from SavvyCal (used for source matching)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (Optional)</label>
                    <Textarea
                      value={editingMapping.notes}
                      onChange={(e) =>
                        setEditingMapping({ ...editingMapping, notes: e.target.value })
                      }
                      placeholder="Additional notes about this source"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} size="sm">
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    <Button onClick={handleCancel} variant="outline" size="sm">
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {mappings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No source mappings found. Click "Add Mapping" to create one.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Link ID</TableHead>
                      <TableHead>Meeting Link</TableHead>
                      <TableHead>Private Link</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell className="font-mono text-sm">{mapping.link_id}</TableCell>
                        <TableCell className="font-mono text-sm text-blue-600">
                          {mapping.meeting_link || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-purple-600 font-medium">
                          {mapping.private_link || '-'}
                        </TableCell>
                        <TableCell className="font-medium">{mapping.source}</TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {mapping.notes || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(mapping.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(mapping)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(mapping.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


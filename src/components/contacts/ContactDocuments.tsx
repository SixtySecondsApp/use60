import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Plus, 
  ExternalLink, 
  Share2, 
  Calendar,
  User,
  Search,
  Filter,
  RefreshCw,
  Download,
  Eye,
  MoreVertical,
  Copy,
  Loader2,
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { formatDistanceToNow, format } from 'date-fns';

interface ContactDocument {
  id: string;
  contact_id: string;
  google_doc_id: string;
  title: string;
  document_type: 'document' | 'spreadsheet' | 'presentation' | 'form' | 'drawing';
  web_view_link: string;
  web_edit_link?: string;
  created_at: string;
  updated_at: string;
  last_modified_time?: string;
  shared: boolean;
  owner_email?: string;
}

interface ContactDocumentsProps {
  contactId: string;
  contactName?: string;
  className?: string;
}

interface DocumentFilters {
  type: 'all' | 'document' | 'spreadsheet' | 'presentation' | 'form' | 'drawing';
  search: string;
  shared: 'all' | 'shared' | 'private';
}

interface CreateDocumentData {
  title: string;
  type: 'document' | 'spreadsheet' | 'presentation';
}

const ContactDocuments: React.FC<ContactDocumentsProps> = ({
  contactId,
  contactName,
  className = ""
}) => {
  const [documents, setDocuments] = useState<ContactDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDocument, setNewDocument] = useState<CreateDocumentData>({
    title: '',
    type: 'document'
  });
  const [filters, setFilters] = useState<DocumentFilters>({
    type: 'all',
    search: '',
    shared: 'all'
  });

  const loadDocuments = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Cast to any - contact_documents table not yet in database types
      const { data, error } = await (supabase as any)
        .from('contact_documents')
        .select('*')
        .eq('contact_id', contactId)
        .order('updated_at', { ascending: false }) as { data: ContactDocument[] | null; error: any };

      if (error) {
        toast.error('Failed to load documents');
        return;
      }

      setDocuments(data || []);
    } catch (error) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (contactId) {
      loadDocuments();
    }
  }, [contactId]);

  const filterDocuments = (docs: ContactDocument[]): ContactDocument[] => {
    return docs.filter(doc => {
      // Type filter
      if (filters.type !== 'all' && doc.document_type !== filters.type) {
        return false;
      }

      // Search filter
      if (filters.search.trim()) {
        const searchLower = filters.search.toLowerCase();
        return doc.title.toLowerCase().includes(searchLower);
      }

      // Shared filter
      if (filters.shared === 'shared' && !doc.shared) return false;
      if (filters.shared === 'private' && doc.shared) return false;

      return true;
    });
  };

  const filteredDocuments = filterDocuments(documents);

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'document':
        return <FileText className="h-4 w-4 text-blue-400" />;
      case 'spreadsheet':
        return <FileText className="h-4 w-4 text-green-400" />;
      case 'presentation':
        return <FileText className="h-4 w-4 text-orange-400" />;
      case 'form':
        return <FileText className="h-4 w-4 text-purple-400" />;
      case 'drawing':
        return <FileText className="h-4 w-4 text-pink-400" />;
      default:
        return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    switch (type) {
      case 'document': return 'Doc';
      case 'spreadsheet': return 'Sheet';
      case 'presentation': return 'Slides';
      case 'form': return 'Form';
      case 'drawing': return 'Drawing';
      default: return type;
    }
  };

  const getDocumentTypeColor = (type: string) => {
    switch (type) {
      case 'document': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'spreadsheet': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'presentation': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'form': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'drawing': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const formatDocumentDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return formatDistanceToNow(date, { addSuffix: true });
    } else {
      return format(date, 'MMM d, yyyy');
    }
  };

  const handleCreateDocument = async () => {
    if (!newDocument.title.trim()) {
      toast.error('Document title is required');
      return;
    }

    setCreating(true);

    try {
      // Call the Google Docs Edge Function to create a new document
      const { data, error } = await supabase.functions.invoke('google-services-router', {
        body: {
          action: 'docs',
          handlerAction: 'create',
          title: newDocument.title.trim(),
          type: newDocument.type,
          contactId: contactId
        }
      });

      if (error) {
        toast.error('Failed to create document');
        return;
      }

      toast.success(`${getDocumentTypeLabel(newDocument.type)} created successfully!`);
      
      // Reset form and close dialog
      setNewDocument({ title: '', type: 'document' });
      setShowCreateDialog(false);
      
      // Refresh documents list
      loadDocuments(true);
      
      // Open the new document
      if (data?.webEditLink) {
        window.open(data.webEditLink, '_blank');
      }
    } catch (error) {
      toast.error('Failed to create document');
    } finally {
      setCreating(false);
    }
  };

  const handleViewDocument = (doc: ContactDocument) => {
    window.open(doc.web_view_link, '_blank');
  };

  const handleEditDocument = (doc: ContactDocument) => {
    if (doc.web_edit_link) {
      window.open(doc.web_edit_link, '_blank');
    } else {
      window.open(doc.web_view_link, '_blank');
    }
  };

  const handleCopyLink = (doc: ContactDocument) => {
    navigator.clipboard.writeText(doc.web_view_link);
    toast.success('Document link copied to clipboard');
  };

  const handleShareDocument = async (doc: ContactDocument) => {
    try {
      // Call the Google Docs Edge Function to share the document
      const { data, error } = await supabase.functions.invoke('google-services-router', {
        body: {
          action: 'docs',
          handlerAction: 'share',
          documentId: doc.google_doc_id,
          contactId: contactId
        }
      });

      if (error) {
        toast.error('Failed to share document');
        return;
      }

      toast.success('Document sharing updated');
      loadDocuments(true);
    } catch (error) {
      toast.error('Failed to share document');
    }
  };

  if (loading) {
    return (
      <Card className={`bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 ${className}`}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Documents</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full bg-slate-200 dark:bg-slate-800" />
                <Skeleton className="h-3 w-3/4 bg-slate-200 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className={`bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50 ${className}`}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-500/20 dark:bg-green-500/20 rounded-lg border border-green-500/30">
                <FolderOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Documents</h3>
                {contactName && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {documents.length} document{documents.length !== 1 ? 's' : ''} for {contactName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadDocuments(true)}
                    disabled={refreshing}
                    className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh documents</p>
                </TooltipContent>
              </Tooltip>

              <Button
                onClick={() => setShowCreateDialog(true)}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white border-green-600 dark:border-green-600"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-slate-400" />
                <Input
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Search documents..."
                  className="pl-10 bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-700/50 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-green-500/50 dark:focus:border-green-500/50"
                />
              </div>
            </div>

            <Select
              value={filters.type}
              onValueChange={(value: any) => setFilters(prev => ({ ...prev, type: value }))}
            >
              <SelectTrigger className="w-[140px] bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-700/50 text-slate-900 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="spreadsheet">Sheets</SelectItem>
                <SelectItem value="presentation">Slides</SelectItem>
                <SelectItem value="form">Forms</SelectItem>
                <SelectItem value="drawing">Drawings</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.shared}
              onValueChange={(value: any) => setFilters(prev => ({ ...prev, shared: value }))}
            >
              <SelectTrigger className="w-[120px] bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-700/50 text-slate-900 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                <SelectItem value="all">All docs</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Documents List */}
          {filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-slate-600 dark:text-slate-400 mb-2">No documents found</h4>
              <p className="text-slate-500 dark:text-slate-500 mb-4">
                {documents.length === 0
                  ? 'Create your first document to get started'
                  : 'Try adjusting your filters'
                }
              </p>
              {documents.length === 0 && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Document
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {filteredDocuments.map((doc) => (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="border border-slate-300 dark:border-slate-700/50 rounded-lg p-4 hover:border-slate-400 dark:hover:border-slate-600/50 transition-all duration-200 bg-slate-100/30 dark:bg-slate-800/30 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {getDocumentIcon(doc.document_type)}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-slate-900 dark:text-white truncate" title={doc.title}>
                            {doc.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-xs ${getDocumentTypeColor(doc.document_type)}`}>
                              {getDocumentTypeLabel(doc.document_type)}
                            </Badge>
                            {doc.shared && (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                                <Share2 className="h-3 w-3 mr-1" />
                                shared
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                          <DropdownMenuItem onClick={() => handleViewDocument(doc)} className="text-slate-700 dark:text-slate-300">
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditDocument(doc)} className="text-slate-700 dark:text-slate-300">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-slate-300 dark:bg-slate-700" />
                          <DropdownMenuItem onClick={() => handleCopyLink(doc)} className="text-slate-700 dark:text-slate-300">
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleShareDocument(doc)} className="text-slate-700 dark:text-slate-300">
                            <Share2 className="h-4 w-4 mr-2" />
                            Share Settings
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDocumentDate(doc.last_modified_time || doc.updated_at)}
                      </div>
                      {doc.owner_email && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {doc.owner_email.split('@')[0]}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDocument(doc)}
                        className="flex-1 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditDocument(doc)}
                        className="flex-1 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Create Document Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-300 dark:border-slate-700/50">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Create New Document</DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-400">
                Create a new Google document for {contactName || 'this contact'}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Document Title</label>
                <Input
                  value={newDocument.title}
                  onChange={(e) => setNewDocument(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={`Meeting notes with ${contactName || 'contact'}`}
                  className="bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-700/50 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-green-500/50 dark:focus:border-green-500/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Document Type</label>
                <Select
                  value={newDocument.type}
                  onValueChange={(value: 'document' | 'spreadsheet' | 'presentation') =>
                    setNewDocument(prev => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger className="bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-700/50 text-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                    <SelectItem value="document">Google Docs (Document)</SelectItem>
                    <SelectItem value="spreadsheet">Google Sheets (Spreadsheet)</SelectItem>
                    <SelectItem value="presentation">Google Slides (Presentation)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowCreateDialog(false)}
                disabled={creating}
                className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDocument}
                disabled={creating || !newDocument.title.trim()}
                className="bg-green-600 hover:bg-green-700 text-white border-green-600"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Document
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </TooltipProvider>
  );
};

export default ContactDocuments;
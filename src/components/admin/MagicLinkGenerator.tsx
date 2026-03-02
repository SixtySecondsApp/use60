/**
 * Magic Link Generator Component
 * Allows platform admins to generate magic links for test user onboarding.
 * Pre-creates an organization and optionally grants credits.
 */

import { useState, useEffect } from 'react';
import {
  Link,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  Search,
  Check,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

interface MagicLink {
  id: string;
  token: string;
  org_id: string;
  email: string;
  is_test_user: boolean;
  credit_amount: number;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  activated_user_id: string | null;
  org_name: string;
}

type LinkStatus = 'active' | 'used' | 'expired';

function getLinkStatus(link: MagicLink): LinkStatus {
  if (link.used_at) return 'used';
  if (new Date(link.expires_at) < new Date()) return 'expired';
  return 'active';
}

function getStatusBadgeClasses(status: LinkStatus): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'used':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'expired':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
  }
}

export function MagicLinkGenerator() {
  const [links, setLinks] = useState<MagicLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({
    org_name: '',
    email: '',
    is_test_user: true,
    credit_amount: 500,
  });

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('test_user_magic_links')
        .select('id, token, org_id, email, is_test_user, credit_amount, expires_at, created_at, used_at, activated_user_id, org_name')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLinks(data || []);
    } catch (error: any) {
      toast.error('Failed to load magic links: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newLink.org_name.trim()) {
      toast.error('Organization name is required');
      return;
    }
    if (!newLink.email.trim()) {
      toast.error('Email is required');
      return;
    }

    try {
      setIsCreating(true);
      const { data: { session } } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke('generate-test-user-link', {
        body: {
          email: newLink.email.trim(),
          org_name: newLink.org_name.trim(),
          is_test_user: newLink.is_test_user,
          credit_amount: newLink.is_test_user ? newLink.credit_amount : 0,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate link');
      }

      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate link');
      }

      // Copy link to clipboard immediately
      await navigator.clipboard.writeText(result.link);
      toast.success('Magic link generated and copied to clipboard!');

      // Reset form and reload
      setNewLink({ org_name: '', email: '', is_test_user: true, credit_amount: 500 });
      await loadLinks();
    } catch (error: any) {
      toast.error('Failed to generate magic link: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const frontendUrl = window.location.origin;
    const link = `${frontendUrl}/auth/test-signup/${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedToken(token);
    toast.success('Link copied to clipboard');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleDelete = async (id: string, orgId: string) => {
    try {
      // Delete the magic link record
      const { error: linkError } = await supabase
        .from('test_user_magic_links')
        .delete()
        .eq('id', id);

      if (linkError) throw linkError;

      setLinks(links.filter(l => l.id !== id));
      toast.success('Magic link deleted');
    } catch (error: any) {
      toast.error('Failed to delete magic link: ' + error.message);
    }
  };

  const filteredLinks = links.filter(link =>
    link.org_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Magic Links</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Generate magic links to onboard test users with pre-created organizations
          </p>
        </div>
      </div>

      {/* Create New Link Section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Generate New Link
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Organization Name *
            </label>
            <input
              type="text"
              value={newLink.org_name}
              onChange={(e) => setNewLink({ ...newLink, org_name: e.target.value })}
              placeholder="Acme Corp"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email *
            </label>
            <input
              type="email"
              value={newLink.email}
              onChange={(e) => setNewLink({ ...newLink, email: e.target.value })}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Test User
            </label>
            <div className="flex items-center gap-3 h-[42px]">
              <button
                type="button"
                onClick={() => setNewLink({ ...newLink, is_test_user: !newLink.is_test_user })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 ${
                  newLink.is_test_user ? 'bg-[#37bd7e]' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    newLink.is_test_user ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              {newLink.is_test_user && (
                <input
                  type="number"
                  value={newLink.credit_amount}
                  onChange={(e) => setNewLink({ ...newLink, credit_amount: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                  min={0}
                />
              )}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {newLink.is_test_user ? 'credits' : 'No credits'}
              </span>
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={isCreating || !newLink.org_name.trim() || !newLink.email.trim()}
              className="w-full px-4 py-2 bg-[#37bd7e] text-white rounded-lg hover:bg-[#2da76c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Link className="w-4 h-4" />
                  Generate Link
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by org name or email..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
        />
      </div>

      {/* Links Table */}
      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
          <p className="text-gray-500 mt-2">Loading magic links...</p>
        </div>
      ) : filteredLinks.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <Link className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">No magic links found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredLinks.map((link) => {
                  const status = getLinkStatus(link);
                  return (
                    <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {link.org_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {link.email}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {link.is_test_user ? `${link.credit_amount}` : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(status)}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {format(new Date(link.expires_at), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {status === 'active' && (
                            <button
                              onClick={() => handleCopyLink(link.token)}
                              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                              title="Copy link"
                            >
                              {copiedToken === link.token ? (
                                <Check className="w-4 h-4 text-[#37bd7e]" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Magic Link</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the magic link for{' '}
                                  <strong>{link.org_name}</strong> ({link.email})?
                                  The pre-created organization will remain but the link will be invalidated.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(link.id, link.org_id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

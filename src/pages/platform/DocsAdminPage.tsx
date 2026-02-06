import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { BookOpen, Plus, Trash2, Eye, EyeOff, Edit2, X, Save, History } from 'lucide-react';
import { toast } from 'sonner';
import { MarkdownEditor } from '@/components/docs/MarkdownEditor';
import { MarkdownPreview } from '@/components/docs/MarkdownPreview';
import { VersionHistory } from '@/components/docs/VersionHistory';

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  published: boolean;
  updated_at: string;
}

interface GroupedArticles {
  [category: string]: Article[];
}

export default function DocsAdminPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [editorData, setEditorData] = useState({
    title: '',
    slug: '',
    category: '',
    content: '',
    published: false,
    order_index: 0,
  });
  const queryClient = useQueryClient();

  // Fetch all articles (published and drafts)
  const { data: articles, isLoading } = useQuery({
    queryKey: ['docs-admin-articles'],
    queryFn: async () => {
      // For admin, we need to fetch all articles directly from the table
      const { data, error } = await supabase
        .from('docs_articles')
        .select('id, slug, title, category, published, updated_at')
        .order('category')
        .order('order_index');

      if (error) throw error;

      // Group by category
      const grouped = data?.reduce((acc, article) => {
        const cat = article.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(article);
        return acc;
      }, {} as GroupedArticles) || {};

      return grouped;
    },
  });

  // Delete article mutation
  const deleteMutation = useMutation({
    mutationFn: async (articleId: string) => {
      const { error } = await supabase.functions.invoke('docs-api', {
        body: {
          action: 'delete',
          article_id: articleId,
        },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docs-admin-articles'] });
      toast.success('Article deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete article: ${error.message}`);
    },
  });

  // Toggle published status mutation
  const togglePublishedMutation = useMutation({
    mutationFn: async ({ articleId, published }: { articleId: string; published: boolean }) => {
      const { error } = await supabase.functions.invoke('docs-api', {
        body: {
          action: 'update',
          article_id: articleId,
          published: !published,
        },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docs-admin-articles'] });
      toast.success('Article status updated');
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  const handleDelete = async (articleId: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      deleteMutation.mutate(articleId);
    }
  };

  const handleTogglePublished = (articleId: string, published: boolean) => {
    togglePublishedMutation.mutate({ articleId, published });
  };

  // Save article mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const action = editingId === 'new' ? 'create' : 'update';
      const body: any = {
        action,
        ...editorData,
      };

      if (editingId !== 'new') {
        body.article_id = editingId;
      }

      const { error } = await supabase.functions.invoke('docs-api', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docs-admin-articles'] });
      toast.success(editingId === 'new' ? 'Article created' : 'Article saved');
      setEditingId(null);
    },
    onError: (error) => {
      toast.error(`Failed to save article: ${error.message}`);
    },
  });

  const handleEdit = async (articleId: string) => {
    if (articleId === 'new') {
      setEditorData({
        title: '',
        slug: '',
        category: '',
        content: '',
        published: false,
        order_index: 0,
      });
      setEditingId('new');
      return;
    }

    // Load article data
    const { data, error } = await supabase
      .from('docs_articles')
      .select('*')
      .eq('id', articleId)
      .single();

    if (error) {
      toast.error('Failed to load article');
      return;
    }

    setEditorData({
      title: data.title,
      slug: data.slug,
      category: data.category,
      content: data.content,
      published: data.published,
      order_index: data.order_index || 0,
    });
    setEditingId(articleId);
  };

  const handleSave = () => {
    if (!editorData.title || !editorData.slug || !editorData.category || !editorData.content) {
      toast.error('Please fill in all required fields');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <BookOpen className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Documentation CMS
            </h1>
          </div>
          <button
            onClick={() => handleEdit('new')}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
              text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Article</span>
          </button>
        </div>

        {/* Articles List */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-500">Loading articles...</div>
        ) : (
          <div className="space-y-8">
            {Object.entries(articles || {}).map(([category, categoryArticles]) => (
              <div key={category}>
                <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  {category}
                </h2>
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Slug
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Last Updated
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {categoryArticles.map((article) => (
                        <tr key={article.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                            {article.title}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {article.slug}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {article.published ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                Published
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-400">
                                Draft
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {new Date(article.updated_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleEdit(article.id)}
                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleTogglePublished(article.id, article.published)}
                                className="p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                title={article.published ? 'Unpublish' : 'Publish'}
                              >
                                {article.published ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleDelete(article.id, article.title)}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {Object.keys(articles || {}).length === 0 && (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500">No articles yet. Create your first article!</p>
              </div>
            )}
          </div>
        )}

        {/* Article Editor Modal */}
        {editingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-7xl h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-xl font-bold">
                  {editingId === 'new' ? 'Create New Article' : 'Edit Article'}
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                      disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saveMutation.isPending ? 'Saving...' : 'Save'}</span>
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Metadata Panel */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={editorData.title}
                      onChange={(e) => setEditorData({ ...editorData, title: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg
                        bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      placeholder="Article title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Slug *
                    </label>
                    <input
                      type="text"
                      value={editorData.slug}
                      onChange={(e) => setEditorData({ ...editorData, slug: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg
                        bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      placeholder="url-friendly-slug"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Category *
                    </label>
                    <input
                      type="text"
                      value={editorData.category}
                      onChange={(e) => setEditorData({ ...editorData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg
                        bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      placeholder="Getting Started"
                    />
                  </div>
                </div>
              </div>

              {/* Split-Pane Editor */}
              <div className="flex-1 flex overflow-hidden">
                {/* Editor */}
                <div className="flex-1 border-r border-slate-200 dark:border-slate-700">
                  <MarkdownEditor
                    value={editorData.content}
                    onChange={(content) => setEditorData({ ...editorData, content })}
                  />
                </div>

                {/* Preview / Version History */}
                <div className="flex-1">
                  <div className="h-full flex flex-col">
                    <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={() => setShowVersionHistory(false)}
                          className={`text-sm font-medium ${!showVersionHistory ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Preview
                        </button>
                        {editingId !== 'new' && (
                          <button
                            onClick={() => setShowVersionHistory(true)}
                            className={`flex items-center space-x-1 text-sm font-medium ${showVersionHistory ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            <History className="w-4 h-4" />
                            <span>Version History</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                      {!showVersionHistory ? (
                        <MarkdownPreview content={editorData.content} />
                      ) : (
                        <div className="p-4">
                          <VersionHistory
                            articleId={editingId!}
                            onRevert={(versionId) => {
                              // TODO: Implement revert functionality
                              toast.info('Revert functionality coming soon');
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

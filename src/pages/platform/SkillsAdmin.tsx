/**
 * SkillsAdmin Page
 *
 * Platform admin page for managing agent-executable skill documents.
 * Super-admin only - provides CRUD operations with category filtering.
 */

import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  Search,
  ToggleLeft,
  ToggleRight,
  FileCode,
  RefreshCw,
  Sparkles,
  FileText,
  Database,
  Server,
  LayoutTemplate,
  Workflow,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  usePlatformSkills,
  usePlatformSkillOperations,
  SKILL_CATEGORIES,
  type PlatformSkill,
  type SkillCategory,
} from '@/lib/hooks/usePlatformSkills';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { buildSkillResponseFormatExport, writeJsonToClipboard } from '@/lib/utils/responseFormatExport';

const CATEGORY_ICONS: Record<SkillCategory, React.ElementType> = {
  'sales-ai': Sparkles,
  writing: FileText,
  enrichment: Database,
  workflows: Workflow,
  'data-access': Server,
  'output-format': LayoutTemplate,
  'agent-sequence': GitBranch,
};

// Valid category slugs for URL routing
const VALID_CATEGORIES = SKILL_CATEGORIES.map(c => c.value);
const DEFAULT_CATEGORY: SkillCategory = 'sales-ai';

export default function SkillsAdmin() {
  const { user } = useAuth();
  const { category: urlCategory } = useParams<{ category?: string }>();
  const navigate = useNavigate();

  // Validate and resolve category from URL
  const selectedCategory: SkillCategory = useMemo(() => {
    if (urlCategory && VALID_CATEGORIES.includes(urlCategory as SkillCategory)) {
      return urlCategory as SkillCategory;
    }
    return DEFAULT_CATEGORY;
  }, [urlCategory]);

  // Redirect to default category if no category in URL or invalid
  // Redirect agent-sequence category to dedicated page
  useEffect(() => {
    if (urlCategory === 'agent-sequence') {
      navigate('/platform/agent-sequences', { replace: true });
      return;
    }
    if (!urlCategory || !VALID_CATEGORIES.includes(urlCategory as SkillCategory)) {
      navigate(`/platform/skills/${DEFAULT_CATEGORY}`, { replace: true });
    }
  }, [urlCategory, navigate]);

  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<PlatformSkill | null>(null);

  const { data: skills, isLoading, refetch } = usePlatformSkills(selectedCategory);
  const operations = usePlatformSkillOperations(user?.id || '');

  // Filter skills by search query
  const filteredSkills = useMemo(() => {
    if (!skills) return [];
    if (!searchQuery.trim()) return skills;

    const query = searchQuery.toLowerCase();
    return skills.filter(
      (skill) =>
        skill.skill_key.toLowerCase().includes(query) ||
        skill.frontmatter.name.toLowerCase().includes(query) ||
        skill.frontmatter.description?.toLowerCase().includes(query)
    );
  }, [skills, searchQuery]);

  const handleDelete = async (skill: PlatformSkill) => {
    try {
      await operations.delete(skill.id);
      setConfirmDelete(null);
    } catch (error) {
      // Error toast is handled in the hook
    }
  };

  const handleToggleActive = async (skill: PlatformSkill) => {
    try {
      await operations.toggle(skill.id, !skill.is_active);
    } catch (error) {
      // Error toast is handled in the hook
    }
  };

  const handleCopyCategoryResponseFormats = async () => {
    try {
      const all = (skills || []).map((s) => buildSkillResponseFormatExport(s));
      await writeJsonToClipboard({
        kind: 'skill-response-formats',
        generatedAt: new Date().toISOString(),
        category: selectedCategory,
        skills: all,
      });
      toast.success('Copied response formats JSON');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to copy');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <BackToPlatform />
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
                <FileCode className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  Platform Skills
                </h1>
                <p className="text-gray-700 dark:text-gray-300 mt-1">
                  Manage agent-executable skill documents for AI automation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleCopyCategoryResponseFormats}
                disabled={isLoading}
                className="gap-2"
              >
                Copy formats JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Link to="/platform/agent-sequences">
                <Button variant="outline" className="gap-2">
                  <GitBranch className="w-4 h-4" />
                  Agent Sequences
                </Button>
              </Link>
              <Link to={`/platform/skills/${selectedCategory}/new`}>
                <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="w-4 h-4" />
                  New Skill
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Category Navigation & Search */}
      <div className="border-b border-gray-200 dark:border-gray-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Category Links */}
            <nav className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
              {SKILL_CATEGORIES.filter(cat => cat.value !== 'agent-sequence').map((cat) => {
                const Icon = CATEGORY_ICONS[cat.value];
                const isActive = selectedCategory === cat.value;
                return (
                  <Link
                    key={cat.value}
                    to={`/platform/skills/${cat.value}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {cat.label}
                  </Link>
                );
              })}
            </nav>

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-gray-800/50 border-gray-300 dark:border-gray-700/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-48 bg-white dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-700/50 animate-pulse"
              />
            ))}
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="text-center py-16">
            <FileCode className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No skills found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {searchQuery
                ? 'Try adjusting your search query'
                : `Create your first ${selectedCategory} skill to get started`}
            </p>
            {!searchQuery && (
              <Link to={`/platform/skills/${selectedCategory}/new`}>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Skill
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSkills.map((skill, index) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                category={selectedCategory}
                index={index}
                onDelete={() => setConfirmDelete(skill)}
                onToggleActive={() => handleToggleActive(skill)}
                isProcessing={operations.isProcessing}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              Delete Skill?
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete &ldquo;{confirmDelete?.frontmatter.name}&rdquo;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={operations.isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              disabled={operations.isDeleting}
            >
              {operations.isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Skill Card Component
// ============================================================================

interface SkillCardProps {
  skill: PlatformSkill;
  category: SkillCategory;
  index: number;
  onDelete: () => void;
  onToggleActive: () => void;
  isProcessing: boolean;
}

function SkillCard({
  skill,
  category,
  index,
  onDelete,
  onToggleActive,
  isProcessing,
}: SkillCardProps) {
  const CategoryIcon = CATEGORY_ICONS[skill.category];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className={cn(
        'bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm',
        'border border-gray-200 dark:border-gray-700/50',
        'rounded-xl p-6 shadow-sm dark:shadow-none',
        'hover:border-gray-300 dark:hover:border-gray-600/50',
        'transition-colors'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {skill.frontmatter.name}
            </h3>
            <Badge
              variant="outline"
              className={cn(
                'text-xs shrink-0',
                skill.is_active
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              )}
            >
              {skill.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
            {skill.skill_key}
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-4">
        {skill.frontmatter.description}
      </p>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4">
        <div className="flex items-center gap-1">
          <CategoryIcon className="w-3.5 h-3.5" />
          <span className="capitalize">{skill.category.replace('-', ' ')}</span>
        </div>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>v{skill.version}</span>
        {skill.frontmatter.triggers && skill.frontmatter.triggers.length > 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{skill.frontmatter.triggers.length} triggers</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link to={`/platform/skills/${category}/${skill.skill_key}`} className="flex-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            className="w-full gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </Button>
        </Link>
        <Link to={`/platform/skills/${category}/${skill.skill_key}/edit`} className="flex-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            className="w-full gap-1.5"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleActive}
          disabled={isProcessing}
          className="p-2"
          title={skill.is_active ? 'Deactivate' : 'Activate'}
        >
          {skill.is_active ? (
            <ToggleRight className="w-4 h-4 text-green-600" />
          ) : (
            <ToggleLeft className="w-4 h-4 text-gray-400" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isProcessing}
          className="p-2 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}

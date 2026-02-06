/**
 * OI-016: AI Recipe Library
 *
 * Slide-out panel showing saved recipes with run/edit/share actions
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Share, Trash2, BookOpen, Filter, ArrowUpDown, Columns, FileDown, ChevronRight, Users, Clock, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useServices } from '@/lib/services/ServiceLocator';
import { formatDistanceToNow } from 'date-fns';

interface AiRecipeLibraryProps {
  tableId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (recipe: any) => void;
}

const recipeSuggestions = [
  {
    icon: Filter,
    title: 'Filter by seniority',
    query: 'Show only C-level and VP contacts',
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-500/20',
    hoverBorder: 'hover:border-blue-500/40',
  },
  {
    icon: ArrowUpDown,
    title: 'Sort by engagement',
    query: 'Order by who has a job title first',
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/40',
  },
  {
    icon: Columns,
    title: 'Create scoring column',
    query: 'Add a column that scores lead quality from 1-10',
    gradient: 'from-violet-500 to-purple-600',
    glow: 'shadow-violet-500/20',
    hoverBorder: 'hover:border-violet-500/40',
  },
  {
    icon: FileDown,
    title: 'Export a segment',
    query: 'Export all rows where company has more than 100 employees',
    gradient: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-500/20',
    hoverBorder: 'hover:border-amber-500/40',
  },
];

export function AiRecipeLibrary({ tableId, open, onOpenChange, onRun }: AiRecipeLibraryProps) {
  const { opsTableService } = useServices();
  const queryClient = useQueryClient();

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', tableId],
    queryFn: () => opsTableService.getRecipes(tableId),
    enabled: open,
  });

  const toggleShareMutation = useMutation({
    mutationFn: ({ id, isShared }: { id: string; isShared: boolean }) =>
      opsTableService.toggleRecipeShare(id, !isShared),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', tableId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => opsTableService.deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', tableId] });
      toast.success('Recipe deleted');
    },
  });

  const myRecipes = recipes.filter((r: any) => !r.is_shared || r.created_by === r._currentUserId);
  const sharedRecipes = recipes.filter((r: any) => r.is_shared);
  const autoRunRecipes = recipes.filter((r: any) => r.trigger_type === 'on_sync' || r.trigger_type === 'scheduled');

  const RecipeCard = ({ recipe }: { recipe: any }) => (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3 transition-colors hover:bg-white/[0.04]">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">{recipe.name}</h3>
        {recipe.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{recipe.description}</p>
        )}
        <div className="mt-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
          <p className="text-xs text-gray-400 line-clamp-2 font-mono">
            {recipe.query_text}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <Badge variant="outline" className="border-white/10 text-gray-400 bg-white/[0.03] text-[10px] px-1.5 py-0">
          {recipe.trigger_type}
        </Badge>
        <span className="text-gray-600">·</span>
        <span className="text-gray-500">Run {recipe.run_count || 0}x</span>
        {recipe.last_run_at && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">
              {formatDistanceToNow(new Date(recipe.last_run_at), { addSuffix: true })}
            </span>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => onRun(recipe)}
          className="h-7 text-xs bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white border-0 shadow-lg shadow-amber-500/20"
        >
          <Play className="h-3 w-3 mr-1" />
          Run
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggleShareMutation.mutate({ id: recipe.id, isShared: recipe.is_shared })}
          className="h-7 text-xs border-white/10 text-gray-400 bg-white/[0.03] hover:bg-white/[0.06] hover:text-gray-200"
        >
          <Share className="h-3 w-3 mr-1" />
          {recipe.is_shared ? 'Unshare' : 'Share'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (confirm('Delete this recipe?')) {
              deleteMutation.mutate(recipe.id);
            }
          }}
          className="h-7 text-xs border-white/10 text-gray-500 bg-white/[0.03] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[560px] !top-16 !h-auto !p-0 border-l border-white/[0.06] bg-gray-950">
        {/* Custom header with gradient accent */}
        <div className="border-b border-white/[0.06] px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <BookOpen className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold text-gray-100">Recipe Library</SheetTitle>
              <p className="text-xs text-gray-500 mt-0.5">Saved queries you can re-run anytime</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <Tabs defaultValue="my" className="w-full">
            <TabsList className="w-full bg-white/[0.03] border border-white/[0.06] p-0.5 h-9">
              <TabsTrigger value="my" className="flex-1 text-xs data-[state=active]:bg-white/[0.08] data-[state=active]:text-gray-200 data-[state=active]:shadow-none text-gray-500 h-7">
                My Recipes ({myRecipes.length})
              </TabsTrigger>
              <TabsTrigger value="shared" className="flex-1 text-xs data-[state=active]:bg-white/[0.08] data-[state=active]:text-gray-200 data-[state=active]:shadow-none text-gray-500 h-7">
                <Users className="w-3 h-3 mr-1" />
                Shared ({sharedRecipes.length})
              </TabsTrigger>
              <TabsTrigger value="auto-run" className="flex-1 text-xs data-[state=active]:bg-white/[0.08] data-[state=active]:text-gray-200 data-[state=active]:shadow-none text-gray-500 h-7">
                <Repeat className="w-3 h-3 mr-1" />
                Auto ({autoRunRecipes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="my" className="mt-4 pb-6">
              {myRecipes.length === 0 ? (
                <div className="space-y-5">
                  {/* Info box */}
                  <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent p-4">
                    <div className="flex items-start gap-2.5">
                      <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Recipes are saved queries you can re-run. Try one of these in the AI Query Bar, then save it as a recipe.
                      </p>
                    </div>
                  </div>

                  {/* Suggestion cards */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 px-1">Try these</p>
                    <div className="space-y-2">
                      {recipeSuggestions.map((s) => (
                        <button
                          key={s.title}
                          onClick={() => onRun({ query_text: s.query })}
                          className={`group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-left transition-all duration-200 ${s.hoverBorder} hover:bg-white/[0.05]`}
                        >
                          <div className={`w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-lg ${s.glow} transition-transform duration-200 group-hover:scale-110`}>
                            <s.icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-200">{s.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1 font-mono">{s.query}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-600 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {myRecipes.map((recipe: any) => (
                    <RecipeCard key={recipe.id} recipe={recipe} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="shared" className="mt-4 pb-6">
              {sharedRecipes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                    <Users className="w-5 h-5 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">No shared recipes yet</p>
                  <p className="text-xs text-gray-600 mt-1 text-center">Share a recipe from "My Recipes" to make it available to your team</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sharedRecipes.map((recipe: any) => (
                    <RecipeCard key={recipe.id} recipe={recipe} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="auto-run" className="mt-4 pb-6">
              {autoRunRecipes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                    <Clock className="w-5 h-5 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">No auto-run recipes</p>
                  <p className="text-xs text-gray-600 mt-1 text-center">Set a recipe trigger to "on_sync" or "scheduled" to run it automatically</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {autoRunRecipes.map((recipe: any) => (
                    <RecipeCard key={recipe.id} recipe={recipe} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

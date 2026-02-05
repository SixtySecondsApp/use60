/**
 * OI-016: AI Recipe Library
 *
 * Slide-out panel showing saved recipes with run/edit/share actions
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tantml:react-query';
import { Play, Share, Trash2, BookOpen } from 'lucide-react';
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

  const myRecipes = recipes.filter((r: any) => r.created_by === 'current-user-id'); // TODO: Get actual user ID
  const sharedRecipes = recipes.filter((r: any) => r.is_shared && r.created_by !== 'current-user-id');

  const RecipeCard = ({ recipe }: { recipe: any }) => (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-semibold">{recipe.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
          Query: {recipe.query_text}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{recipe.trigger_type}</Badge>
        <span>·</span>
        <span>Run {recipe.run_count || 0}x</span>
        {recipe.last_run_at && (
          <>
            <span>·</span>
            <span>
              {formatDistanceToNow(new Date(recipe.last_run_at), { addSuffix: true })}
            </span>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={() => onRun(recipe)}
        >
          <Play className="h-4 w-4 mr-1" />
          Run
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggleShareMutation.mutate({ id: recipe.id, isShared: recipe.is_shared })}
        >
          <Share className="h-4 w-4 mr-1" />
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
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Recipe Library
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="my" className="mt-6">
          <TabsList>
            <TabsTrigger value="my">My Recipes ({myRecipes.length})</TabsTrigger>
            <TabsTrigger value="shared">Shared ({sharedRecipes.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="my" className="space-y-4 mt-4">
            {myRecipes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No recipes yet. Save a query to create one!
              </p>
            ) : (
              myRecipes.map((recipe: any) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))
            )}
          </TabsContent>

          <TabsContent value="shared" className="space-y-4 mt-4">
            {sharedRecipes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No shared recipes from your team yet
              </p>
            ) : (
              sharedRecipes.map((recipe: any) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

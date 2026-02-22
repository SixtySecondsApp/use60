/**
 * BattlecardViewer Component (KNW-008)
 *
 * Renders battlecard_content (admin-uploaded) or auto_battlecard (AI-generated)
 * as formatted markdown. Shows competitor overview, strengths, weaknesses,
 * counter-positioning, and pricing intelligence.
 */

import React, { useState } from 'react';
import { Shield, Pencil, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

interface BattlecardViewerProps {
  competitorName: string;
  profileId: string;
  battlecardContent: string | null;
  autoBattlecard: string | null;
  isAdmin?: boolean;
  onUpdate?: () => void;
}

export function BattlecardViewer({
  competitorName,
  profileId,
  battlecardContent,
  autoBattlecard,
  isAdmin = false,
  onUpdate,
}: BattlecardViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(battlecardContent || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const displayContent = battlecardContent || autoBattlecard;

  if (!displayContent && !isAdmin) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('competitor_profiles')
        .update({ battlecard_content: editContent || null })
        .eq('id', profileId);

      if (error) throw error;
      toast.success('Battlecard updated');
      setIsEditing(false);
      onUpdate?.();
    } catch (err) {
      toast.error('Failed to save battlecard');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            Battlecard: {competitorName}
            {!battlecardContent && autoBattlecard && (
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                <Sparkles className="h-3 w-3" />
                AI-generated
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {isAdmin && !isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setEditContent(battlecardContent || autoBattlecard || '');
                  setIsEditing(true);
                }}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[200px] text-sm font-mono"
                placeholder="Enter battlecard content in markdown..."
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {/* Simple markdown-ish rendering for battlecard sections */}
              {displayContent?.split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return <h3 key={i} className="text-sm font-semibold mt-3 mb-1">{line.replace('## ', '')}</h3>;
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return <p key={i} className="text-sm text-muted-foreground ml-3 my-0.5">{line}</p>;
                }
                if (line.match(/^\d+\. /)) {
                  return <p key={i} className="text-sm ml-3 my-0.5">{line}</p>;
                }
                if (line.trim() === '') return <div key={i} className="h-1" />;
                return <p key={i} className="text-sm text-muted-foreground my-0.5">{line}</p>;
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

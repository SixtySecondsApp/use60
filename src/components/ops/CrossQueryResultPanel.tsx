/**
 * OI-022: Cross-Query Result Panel
 *
 * Displays enriched data, comparison results, and meeting references
 */

import { useState } from 'react';
import { X, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface CrossQueryResultPanelProps {
  result: any;
  onKeepColumn: (columnConfig: any) => void;
  onDismiss: () => void;
}

export function CrossQueryResultPanel({ result, onKeepColumn, onDismiss }: CrossQueryResultPanelProps) {
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());

  if (!result) return null;

  const { joinConfig, enrichedRows, newColumns, matched, netNew, overlapping } = result;

  const toggleMeeting = (id: string) => {
    const next = new Set(expandedMeetings);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedMeetings(next);
  };

  return (
    <div className="border rounded-lg p-6 mb-4 bg-card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">Cross-Query Results</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {joinConfig.joinType === 'enrich' && 'Enriched data from '}
            {joinConfig.joinType === 'compare' && 'Comparison with '}
            {joinConfig.targetSource}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Enrichment mode */}
      {joinConfig.outputType === 'enriched_columns' && enrichedRows && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Badge variant="secondary">{enrichedRows.length} rows enriched</Badge>
            <Badge variant="outline">{newColumns?.length || 0} new columns</Badge>
          </div>

          {newColumns && newColumns.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Available columns:</p>
              <div className="flex flex-wrap gap-2">
                {newColumns.map((col: string) => (
                  <Button
                    key={col}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onKeepColumn({
                        key: col.toLowerCase().replace(/\s+/g, '_'),
                        name: col,
                        column_type: 'text',
                      })
                    }
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Keep {col}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Sample enriched rows */}
          <div className="border rounded-md p-4 bg-blue-50/50 dark:bg-blue-950/20">
            <p className="text-sm font-medium mb-2">Preview (first 3 rows):</p>
            <div className="space-y-2">
              {enrichedRows.slice(0, 3).map((row: any, idx: number) => (
                <div key={idx} className="text-sm">
                  <span className="font-mono">{row.sourceValue}</span>
                  <span className="mx-2">→</span>
                  <span className="text-muted-foreground">
                    {JSON.stringify(row.enrichedData).slice(0, 60)}...
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comparison mode */}
      {joinConfig.outputType === 'comparison' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-md p-4 text-center">
              <div className="text-2xl font-bold">{matched || 0}</div>
              <div className="text-sm text-muted-foreground">Matched</div>
            </div>
            <div className="border rounded-md p-4 text-center bg-green-50 dark:bg-green-950/20">
              <div className="text-2xl font-bold text-green-600">{netNew || 0}</div>
              <div className="text-sm text-muted-foreground">Net-New</div>
            </div>
            <div className="border rounded-md p-4 text-center">
              <div className="text-2xl font-bold">{overlapping || 0}</div>
              <div className="text-sm text-muted-foreground">Overlapping</div>
            </div>
          </div>
        </div>
      )}

      {/* Meeting references */}
      {joinConfig.targetSource === 'meetings' && result.meetings && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Meeting references ({result.meetings.length}):</p>
          {result.meetings.map((meeting: any) => (
            <Collapsible key={meeting.id}>
              <div className="border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{meeting.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(meeting.start_time).toLocaleDateString()}
                    </p>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMeeting(meeting.id)}
                    >
                      {expandedMeetings.has(meeting.id) ? 'Hide' : 'Show'} transcript
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-2 pt-2 border-t">
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {meeting.transcript || 'No transcript available'}
                  </p>
                  {meeting.video_url && (
                    <Button
                      variant="link"
                      size="sm"
                      asChild
                      className="mt-2"
                    >
                      <a href={meeting.video_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Watch recording
                      </a>
                    </Button>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

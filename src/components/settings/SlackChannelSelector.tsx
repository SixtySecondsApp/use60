/**
 * SlackChannelSelector Component
 *
 * A combobox component for selecting Slack channels.
 * The trigger doubles as a search input — type to filter channels inline.
 * Fetches available channels from the Slack API and allows users to select one.
 * Public channels without bot membership show a "Join" button.
 * Private channels without bot membership show an invite hint.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSlackChannels, useJoinSlackChannel } from '@/lib/hooks/useSlackSettings';
import { Loader2, Hash, Lock, AlertCircle, Plus, Search, X, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SlackChannelSelectorProps {
  value: string | null;
  onChange: (channelId: string | null, channelName: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function SlackChannelSelector({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a channel',
}: SlackChannelSelectorProps) {
  const { data: channels, isLoading, error, refetch } = useSlackChannels();
  const joinChannel = useJoinSlackChannel();
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // All hooks must be called before any early returns
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q
      ? channels?.filter((ch) => ch.name.toLowerCase().includes(q))
      : channels;
    return list || [];
  }, [channels, search]);

  const selectedChannel = useMemo(
    () => channels?.find((ch) => ch.id === value),
    [channels, value]
  );

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      // Small delay to let popover render
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setSearch('');
    }
  }, [open]);

  const handleSelect = (channelId: string, channelName: string) => {
    onChange(channelId, channelName);
    setSearch('');
    setOpen(false);
  };

  const handleJoinChannel = async (
    e: React.MouseEvent,
    channelId: string,
    channelName: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setJoiningChannelId(channelId);

    try {
      await joinChannel.mutateAsync({ channelId });
      toast.success(`Joined #${channelName}`);
      onChange(channelId, channelName);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to join channel');
    } finally {
      setJoiningChannelId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground border rounded-md">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading channels...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive border border-destructive/50 rounded-md">
        <AlertCircle className="h-4 w-4" />
        Failed to load channels
        <button
          onClick={() => refetch()}
          className="ml-auto text-xs underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const availableChannels = filtered.filter((ch) => ch.is_member);
  const publicUnavailable = filtered.filter((ch) => !ch.is_member && !ch.is_private);
  const privateUnavailable = filtered.filter((ch) => !ch.is_member && ch.is_private);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex items-center gap-2 w-full min-w-0 h-9 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm',
            'hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground'
          )}
        >
          {value && selectedChannel ? (
            <>
              <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedChannel.name}</span>
            </>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          {value && !disabled ? (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange(null, null);
              }}
              className="ml-auto shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width]"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search channels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Channel list */}
        <div className="max-h-[280px] overflow-y-auto">
          {availableChannels.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                Available Channels
              </div>
              {availableChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => handleSelect(channel.id, channel.name)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent rounded-sm cursor-pointer',
                    channel.id === value && 'bg-accent'
                  )}
                >
                  {channel.is_private ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{channel.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({channel.num_members})
                  </span>
                </button>
              ))}
            </>
          )}

          {publicUnavailable.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground mt-1">
                Public Channels
              </div>
              {publicUnavailable.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-default hover:bg-accent/50 rounded-sm"
                >
                  <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate">{channel.name}</span>
                  <button
                    onClick={(e) => handleJoinChannel(e, channel.id, channel.name)}
                    disabled={joiningChannelId === channel.id}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 shrink-0"
                  >
                    {joiningChannelId === channel.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Join
                  </button>
                </div>
              ))}
            </>
          )}

          {privateUnavailable.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground mt-1">
                Private Channels
              </div>
              {privateUnavailable.slice(0, 5).map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm opacity-50"
                >
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </div>
              ))}
              {privateUnavailable.length > 5 && (
                <div className="px-3 py-1 text-xs text-muted-foreground">
                  + {privateUnavailable.length - 5} more private channels
                </div>
              )}
              <div className="px-3 py-1.5 text-xs text-muted-foreground italic">
                Type <code className="px-1 py-0.5 bg-muted rounded text-[11px]">/invite @Sixty</code> in the channel
              </div>
            </>
          )}

          {search && filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No channels matching &quot;{search}&quot;
            </div>
          )}

          {!search && channels?.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No channels found. Make sure to invite the Sixty bot to at least one channel.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SlackChannelSelector;

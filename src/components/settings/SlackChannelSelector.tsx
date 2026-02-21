/**
 * SlackChannelSelector Component
 *
 * A dropdown component for selecting Slack channels.
 * Fetches available channels from the Slack API and allows users to select one.
 * Public channels without bot membership show a "Join" button.
 * Private channels without bot membership show an invite hint.
 */

import React, { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSlackChannels, useJoinSlackChannel } from '@/lib/hooks/useSlackSettings';
import { Loader2, Hash, Lock, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface SlackChannelSelectorProps {
  value: string | null;
  onChange: (channelId: string, channelName: string) => void;
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

  // Split channels into three groups
  const availableChannels = channels?.filter((ch) => ch.is_member) || [];
  const publicUnavailable = channels?.filter((ch) => !ch.is_member && !ch.is_private) || [];
  const privateUnavailable = channels?.filter((ch) => !ch.is_member && ch.is_private) || [];

  return (
    <Select
      value={value || undefined}
      onValueChange={(channelId) => {
        const channel = channels?.find((ch) => ch.id === channelId);
        if (channel) {
          onChange(channel.id, channel.name);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {availableChannels.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Available Channels
            </div>
            {availableChannels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                <div className="flex items-center gap-2">
                  {channel.is_private ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{channel.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({channel.num_members} members)
                  </span>
                </div>
              </SelectItem>
            ))}
          </>
        )}

        {publicUnavailable.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
              Public Channels
            </div>
            {publicUnavailable.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-default hover:bg-accent/50 rounded-sm"
              >
                <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{channel.name}</span>
                <button
                  onClick={(e) => handleJoinChannel(e, channel.id, channel.name)}
                  disabled={joiningChannelId === channel.id}
                  className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
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
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
              Private Channels
            </div>
            {privateUnavailable.slice(0, 5).map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-2 px-2 py-1.5 text-sm opacity-50"
              >
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{channel.name}</span>
              </div>
            ))}
            {privateUnavailable.length > 5 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                + {privateUnavailable.length - 5} more private channels
              </div>
            )}
            <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
              Type <code className="px-1 py-0.5 bg-muted rounded text-[11px]">/invite @Sixty</code> in the channel
            </div>
          </>
        )}

        {channels?.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No channels found. Make sure to invite the Sixty bot to at least one channel.
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

export default SlackChannelSelector;

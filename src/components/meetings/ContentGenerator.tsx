/**
 * ContentGenerator Component
 *
 * Step 2 of Content Generation workflow: Select content type and generate
 *
 * Features:
 * - Display selected topics summary
 * - Content type selector (social, blog, video, email)
 * - Generate content with loading state
 * - Display generated content with markdown rendering
 * - Copy to clipboard functionality
 * - Download as markdown
 * - Regenerate button
 * - Back navigation
 */

import React, { useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  MessageSquare,
  FileText,
  Video,
  Mail,
  Sparkles,
  Copy,
  Check,
  Download,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useGenerateContent } from '@/lib/services/contentService.examples';
import type { Topic, ContentType } from '@/lib/services/contentService';
import { ContentServiceError } from '@/lib/services/contentService';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Props for ContentGenerator component
 */
interface ContentGeneratorProps {
  meetingId: string;
  selectedTopics: Array<{ index: number; topic: Topic }>;
  onBack: () => void;
}

/**
 * Content type button configuration
 */
interface ContentTypeConfig {
  type: ContentType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  wordCount: string;
  description: string;
}

const contentTypes: ContentTypeConfig[] = [
  {
    type: 'social',
    icon: MessageSquare,
    label: 'Social Posts',
    wordCount: '~100-150 words',
    description: 'Twitter/LinkedIn ready posts',
  },
  {
    type: 'blog',
    icon: FileText,
    label: 'Blog Article',
    wordCount: '~800-1200 words',
    description: 'SEO-optimized blog content',
  },
  {
    type: 'video',
    icon: Video,
    label: 'Video Script',
    wordCount: '~500-700 words',
    description: 'Engaging video narration',
  },
  {
    type: 'email',
    icon: Mail,
    label: 'Email Newsletter',
    wordCount: '~400-600 words',
    description: 'Professional email format',
  },
];

/**
 * ContentGenerator Component
 * Generates marketing content from selected topics
 */
export function ContentGenerator({
  meetingId,
  selectedTopics,
  onBack,
}: ContentGeneratorProps) {
  // Local state
  const [selectedContentType, setSelectedContentType] = useState<ContentType | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate content mutation
  const generateMutation = useGenerateContent();
  const generatedContent = generateMutation.data?.content;

  /**
   * Handle content type selection
   */
  const handleSelectType = useCallback((type: ContentType) => {
    setSelectedContentType(type);
  }, []);

  /**
   * Handle generate content
   */
  const handleGenerate = useCallback(
    async (regenerate = false) => {
      if (!selectedContentType) {
        toast.error('Please select a content type');
        return;
      }

      try {
        await generateMutation.mutateAsync({
          meeting_id: meetingId,
          content_type: selectedContentType,
          selected_topic_indices: selectedTopics.map((t) => t.index),
          regenerate,
        });
        toast.success('Content generated successfully!');
      } catch (error) {
        const errorMessage =
          error instanceof ContentServiceError
            ? error.message
            : 'Failed to generate content';
        toast.error(errorMessage);
      }
    },
    [selectedContentType, meetingId, selectedTopics, generateMutation]
  );

  /**
   * Copy content to clipboard
   */
  const handleCopy = useCallback(async () => {
    if (!generatedContent) return;

    try {
      await navigator.clipboard.writeText(generatedContent.content);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  }, [generatedContent]);

  /**
   * Download content as markdown file
   */
  const handleDownload = useCallback(() => {
    if (!generatedContent) return;

    const blob = new Blob([generatedContent.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedContent.title || 'content'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download started!');
  }, [generatedContent]);

  /**
   * Regenerate content
   */
  const handleRegenerate = useCallback(() => {
    handleGenerate(true);
  }, [handleGenerate]);

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="section-card">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Topics
          </Button>
        </div>
      </div>

      {/* Selected Topics Summary */}
      <div className="section-card">
        <h3 className="text-lg font-semibold mb-3">Selected Topics</h3>
        <div className="flex flex-wrap gap-2">
          {selectedTopics.map(({ topic, index }) => (
            <Badge
              key={index}
              variant="secondary"
              className="text-sm px-3 py-1"
            >
              {topic.title}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content Type Selector */}
      <div className="section-card">
        <h3 className="text-lg font-semibold mb-4">Choose Content Type</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {contentTypes.map((config) => {
            const Icon = config.icon;
            const isSelected = selectedContentType === config.type;

            return (
              <button
                key={config.type}
                onClick={() => handleSelectType(config.type)}
                className={cn(
                  'glassmorphism-card p-6 cursor-pointer transition-all duration-200',
                  'hover:scale-[1.02] hover:border-blue-500/50',
                  'flex flex-col items-center text-center space-y-3',
                  isSelected &&
                    'border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/10'
                )}
                aria-pressed={isSelected}
                aria-label={`Select ${config.label}`}
              >
                <Icon
                  className={cn(
                    'h-10 w-10 transition-colors',
                    isSelected ? 'text-blue-400' : 'text-gray-400'
                  )}
                />
                <div>
                  <div className="font-semibold text-base">{config.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {config.wordCount}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {config.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate Button */}
      <div className="section-card">
        <Button
          onClick={() => handleGenerate(false)}
          disabled={!selectedContentType || generateMutation.isPending}
          size="lg"
          className="w-full sm:w-auto"
        >
          {generateMutation.isPending ? (
            <>
              <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Content
            </>
          )}
        </Button>
      </div>

      {/* Error Display */}
      {generateMutation.isError && (
        <div className="section-card">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {generateMutation.error instanceof ContentServiceError
                ? generateMutation.error.message
                : 'Failed to generate content. Please try again.'}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Generated Content Display */}
      {generatedContent && (
        <div className="section-card">
          {/* Content Header with Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-gray-700">
            <div>
              <h3 className="text-xl font-bold">{generatedContent.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {contentTypes.find((t) => t.type === generatedContent.content_type)?.label}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Version {generatedContent.version}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCopy}
                variant="outline"
                size="sm"
                className="min-w-[90px]"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                onClick={handleRegenerate}
                variant="secondary"
                size="sm"
                disabled={generateMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
            </div>
          </div>

          {/* Markdown Content */}
          <div className="glassmorphism-light p-6 rounded-lg">
            <MarkdownRenderer content={generatedContent.content} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Markdown Renderer Component
 * Renders markdown content with proper styling and clickable Fathom links
 */
interface MarkdownRendererProps {
  content: string;
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Simple markdown to HTML conversion
  const renderMarkdown = useCallback((markdown: string): string => {
    return markdown
      // Headers
      .replace(/^### (.*?)$/gm, '<h3 class="text-lg font-semibold text-white mt-6 mb-3">$1</h3>')
      .replace(/^## (.*?)$/gm, '<h2 class="text-xl font-semibold text-white mt-8 mb-4">$1</h2>')
      .replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      // Links (including Fathom timestamp links)
      .replace(
        /\[(.*?)\]\((https?:\/\/[^\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline cursor-pointer">$1</a>'
      )
      // Bullet points
      .replace(/^- (.*?)$/gm, '<li class="ml-4 mb-2">$1</li>')
      // Numbered lists
      .replace(/^\d+\. (.*?)$/gm, '<li class="ml-4 mb-2">$1</li>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p class="mb-4">')
      // Line breaks
      .replace(/\n/g, '<br/>');
  }, []);

  const htmlContent = renderMarkdown(content);

  return (
    <div
      className="prose prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<div>${htmlContent}</div>`) }}
    />
  );
}

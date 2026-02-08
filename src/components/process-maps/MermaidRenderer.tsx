import React, { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import type { StepStatus } from '@/lib/types/processMapTesting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Copy,
  Check,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Code2,
  Loader2,
  AlertCircle,
  Image,
  FileCode2,
  ListOrdered,
  GitBranch,
} from 'lucide-react';
import { toast } from 'sonner';

interface WorkflowStep {
  section: string;
  steps: Array<{
    id: string;
    label: string;
    type: 'start' | 'end' | 'process' | 'decision' | 'data' | 'default';
  }>;
}

interface ParsedDescription {
  summary: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
}

/**
 * Parse a process description into a concise summary (under 60 words)
 * Extracts key section titles and creates a readable overview
 */
function parseDescription(description: string): ParsedDescription {
  const sections: ParsedDescription['sections'] = [];
  let summary = '';

  // Extract the main title (text before first numbered item)
  const titleMatch = description.match(/^([^:]+):/);
  const mainTitle = titleMatch ? titleMatch[1].trim() : '';

  // Split by numbered items (1. 2. 3. etc) to find section titles
  const parts = description.split(/(?=\d+\.\s)/);
  const sectionTitles: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Extract just the section title (e.g., "OAuth Connection" from "1. OAuth Connection: ...")
    const match = trimmed.match(/^(\d+)\.\s*([^:]+):/);
    if (match) {
      sectionTitles.push(match[2].trim());
    }
  }

  // Create a concise summary from section titles
  if (sectionTitles.length > 0) {
    // Group similar concepts
    const keySteps = sectionTitles.slice(0, 5); // Take first 5 key steps
    summary = `Key steps: ${keySteps.join(', ')}${sectionTitles.length > 5 ? `, and ${sectionTitles.length - 5} more` : ''}.`;
  } else if (description) {
    // Fallback: truncate to ~60 words
    const words = description.split(/\s+/);
    if (words.length > 60) {
      summary = words.slice(0, 55).join(' ') + '...';
    } else {
      summary = description;
    }
  }

  return { summary, sections };
}

/**
 * Parse mermaid code to extract human-readable workflow steps
 */
function parseMermaidToSteps(code: string): WorkflowStep[] {
  const sections: WorkflowStep[] = [];
  let currentSection: WorkflowStep | null = null;

  const lines = code.split('\n');

  // Node patterns
  const nodePatterns = [
    { regex: /(\w+)\(\(([^)]+)\)\)/, type: 'start' as const },  // ((Start))
    { regex: /(\w+)\[\[([^\]]+)\]\]/, type: 'end' as const },    // [[End]]
    { regex: /(\w+)\{([^}]+)\}/, type: 'decision' as const },    // {Decision}
    { regex: /(\w+)\[\(([^)]+)\)\]/, type: 'data' as const },    // [(Database)]
    { regex: /(\w+)\[([^\]]+)\]/, type: 'process' as const },    // [Process]
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for subgraph (section)
    const subgraphMatch = trimmed.match(/subgraph\s+(\w+)\s*\["?([^"\]]+)"?\]/);
    if (subgraphMatch) {
      if (currentSection && currentSection.steps.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        section: subgraphMatch[2].replace(/^[^\w]*/, '').trim(), // Remove leading emoji/symbols
        steps: [],
      };
      continue;
    }

    // Check for end of subgraph
    if (trimmed === 'end' && currentSection) {
      if (currentSection.steps.length > 0) {
        sections.push(currentSection);
      }
      currentSection = null;
      continue;
    }

    // Skip non-node lines
    if (trimmed.startsWith('flowchart') || trimmed.startsWith('direction') ||
        trimmed.startsWith('%%') || trimmed.includes('-->') ||
        trimmed.startsWith('classDef') || trimmed.startsWith('class ') ||
        !trimmed) {
      continue;
    }

    // Try to match node definitions
    for (const { regex, type } of nodePatterns) {
      const match = trimmed.match(regex);
      if (match) {
        const id = match[1];
        let label = match[2].replace(/"/g, '').trim();

        // Clean up label
        label = label.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();

        // Skip if no meaningful label or duplicate
        if (!label || label === id) continue;

        const step = { id, label, type };

        if (currentSection) {
          // Avoid duplicates
          if (!currentSection.steps.some(s => s.id === id)) {
            currentSection.steps.push(step);
          }
        } else {
          // Create default section if none exists
          if (sections.length === 0 || sections[sections.length - 1].section !== 'Main Flow') {
            sections.push({ section: 'Main Flow', steps: [] });
          }
          const lastSection = sections[sections.length - 1];
          if (!lastSection.steps.some(s => s.id === id)) {
            lastSection.steps.push(step);
          }
        }
        break;
      }
    }
  }

  // Add any remaining section
  if (currentSection && currentSection.steps.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

// Re-export StepStatus for backward compatibility
export type StepTestStatus = StepStatus;

interface MermaidRendererProps {
  code: string;
  title?: string;
  description?: string;
  className?: string;
  showControls?: boolean;
  showCode?: boolean;
  /** Currently highlighted step ID for test visualization */
  highlightedStepId?: string;
  /** Map of step IDs to their test status */
  stepStatuses?: Map<string, StepTestStatus>;
  /** Callback when a step is clicked in the diagram */
  onStepClick?: (stepId: string) => void;
  /** Enable test mode styling (applies test-specific CSS) */
  testMode?: boolean;
}

/**
 * Sanitize Mermaid code to fix common AI-generated syntax issues
 */
function sanitizeMermaidCode(code: string): string {
  let sanitized = code;

  // Fix 0: Remove any BOM or invisible characters at the start
  sanitized = sanitized.replace(/^\uFEFF/, '').trim();

  // Fix 1: Escape forward slashes in labels that might be interpreted as trapezoid delimiters
  // Pattern: NodeId[/text] or NodeId[text/text] should be NodeId["text with /"]
  // This regex finds bracket content with unquoted slashes
  sanitized = sanitized.replace(
    /\[([^\]"]*\/[^\]"]*)\]/g,
    (match, content) => {
      // If already quoted, leave it alone
      if (content.startsWith('"') && content.endsWith('"')) return match;
      // Wrap content in quotes to escape special characters
      return `["${content}"]`;
    }
  );

  // Fix 2: Fix <br/> followed by special characters that cause lexical errors
  // The issue is when <br/> appears before ] without proper quoting
  sanitized = sanitized.replace(
    /\[([^\]"]*<br\s*\/?>[^\]"]*)\]/gi,
    (match, content) => {
      // If already quoted, leave it alone
      if (content.startsWith('"') && content.endsWith('"')) return match;
      // Wrap content in quotes
      return `["${content}"]`;
    }
  );

  // Fix 3: Ensure labels with dashes surrounded by spaces are quoted
  // Pattern like "NodeId[Text - More Text]" should be "NodeId["Text - More Text"]"
  sanitized = sanitized.replace(
    /\[([^\]"]*\s-\s[^\]"]*)\]/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) return match;
      return `["${content}"]`;
    }
  );

  // Fix 4: Remove any double-double quotes that might result from over-escaping
  sanitized = sanitized.replace(/\[""([^"]+)""\]/g, '["$1"]');

  // Fix 5: Fix labels with colons that can cause issues
  sanitized = sanitized.replace(
    /\[([^\]"]*:[^\]"]*)\]/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) return match;
      return `["${content}"]`;
    }
  );

  // Fix 6: Fix labels with ampersands
  sanitized = sanitized.replace(
    /\[([^\]"]*&[^\]"]*)\]/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) return match;
      return `["${content}"]`;
    }
  );

  // Fix 7: Fix labels with parentheses that aren't shape definitions
  sanitized = sanitized.replace(
    /\[([^\]"]*\([^\)]+\)[^\]"]*)\]/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) return match;
      return `["${content}"]`;
    }
  );

  // Fix 8: Replace smart quotes with regular quotes
  sanitized = sanitized.replace(/[""]/g, '"').replace(/['']/g, "'");

  // Fix 9: Fix common "text" issues where text has special chars
  sanitized = sanitized.replace(
    /\[([^\]"]*[#@!$%^*+=|\\<>?][^\]"]*)\]/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) return match;
      return `["${content}"]`;
    }
  );

  return sanitized;
}

/**
 * MermaidRenderer component that renders Mermaid diagrams client-side.
 * Uses dynamic import to load mermaid library only when needed.
 */
export const MermaidRenderer = memo(function MermaidRenderer({
  code,
  title,
  description,
  className,
  showControls = true,
  showCode = false,
  highlightedStepId,
  stepStatuses,
  onStepClick,
  testMode = false,
}: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showCodePanel, setShowCodePanel] = useState(showCode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'diagram' | 'code' | 'steps'>('diagram');

  // Parse workflow steps from mermaid code
  const workflowSteps = useMemo(() => parseMermaidToSteps(code), [code]);

  // Parse description into structured format
  const parsedDescription = useMemo(() => {
    if (!description) return null;
    return parseDescription(description);
  }, [description]);

  // Initialize and render mermaid diagram
  const renderDiagram = useCallback(async () => {
    if (!code) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Dynamic import of mermaid
      const mermaid = await import('mermaid');

      // Check if dark mode is active
      const isDark = document.documentElement.classList.contains('dark');

      // Initialize mermaid with neutral base theme
      // ClassDef styles in the diagram will override these defaults
      mermaid.default.initialize({
        startOnLoad: false,
        theme: 'base', // Use base theme to allow classDef overrides
        securityLevel: 'strict',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          padding: 20,
          nodeSpacing: 50,
          rankSpacing: 60,
          diagramPadding: 8,
          useMaxWidth: true,
        },
        themeVariables: isDark ? {
          // === DARK MODE BASE THEME ===
          // These are fallbacks - classDef in diagrams will override
          background: 'transparent',

          // Default colors (used when no classDef is applied)
          primaryColor: '#1e293b',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#475569',

          secondaryColor: '#334155',
          secondaryTextColor: '#f1f5f9',
          secondaryBorderColor: '#64748b',

          tertiaryColor: '#475569',
          tertiaryTextColor: '#e2e8f0',
          tertiaryBorderColor: '#94a3b8',

          // Lines and arrows
          lineColor: '#94a3b8',

          // Text colors
          textColor: '#f8fafc',
          mainBkg: 'transparent',

          // Node defaults
          nodeBkg: '#1e293b',
          nodeBorder: '#475569',
          nodeTextColor: '#f8fafc',

          // Cluster/subgraph styling
          clusterBkg: 'rgba(30, 41, 59, 0.8)',
          clusterBorder: 'rgba(71, 85, 105, 0.6)',
          titleColor: '#f8fafc',

          // Edge labels
          edgeLabelBackground: 'rgba(15, 23, 42, 0.95)',

          // Fonts
          fontSize: '14px',
        } : {
          // === LIGHT MODE BASE THEME ===
          // These are fallbacks - classDef in diagrams will override
          background: 'transparent',

          // Default colors
          primaryColor: '#e0e7ff',
          primaryTextColor: '#312e81',
          primaryBorderColor: '#4f46e5',

          secondaryColor: '#f1f5f9',
          secondaryTextColor: '#334155',
          secondaryBorderColor: '#64748b',

          tertiaryColor: '#ecfdf5',
          tertiaryTextColor: '#064e3b',
          tertiaryBorderColor: '#059669',

          // Lines and arrows
          lineColor: '#94a3b8',

          // Text colors
          textColor: '#1e293b',
          mainBkg: 'transparent',

          // Node defaults
          nodeBkg: '#ffffff',
          nodeBorder: '#cbd5e1',
          nodeTextColor: '#1e293b',

          // Cluster/subgraph styling
          clusterBkg: '#f8fafc',
          clusterBorder: '#cbd5e1',
          titleColor: '#475569',

          // Edge labels
          edgeLabelBackground: '#ffffff',

          // Fonts
          fontSize: '14px',
        },
      });

      // Generate unique ID for this diagram
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Sanitize the code to fix common AI-generated syntax issues
      const sanitizedCode = sanitizeMermaidCode(code);

      // Render the diagram
      const { svg } = await mermaid.default.render(id, sanitizedCode);
      setSvgContent(svg);
    } catch (err) {
      console.error('Mermaid render error:', err);
      setError(err instanceof Error ? err.message : 'Failed to render diagram');
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Re-render on code change
  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  // Re-render on theme change
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          renderDiagram();
          break;
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [renderDiagram]);

  // Apply step highlighting for test mode
  useEffect(() => {
    if (!containerRef.current || !svgContent || !testMode) return;

    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;

    // Debug: Log stepStatuses
    if (stepStatuses && stepStatuses.size > 0) {
      console.log('[MermaidRenderer] stepStatuses:', Array.from(stepStatuses.entries()));
    }
    if (highlightedStepId) {
      console.log('[MermaidRenderer] highlightedStepId:', highlightedStepId);
    }

    // Get all node groups in the SVG
    // Mermaid uses various patterns for node IDs
    const nodes = svg.querySelectorAll('[id^="flowchart-"], [class*="node"]');

    // Debug: Log all found nodes
    console.log('[MermaidRenderer] Found nodes:', nodes.length, Array.from(nodes).map(n => (n as SVGElement).id));

    nodes.forEach((node) => {
      const element = node as SVGElement;
      const nodeId = element.id || '';

      // Extract the step ID from the node ID
      // Mermaid generates IDs like "flowchart-NodeId-123"
      const stepIdMatch = nodeId.match(/flowchart-([^-]+)/);
      const stepId = stepIdMatch ? stepIdMatch[1] : '';

      if (!stepId) return;

      // Remove any existing test status classes
      element.classList.remove(
        'test-step-pending',
        'test-step-running',
        'test-step-passed',
        'test-step-failed',
        'test-step-skipped',
        'test-step-highlighted'
      );

      // Apply status class if available
      if (stepStatuses?.has(stepId)) {
        const status = stepStatuses.get(stepId);
        element.classList.add(`test-step-${status}`);
      }

      // Apply highlighted class for current step
      if (highlightedStepId === stepId) {
        element.classList.add('test-step-highlighted');
      }

      // Add click handler if callback provided
      if (onStepClick) {
        element.style.cursor = 'pointer';
        element.onclick = (e) => {
          e.stopPropagation();
          onStepClick(stepId);
        };
      }
    });

    // Also try to match nodes by their label/text content for more robust matching
    const allGroups = svg.querySelectorAll('g.node, g[class*="node"]');
    allGroups.forEach((group) => {
      const element = group as SVGElement;

      // Try to find the node ID from data attributes or parent elements
      let stepId = '';

      // Check for id attribute patterns
      const idAttr = element.getAttribute('id') || '';
      const match = idAttr.match(/flowchart-([^-]+)/);
      if (match) {
        stepId = match[1];
      }

      if (!stepId) return;

      // Apply status class
      if (stepStatuses?.has(stepId)) {
        const status = stepStatuses.get(stepId);

        // Find the shape element (rect, circle, polygon) within the group
        const shape = element.querySelector('rect, circle, polygon, path, ellipse');
        if (shape) {
          shape.classList.add(`test-step-shape-${status}`);
        }
      }

      // Highlight current step
      if (highlightedStepId === stepId) {
        const shape = element.querySelector('rect, circle, polygon, path, ellipse');
        if (shape) {
          shape.classList.add('test-step-shape-highlighted');
        }
      }
    });
  }, [svgContent, stepStatuses, highlightedStepId, onStepClick, testMode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Mermaid code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy code');
    }
  }, [code]);

  const handleDownloadSvg = useCallback(() => {
    if (!svgContent) return;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title?.replace(/\s+/g, '-').toLowerCase() || 'process-map'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('SVG downloaded');
  }, [svgContent, title]);

  const handleDownloadPng = useCallback(async () => {
    if (!svgContent || !containerRef.current) return;

    try {
      // Create canvas from SVG
      const svgElement = containerRef.current.querySelector('svg');
      if (!svgElement) {
        toast.error('No SVG element found');
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        toast.error('Canvas not supported');
        return;
      }

      // Clone SVG and inline all styles for proper rendering
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;

      // Get computed styles and inline them
      const allElements = clonedSvg.querySelectorAll('*');
      allElements.forEach((el) => {
        const computedStyle = window.getComputedStyle(el as Element);
        const styleString = Array.from(computedStyle)
          .filter(prop => ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'color', 'opacity'].includes(prop))
          .map(prop => `${prop}:${computedStyle.getPropertyValue(prop)}`)
          .join(';');
        if (styleString) {
          (el as HTMLElement).setAttribute('style', styleString);
        }
      });

      // Ensure SVG has explicit dimensions
      const svgRect = svgElement.getBoundingClientRect();
      const width = svgRect.width || 800;
      const height = svgRect.height || 600;

      clonedSvg.setAttribute('width', String(width));
      clonedSvg.setAttribute('height', String(height));

      // Add xmlns if missing
      if (!clonedSvg.getAttribute('xmlns')) {
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }

      const scale = 4; // High resolution for readable text when zoomed
      canvas.width = width * scale;
      canvas.height = height * scale;

      // Serialize SVG with proper encoding
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);
      const encodedSvg = encodeURIComponent(svgString)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');

      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

      // Create image from SVG (use window.Image to avoid conflict with lucide-react Image icon)
      const img = new window.Image();

      img.onload = () => {
        // Fill background
        ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#1f2937' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);

        // Download
        try {
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `${title?.replace(/\s+/g, '-').toLowerCase() || 'process-map'}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success('PNG downloaded');
        } catch (canvasErr) {
          console.error('Canvas export error:', canvasErr);
          toast.error('Failed to export PNG - try downloading SVG instead');
        }
      };

      img.onerror = (err) => {
        console.error('Image load error:', err);
        toast.error('Failed to load SVG for PNG conversion - try downloading SVG instead');
      };

      img.src = dataUrl;
    } catch (err) {
      console.error('PNG download error:', err);
      toast.error('Failed to download PNG');
    }
  }, [svgContent, title]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const handleFullscreen = useCallback(async () => {
    if (!cardRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await cardRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
      toast.error('Fullscreen not supported');
    }
  }, []);

  // Listen for fullscreen changes (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <Card
      ref={cardRef}
      className={cn(
        testMode ? 'overflow-auto h-full flex flex-col' : 'overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50 rounded-none bg-background',
        className
      )}
    >
      {(title || description) && (
        <CardHeader className="pb-3">
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {parsedDescription?.summary && (
            <CardDescription className="text-sm">{parsedDescription.summary}</CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className={cn('p-0', testMode && 'flex flex-col h-full')}>
        {/* Controls */}
        {showControls && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 0.25}
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetZoom}
                disabled={zoom === 1}
                title="Reset zoom"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCodePanel(!showCodePanel)}
                title={showCodePanel ? 'Hide code' : 'Show code'}
              >
                <Code2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                title="Copy Mermaid code"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadSvg}
                disabled={!svgContent}
                title="Download as SVG (vector)"
              >
                <FileCode2 className="h-4 w-4" />
                <span className="ml-1 text-xs hidden sm:inline">SVG</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadPng}
                disabled={!svgContent}
                title="Download as PNG (image)"
              >
                <Image className="h-4 w-4" />
                <span className="ml-1 text-xs hidden sm:inline">PNG</span>
              </Button>
            </div>
          </div>
        )}

        {/* Diagram container */}
        <div className="relative">
          {loading && (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground">Failed to render diagram</p>
              <p className="text-xs text-destructive mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && svgContent && (
            <div
              ref={containerRef}
              className={cn(
                'overflow-auto p-4 mermaid-dark-text-override',
                testMode && 'flex-1 min-h-0 h-full'
              )}
              style={{
                maxHeight: isFullscreen ? 'calc(100vh - 120px)' : testMode ? 'none' : '600px',
                minHeight: testMode ? '200px' : undefined,
              }}
            >
              {/* CSS enhancements for Mermaid diagrams - let classDef handle node colors */}
              <style>{`
                /* Edge labels in dark mode need better contrast */
                .dark .mermaid-dark-text-override .edgeLabel,
                .dark .mermaid-dark-text-override .edgeLabel text,
                .dark .mermaid-dark-text-override .edgeLabel span {
                  color: #F3F4F6 !important;
                  fill: #F3F4F6 !important;
                  background-color: rgba(17, 24, 39, 0.95) !important;
                }

                /* Subgraph/cluster styling for dark mode */
                .dark .mermaid-dark-text-override .cluster rect {
                  fill: rgba(30, 41, 59, 0.8) !important;
                  stroke: rgba(71, 85, 105, 0.6) !important;
                }
                .dark .mermaid-dark-text-override .cluster .nodeLabel,
                .dark .mermaid-dark-text-override .cluster-label,
                .dark .mermaid-dark-text-override .cluster text {
                  fill: #F3F4F6 !important;
                  color: #F3F4F6 !important;
                }

                /* Arrow/link styling for dark mode */
                .dark .mermaid-dark-text-override .flowchart-link {
                  stroke: #94a3b8 !important;
                }
                .dark .mermaid-dark-text-override marker path {
                  fill: #94a3b8 !important;
                  stroke: #94a3b8 !important;
                }

                /* Ensure diagram background is transparent */
                .mermaid-dark-text-override svg {
                  background: transparent !important;
                }

                /* ============================================
                   TEST MODE - Step Highlighting Styles
                   ============================================ */

                /* Keyframe animations */
                @keyframes test-step-pulse {
                  0%, 100% {
                    opacity: 1;
                    filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.6));
                  }
                  50% {
                    opacity: 0.85;
                    filter: drop-shadow(0 0 16px rgba(59, 130, 246, 0.9));
                  }
                }

                @keyframes test-step-success-glow {
                  0% { filter: drop-shadow(0 0 0px rgba(34, 197, 94, 0)); }
                  50% { filter: drop-shadow(0 0 10px rgba(34, 197, 94, 0.6)); }
                  100% { filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.3)); }
                }

                @keyframes test-step-fail-shake {
                  0%, 100% { transform: translateX(0); }
                  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
                  20%, 40%, 60%, 80% { transform: translateX(2px); }
                }

                /* Pending state - muted appearance */
                .test-step-pending rect,
                .test-step-pending circle,
                .test-step-pending polygon,
                .test-step-pending ellipse,
                .test-step-shape-pending {
                  opacity: 0.5 !important;
                }

                /* Running state - blue with pulse animation */
                .test-step-running rect,
                .test-step-running circle,
                .test-step-running polygon,
                .test-step-running ellipse,
                .test-step-shape-running {
                  fill: #3B82F6 !important;
                  stroke: #1D4ED8 !important;
                  stroke-width: 3px !important;
                  animation: test-step-pulse 1.5s ease-in-out infinite !important;
                }
                .test-step-running .nodeLabel,
                .test-step-running text {
                  fill: #ffffff !important;
                }

                /* Passed state - green with success animation */
                .test-step-passed rect,
                .test-step-passed circle,
                .test-step-passed polygon,
                .test-step-passed ellipse,
                .test-step-shape-passed {
                  fill: #22C55E !important;
                  stroke: #15803D !important;
                  stroke-width: 2px !important;
                  animation: test-step-success-glow 0.6s ease-out forwards !important;
                  transition: fill 0.3s ease, stroke 0.3s ease !important;
                }
                .test-step-passed .nodeLabel,
                .test-step-passed text {
                  fill: #ffffff !important;
                }

                /* Failed state - red with shake animation */
                .test-step-failed rect,
                .test-step-failed circle,
                .test-step-failed polygon,
                .test-step-failed ellipse,
                .test-step-shape-failed {
                  fill: #EF4444 !important;
                  stroke: #B91C1C !important;
                  stroke-width: 3px !important;
                  animation: test-step-fail-shake 0.5s ease-in-out !important;
                }
                .test-step-failed .nodeLabel,
                .test-step-failed text {
                  fill: #ffffff !important;
                }

                /* Skipped state - gray/muted */
                .test-step-skipped rect,
                .test-step-skipped circle,
                .test-step-skipped polygon,
                .test-step-skipped ellipse,
                .test-step-shape-skipped {
                  fill: #9CA3AF !important;
                  stroke: #6B7280 !important;
                  opacity: 0.6 !important;
                }
                .test-step-skipped .nodeLabel,
                .test-step-skipped text {
                  fill: #374151 !important;
                }

                /* Highlighted state - strong border glow effect */
                .test-step-highlighted rect,
                .test-step-highlighted circle,
                .test-step-highlighted polygon,
                .test-step-highlighted ellipse,
                .test-step-shape-highlighted {
                  stroke-width: 4px !important;
                  filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.8)) !important;
                }

                /* Dark mode adjustments for test states */
                .dark .test-step-pending rect,
                .dark .test-step-pending circle,
                .dark .test-step-pending polygon,
                .dark .test-step-pending ellipse,
                .dark .test-step-shape-pending {
                  opacity: 0.4 !important;
                }

                .dark .test-step-skipped .nodeLabel,
                .dark .test-step-skipped text {
                  fill: #D1D5DB !important;
                }

                /* Hover effects for clickable steps */
                .mermaid-dark-text-override g[style*="cursor: pointer"]:hover rect,
                .mermaid-dark-text-override g[style*="cursor: pointer"]:hover circle,
                .mermaid-dark-text-override g[style*="cursor: pointer"]:hover polygon {
                  filter: brightness(1.1) !important;
                  transition: filter 0.2s ease !important;
                }
              `}</style>
              <div
                className="transition-transform duration-200 origin-top-left"
                style={{
                  transform: `scale(${zoom})`,
                }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
              />
            </div>
          )}
        </div>

        {/* Tabbed panel for Code and Steps */}
        {showCodePanel && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'diagram' | 'code' | 'steps')}>
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/50">
                <TabsList className="h-8">
                  <TabsTrigger value="diagram" className="text-xs px-3 py-1 h-6">
                    <GitBranch className="h-3 w-3 mr-1" />
                    Diagram
                  </TabsTrigger>
                  <TabsTrigger value="code" className="text-xs px-3 py-1 h-6">
                    <Code2 className="h-3 w-3 mr-1" />
                    Code
                  </TabsTrigger>
                  <TabsTrigger value="steps" className="text-xs px-3 py-1 h-6">
                    <ListOrdered className="h-3 w-3 mr-1" />
                    Steps
                  </TabsTrigger>
                </TabsList>
                {activeTab === 'code' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-6"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>

              <TabsContent value="diagram" className="mt-0">
                {/* Diagram is shown above, this tab just hides the code/steps panels */}
              </TabsContent>

              <TabsContent value="code" className="mt-0">
                <pre className="p-4 text-xs overflow-auto max-h-64 bg-gray-900 text-gray-100">
                  <code>{code}</code>
                </pre>
              </TabsContent>

              <TabsContent value="steps" className="mt-0">
                <div className="p-4 overflow-auto max-h-64 bg-gray-50 dark:bg-gray-900/50">
                  {workflowSteps.length > 0 ? (
                    <div className="space-y-4">
                      {workflowSteps.map((section, sectionIndex) => (
                        <div key={sectionIndex}>
                          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {sectionIndex + 1}
                            </span>
                            {section.section}
                          </h4>
                          <ol className="space-y-1.5 ml-7">
                            {section.steps.map((step, stepIndex) => (
                              <li key={step.id} className="flex items-start gap-2 text-sm">
                                <span className="text-muted-foreground text-xs min-w-[1.5rem]">
                                  {sectionIndex + 1}.{stepIndex + 1}
                                </span>
                                <span className={cn(
                                  'flex-1',
                                  step.type === 'start' && 'text-green-600 dark:text-green-400 font-medium',
                                  step.type === 'end' && 'text-red-600 dark:text-red-400 font-medium',
                                  step.type === 'decision' && 'text-amber-600 dark:text-amber-400',
                                  step.type === 'data' && 'text-blue-600 dark:text-blue-400',
                                )}>
                                  {step.label}
                                  {step.type === 'decision' && (
                                    <span className="ml-1 text-xs text-muted-foreground">(decision)</span>
                                  )}
                                  {step.type === 'data' && (
                                    <span className="ml-1 text-xs text-muted-foreground">(data store)</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No workflow steps detected in this diagram.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default MermaidRenderer;

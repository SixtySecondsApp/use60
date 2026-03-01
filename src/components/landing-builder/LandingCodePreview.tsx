/**
 * Landing Code Preview
 *
 * Renders React + Tailwind code in a sandboxed iframe using CDN-loaded
 * React, ReactDOM, Babel, and Tailwind. Toggles between preview and code view.
 *
 * Handles common AI-generated code patterns:
 * - Strips TypeScript type annotations
 * - Stubs lucide-react icons as SVG placeholders
 * - Stubs framer-motion as pass-through divs
 * - Loads Google Fonts referenced in the code
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Eye, Code, Maximize2, Minimize2, Copy, Check, Smartphone, Monitor, Tablet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LandingCodePreviewProps {
  code: string;
}

type ViewMode = 'preview' | 'code';
type DeviceWidth = 'mobile' | 'tablet' | 'desktop';

const DEVICE_WIDTHS: Record<DeviceWidth, string> = {
  mobile: '375px',
  tablet: '768px',
  desktop: '100%',
};

/**
 * Extract Google Font names from code to load them in the iframe.
 */
function extractGoogleFonts(code: string): string[] {
  const fonts = new Set<string>();
  // Match font-family references like 'Space Grotesk', "Inter", etc.
  const fontPatterns = [
    /fontFamily:\s*['"`]([A-Z][a-z]+(?: [A-Z][a-z]+)*)['"`]/g,
    /font-family:\s*['"`]([A-Z][a-z]+(?: [A-Z][a-z]+)*)['"`]/g,
    /'(Space Grotesk|Space Mono|Inter|Poppins|Montserrat|Roboto|Open Sans|Lato|Raleway|Playfair Display|DM Sans|Plus Jakarta Sans|Manrope|Outfit|Sora|Lexend)'/gi,
  ];

  for (const pattern of fontPatterns) {
    for (const match of code.matchAll(pattern)) {
      const fontName = match[1].trim();
      if (fontName && fontName !== 'system' && fontName !== 'sans' && fontName !== 'serif') {
        fonts.add(fontName);
      }
    }
  }

  return Array.from(fonts);
}

/**
 * Strip import statements, export default, TypeScript annotations.
 * Extract the component name. Stub external dependencies.
 */
function prepareForPreview(code: string): { cleaned: string; componentName: string } {
  // Work line-by-line for import/type stripping to avoid greedy regex eating code
  const lines = code.split('\n');
  const outputLines: string[] = [];
  let inTypeBlock = false;
  let braceDepth = 0;

  // Find the component name BEFORE stripping (more patterns in raw code)
  const exportDefaultFn = code.match(/export\s+default\s+function\s+(\w+)/);
  const exportConstArrow = code.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*React\.FC[^=]*)?\s*=\s*(?:\([^)]*\)|[^=])\s*=>/);
  const exportConstFn2 = code.match(/export\s+default\s+(\w+)\s*;/);
  const namedExportFn = code.match(/export\s+function\s+(\w+)/);
  const plainFunctionComponent = code.match(/function\s+([A-Z]\w+)\s*\(/);
  const componentName =
    exportDefaultFn?.[1] ||
    exportConstArrow?.[1] ||
    exportConstFn2?.[1] ||
    namedExportFn?.[1] ||
    plainFunctionComponent?.[1] ||
    'App';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip import lines (single or multi-line)
    if (trimmed.startsWith('import ')) {
      // Multi-line import: count braces
      if (trimmed.includes('{') && !trimmed.includes('}')) {
        inTypeBlock = true;
      }
      continue;
    }
    if (inTypeBlock) {
      if (trimmed.includes('}')) inTypeBlock = false;
      continue;
    }

    // Skip standalone interface/type blocks
    if (/^(?:export\s+)?(?:interface|type)\s+\w+/.test(trimmed)) {
      braceDepth = 0;
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth > 0) {
        inTypeBlock = true;
      }
      // Single-line type: type Foo = string;
      continue;
    }
    if (inTypeBlock) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) inTypeBlock = false;
      continue;
    }

    outputLines.push(line);
  }

  let cleaned = outputLines.join('\n');

  // Strip TypeScript annotations from the remaining code
  // `: React.FC<Props>` on const declarations
  cleaned = cleaned.replace(/:\s*React\.FC(?:<[^>]*>)?/g, '');
  // `: Type` annotations on function params and return types
  cleaned = cleaned.replace(/:\s*(?:React\.\w+|string|number|boolean|void|any|null|undefined|Record<[^>]*>|Array<[^>]*>|\w+\[\])(?:\s*\|\s*(?:\w+|null|undefined))*/g, '');
  // Generic type params: function Foo<T>(...) → function Foo(...)
  cleaned = cleaned.replace(/(function\s+\w+)\s*<[^>]+>/g, '$1');
  // `as Type` assertions
  cleaned = cleaned.replace(/\s+as\s+\w+(?:<[^>]*>)?/g, '');
  // Remaining angle-bracket generics on useState etc: useState<string>('') → useState('')
  cleaned = cleaned.replace(/(useState|useRef|useMemo|useCallback|useContext|createContext)\s*<[^>]*>/g, '$1');

  // Remove "export default" but keep the function/const
  cleaned = cleaned.replace(/export\s+default\s+function/, 'function');
  cleaned = cleaned.replace(/^export\s+default\s+\w+\s*;?\s*$/gm, '');
  cleaned = cleaned.replace(/^export\s+/gm, '');

  return { cleaned, componentName };
}

/**
 * Build icon stubs for lucide-react icons referenced in the code.
 */
function buildIconStubs(code: string): string {
  // Find all PascalCase identifiers used as JSX tags that look like icons
  const iconMatches = code.matchAll(/<(\w+)\s+(?:className|class)/g);
  const lucideIcons = new Set<string>();
  for (const match of iconMatches) {
    const name = match[1];
    // Heuristic: PascalCase, not HTML elements, not the component itself
    if (name && /^[A-Z]/.test(name) && !['React', 'Fragment'].includes(name)) {
      // Check if it looks like an icon (short name, not a section component)
      if (name.length < 25 && !name.includes('Section') && !name.includes('Layout')) {
        lucideIcons.add(name);
      }
    }
  }

  if (lucideIcons.size === 0) return '';

  // Create stub components that render simple SVG placeholders
  const stubs = Array.from(lucideIcons).map(
    (name) =>
      `var ${name} = function(props) { return React.createElement('svg', Object.assign({ width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, props), React.createElement('circle', { cx: 12, cy: 12, r: 10 })); };`,
  );

  return stubs.join('\n');
}

export const LandingCodePreview: React.FC<LandingCodePreviewProps> = ({ code }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [expanded, setExpanded] = useState(false);
  const [deviceWidth, setDeviceWidth] = useState<DeviceWidth>('desktop');
  const [copied, setCopied] = useState(false);

  const { cleaned, componentName } = useMemo(() => prepareForPreview(code), [code]);
  const iconStubs = useMemo(() => buildIconStubs(cleaned), [cleaned]);
  const googleFonts = useMemo(() => extractGoogleFonts(code), [code]);

  // Build Google Fonts link
  const fontsLink = useMemo(() => {
    if (googleFonts.length === 0) return '';
    const families = googleFonts
      .map((f) => `family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700`)
      .join('&');
    return `<link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet" />`;
  }, [googleFonts]);

  // Escape code for embedding in HTML script tag
  const escapedCode = useMemo(() => {
    return cleaned
      .replace(new RegExp('</scr' + 'ipt>', 'gi'), '</scr' + 'ipt>');
  }, [cleaned]);

  const srcDoc = useMemo(() => {
    // Use template with explicit string concatenation to avoid escaping issues
    const escapedIconStubs = iconStubs
      .replace(new RegExp('</scr' + 'ipt>', 'gi'), '</scr' + 'ipt>');

    // Use string concatenation for closing script tags to avoid HTML parser issues
    const endScript = '</scr' + 'ipt>';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${fontsLink}
  <script src="https://unpkg.com/react@18/umd/react.production.min.js">${endScript}
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js">${endScript}
  <script src="https://unpkg.com/@babel/standalone/babel.min.js">${endScript}
  <script src="https://cdn.tailwindcss.com">${endScript}
  <script>
    // Configure Tailwind with custom fonts
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            ${googleFonts.map(f => `'${f.toLowerCase().replace(/\s+/g, '-')}': ['${f}', 'system-ui', 'sans-serif']`).join(',\n            ')}
          }
        }
      }
    };
  </script>
  <style>
    body { margin: 0; font-family: ${googleFonts[1] ? `'${googleFonts[1]}'` : 'system-ui'}, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
    img { max-width: 100%; height: auto; }
    #error-overlay {
      display: none;
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.9);
      color: #ff6b6b;
      padding: 2rem;
      font-family: monospace;
      font-size: 13px;
      white-space: pre-wrap;
      z-index: 9999;
      overflow: auto;
    }
    #error-overlay .dismiss {
      position: absolute; top: 1rem; right: 1rem;
      color: white; cursor: pointer; font-size: 20px;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="error-overlay"><span class="dismiss" onclick="this.parentElement.style.display='none'">&times;</span></div>
  <script>
    // Stub framer-motion with real CSS animations
    // Converts framer-motion initial/animate/whileInView props into CSS transitions
    var fmProps = ['initial','animate','exit','transition','whileInView','viewport',
      'whileHover','whileTap','whileFocus','whileDrag','variants','layout',
      'layoutId','onAnimationStart','onAnimationComplete','drag','dragConstraints',
      'dragElastic','dragMomentum'];

    function fmStyleFromProps(animProps) {
      if (!animProps || typeof animProps !== 'object') return {};
      var style = {};
      if (animProps.opacity !== undefined) style.opacity = animProps.opacity;
      if (animProps.y !== undefined) style.transform = (style.transform || '') + ' translateY(' + animProps.y + 'px)';
      if (animProps.x !== undefined) style.transform = (style.transform || '') + ' translateX(' + animProps.x + 'px)';
      if (animProps.scale !== undefined) style.transform = (style.transform || '') + ' scale(' + animProps.scale + ')';
      if (animProps.rotate !== undefined) style.transform = (style.transform || '') + ' rotate(' + animProps.rotate + 'deg)';
      return style;
    }

    function fmTransitionCSS(trans) {
      var dur = (trans && trans.duration) || 0.5;
      var delay = (trans && trans.delay) || 0;
      var ease = 'cubic-bezier(0.4, 0, 0.2, 1)';
      if (trans && trans.ease === 'easeOut') ease = 'cubic-bezier(0, 0, 0.2, 1)';
      if (trans && trans.ease === 'easeIn') ease = 'cubic-bezier(0.4, 0, 1, 1)';
      if (trans && trans.ease === 'easeInOut') ease = 'cubic-bezier(0.4, 0, 0.6, 1)';
      if (trans && trans.type === 'spring') { dur = trans.duration || 0.6; ease = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; }
      return 'all ' + dur + 's ' + ease + ' ' + delay + 's';
    }

    window.motion = new Proxy({}, {
      get: function(target, prop) {
        return function(props) {
          if (!props) props = {};
          var children = props.children;
          var cleaned = {};
          for (var key in props) {
            if (key !== 'children' && key !== 'style' && fmProps.indexOf(key) === -1) {
              cleaned[key] = props[key];
            }
          }

          var initialStyle = fmStyleFromProps(props.initial);
          var animateStyle = fmStyleFromProps(props.animate || props.whileInView);
          var transCSS = fmTransitionCSS(props.transition);
          var userStyle = props.style || {};
          var useInView = !!props.whileInView;
          var viewOnce = props.viewport && props.viewport.once !== false;

          // Start with initial styles, transition to animate on mount or in-view
          var startStyle = Object.assign({}, userStyle, initialStyle, { transition: transCSS });

          var ref = React.useRef(null);
          var mountedRef = React.useRef(false);
          var triggeredRef = React.useRef(false);
          var forceUpdate = React.useState(0)[1];

          React.useEffect(function() {
            var el = ref.current;
            if (!el) return;

            if (useInView) {
              // Use IntersectionObserver for whileInView
              var obs = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                  if (entry.isIntersecting && !triggeredRef.current) {
                    triggeredRef.current = true;
                    requestAnimationFrame(function() {
                      var s = fmStyleFromProps(props.whileInView);
                      el.style.transition = transCSS;
                      if (s.opacity !== undefined) el.style.opacity = s.opacity;
                      if (s.transform) el.style.transform = s.transform;
                    });
                    if (viewOnce) obs.disconnect();
                  }
                });
              }, { threshold: 0.1 });
              obs.observe(el);
              return function() { obs.disconnect(); };
            } else if (!mountedRef.current) {
              // Animate on mount
              mountedRef.current = true;
              requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                  var s = fmStyleFromProps(props.animate);
                  el.style.transition = transCSS;
                  if (s.opacity !== undefined) el.style.opacity = s.opacity;
                  if (s.transform) el.style.transform = s.transform;
                });
              });
            }
          }, []);

          cleaned.ref = ref;
          cleaned.style = startStyle;

          return React.createElement(prop, cleaned, children);
        };
      }
    });
    // Stub AnimatePresence
    window.AnimatePresence = function(props) { return props.children; };
    // Stub useInView (framer-motion hook)
    window.useInView = function(ref, opts) {
      var inView = React.useState(false);
      React.useEffect(function() {
        if (!ref || !ref.current) return;
        var obs = new IntersectionObserver(function(entries) {
          entries.forEach(function(e) { if (e.isIntersecting) inView[1](true); });
        }, { threshold: 0.1 });
        obs.observe(ref.current);
        return function() { obs.disconnect(); };
      }, [ref]);
      return inView[0];
    };
    // Stub useAnimation
    window.useAnimation = function() { return { start: function() {} }; };
    // Stub useScroll
    window.useScroll = function() { return { scrollY: { get: function() { return 0; } }, scrollYProgress: { get: function() { return 0; } } }; };
    // Stub useTransform
    window.useTransform = function(val, inp, out) { return out ? out[0] : 0; };
    // Stub useMotionValue
    window.useMotionValue = function(v) { return { get: function() { return v; }, set: function() {} }; };
    // Stub useSpring
    window.useSpring = function(v) { return v; };
  </script>
  <script type="text/babel" data-presets="react">
    const { useState, useEffect, useRef, useCallback, useMemo, Fragment, createContext, useContext } = React;

    // Icon stubs
    ${escapedIconStubs}

    // Component code
    ${escapedCode}

    try {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(${componentName}));
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<div style="padding:2rem;color:#ff6b6b;font-family:monospace;font-size:13px">' +
        '<p style="font-weight:bold;margin-bottom:8px">Preview Error</p>' +
        '<p>' + (err.message || err) + '</p></div>';
    }
  ${endScript}
  <script>
    window.onerror = function(msg, url, line, col, err) {
      var el = document.getElementById('error-overlay');
      if (el) {
        el.style.display = 'block';
        el.innerHTML = '<span class="dismiss" onclick="this.parentElement.style.display=\\'none\\'">&times;</span>Preview Error:\\n\\n' + msg + (line ? '\\nLine: ' + line : '');
      }
    };
  ${endScript}
</body>
</html>`;
  }, [escapedCode, iconStubs, componentName, fontsLink, googleFonts]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [code]);

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-all',
      'border-gray-200 dark:border-gray-700',
      expanded && 'fixed inset-4 z-50 shadow-2xl',
    )}>
      {/* Expanded backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Toolbar */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b',
        'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700',
        expanded && 'relative z-50',
      )}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'preview'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'code'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            <Code className="w-3.5 h-3.5" />
            Code
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Device width toggles (preview only) */}
          {viewMode === 'preview' && (
            <div className="flex items-center gap-0.5 mr-2">
              <button
                type="button"
                onClick={() => setDeviceWidth('mobile')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  deviceWidth === 'mobile' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600',
                )}
                title="Mobile (375px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceWidth('tablet')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  deviceWidth === 'tablet' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600',
                )}
                title="Tablet (768px)"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceWidth('desktop')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  deviceWidth === 'desktop' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600',
                )}
                title="Desktop (full width)"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={expanded ? 'Minimize' : 'Expand'}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={cn(
        expanded && 'relative z-50 bg-white dark:bg-gray-950',
      )}>
        {viewMode === 'preview' ? (
          <div className="flex justify-center bg-gray-100 dark:bg-gray-950">
            <iframe
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-same-origin"
              title="Landing Page Preview"
              className={cn(
                'bg-white border-0 transition-all duration-300',
                expanded ? 'h-[calc(100vh-8rem)]' : 'h-[600px]',
              )}
              style={{ width: DEVICE_WIDTHS[deviceWidth] }}
            />
          </div>
        ) : (
          <pre className={cn(
            'overflow-auto p-4 text-sm',
            'bg-gray-950 text-gray-300',
            expanded ? 'h-[calc(100vh-8rem)]' : 'max-h-[600px]',
          )}>
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
};

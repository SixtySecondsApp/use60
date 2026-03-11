/**
 * ReactSectionRenderer
 *
 * Renders LandingSection[] as React components inside a react-frame-component
 * iframe. Injects Tailwind CDN, Google Fonts, and animation CSS into the frame head.
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import Frame, { FrameContextConsumer } from 'react-frame-component';
import { getSectionComponent } from './sections';
import { SectionDivider } from './sections/shared';
import { InlineEditController } from './sections/shared/InlineEditController';
import { fontUrl, generateBaseStyles, generateScrollScript } from './brandStyles';
import type { LandingSection, BrandConfig } from './types';

interface ReactSectionRendererProps {
  sections: LandingSection[];
  brandConfig: BrandConfig;
  onSectionClick?: (sectionId: string) => void;
  showDividers?: boolean;
  onSectionUpdate?: (sectionId: string, updates: Partial<LandingSection>) => void;
  onRegenerateAsset?: (sectionId: string, assetType: 'image' | 'svg') => void;
  onUploadAsset?: (sectionId: string, file: File) => Promise<string>;
  className?: string;
}

export function ReactSectionRenderer({
  sections,
  brandConfig,
  onSectionClick,
  showDividers = true,
  onSectionUpdate,
  onRegenerateAsset,
  onUploadAsset,
  className = '',
}: ReactSectionRendererProps) {
  const sorted = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections],
  );

  const initialContent = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${fontUrl(brandConfig)}" rel="stylesheet" />
  <style>${generateBaseStyles(brandConfig)}</style>
</head>
<body style="margin:0;background-color:${brandConfig.bg_color};color:${brandConfig.text_color};">
  <div id="root"></div>
</body>
</html>`;
  }, [brandConfig]);

  return (
    <Frame
      initialContent={initialContent}
      mountTarget="#root"
      className={`w-full h-full border-0 ${className}`}
      sandbox="allow-scripts allow-same-origin"
    >
      <FrameContextConsumer>
        {({ document: frameDoc }: { document: Document | null }) => (
          <>
            <ScrollRevealInjector document={frameDoc} />
            {onSectionUpdate && (
              <InlineEditController
                frameDocument={frameDoc}
                sections={sorted}
                onSectionUpdate={onSectionUpdate}
                onRegenerateAsset={onRegenerateAsset}
                onUploadAsset={onUploadAsset}
              />
            )}
            {sorted.map((section, index) => {
              const Component = getSectionComponent(section.type, section.layout_variant);
              const nextSection = sorted[index + 1];
              const nextDivider = nextSection?.divider;
              const hasOutgoingDivider = nextDivider && nextDivider !== 'none';

              return (
                <div
                  key={section.id}
                  style={{
                    position: 'relative',
                    zIndex: sorted.length - index,
                  }}
                >
                  <Component
                    section={section}
                    onSectionClick={onSectionClick ? () => onSectionClick(section.id) : undefined}
                  />
                  {/* Shape divider at the bottom of this section, bridging into the next */}
                  {showDividers && hasOutgoingDivider && nextSection && (
                    <div
                      data-divider-for={nextSection.id}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        transform: 'translateY(50%)',
                        pointerEvents: 'auto',
                        zIndex: 2,
                      }}
                    >
                      <SectionDivider
                        type={nextDivider}
                        color={nextSection.style.accent_color}
                        toBg={nextSection.style.bg_color}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </FrameContextConsumer>
    </Frame>
  );
}

/** Injects the IntersectionObserver scroll-reveal script into the iframe */
function ScrollRevealInjector({ document: frameDoc }: { document: Document | null }) {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (!frameDoc || injectedRef.current) return;
    injectedRef.current = true;

    const script = frameDoc.createElement('script');
    script.textContent = generateScrollScript();
    frameDoc.body.appendChild(script);

    return () => {
      injectedRef.current = false;
    };
  }, [frameDoc]);

  return null;
}

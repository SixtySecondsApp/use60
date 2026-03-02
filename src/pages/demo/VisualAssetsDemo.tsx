/**
 * Visual Assets Demo
 *
 * Demonstrates god-tier prompt engineering for:
 * - Gemini 3.1 Pro SVG animations (5 prompts)
 * - Nano Banana 2 image generation (5 prompts)
 *
 * Each prompt follows the skill frameworks:
 * - SVG: 5 pillars (animation language, choreography, context-aware physics, interactivity, tech stack)
 * - Image: 7 layers (subject, action, composition, environment, lighting, style, technical gloss)
 */

import { useState, useCallback } from 'react';
import { Sparkles, Image, Play, Loader2, Check, X, RefreshCw, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { geminiSvgService } from '@/lib/services/geminiSvgService';
import { nanoBananaService } from '@/lib/services/nanoBananaService';
import { SvgPreview } from '@/components/landing-builder/SvgPreview';

// ---------------------------------------------------------------------------
// SVG Prompts — Following the 5 Pillars
// ---------------------------------------------------------------------------

interface DemoPrompt {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  complexity: 'simple' | 'medium' | 'complex';
}

const SVG_PROMPTS: DemoPrompt[] = [
  {
    id: 'svg-1',
    title: 'Isometric Package Delivery',
    subtitle: 'Interactive hover + spring physics + multi-stage choreography',
    complexity: 'complex',
    prompt: `Generate a single-file, interactive SVG animation of a 3D isometric cardboard box.
Use a crisp vector illustration style with warm orange #D97706 and neutral grey #6B7280 tones.

Logic & Animation:
1. Box base slides up from y:40 with cubic-bezier(0.22, 1, 0.36, 1) over 500ms
2. Shadow expands beneath with opacity 0→0.2, 300ms delay, ease-out
3. Packing tape accent line draws on with stroke-dashoffset animation, 600ms delay
4. On hover: box drops 4px with squash-and-stretch, flaps fold shut using rotateX at hinge point with cubic-bezier(0.34, 1.56, 0.64, 1), tape slides across and transitions into a green #059669 confirmation checkmark

On hover-out: reverse with cubic-bezier(0.3, 0, 0.8, 0.15), 200ms (faster exit).

Technical:
- Pure CSS @keyframes and transitions, no SMIL, no <script>
- viewBox="0 0 400 300", no fixed width/height
- xmlns="http://www.w3.org/2000/svg"
- <title>Interactive package delivery confirmation</title>
- will-change: transform on box body and flap groups
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
- @media (prefers-color-scheme: dark) { background shapes: #1E293B; text: #F1F5F9; }
- Self-contained, under 40KB`,
  },
  {
    id: 'svg-2',
    title: 'Neural Network Data Flow',
    subtitle: 'Multi-element stagger + electric physics + looping',
    complexity: 'complex',
    prompt: `Generate a self-contained SVG animation of an abstract neural network processing data.

Scene: 12 nodes arranged in 3 layers (4-4-4), connected by gradient lines. Data pulses flow between nodes.

Choreography:
1. (0-0.8s) Nodes fade in layer by layer with 100ms stagger, scale 0→1 with cubic-bezier(0.34, 1.56, 0.64, 1)
2. (0.8-1.5s) Connection lines draw on using stroke-dashoffset, staggered by distance from input layer
3. (1.5-4s) Data pulses (small glowing circles) travel along connection lines using motion along path, staggered 200ms. Pulses use electric physics: sharp start cubic-bezier(0.16, 1, 0.3, 1), afterglow trail via opacity
4. (4-4.5s) Output nodes pulse once with scale 1→1.15→1 and glow ring

Loop: 5s total with seamless restart. Pulses continuously flow after initial build.

Colors:
- Nodes: #2563EB blue with #3B82F6 glow ring
- Active node: #8B5CF6 violet when data passes through
- Connections: gradient from #2563EB to #8B5CF6
- Data pulses: #F59E0B amber with 30% opacity glow
- Background: transparent

Technical:
- viewBox="0 0 600 300"
- CSS @keyframes with custom cubic-bezier per element type
- will-change: transform, opacity on all animated elements
- <title>Neural network data processing visualization</title>
- @media (prefers-reduced-motion: reduce) shows static connected network
- Under 45KB`,
  },
  {
    id: 'svg-3',
    title: 'Notification Bell',
    subtitle: 'Context-aware physics + damping decay + burst particles',
    complexity: 'medium',
    prompt: `Generate a self-contained SVG animation of a notification bell ringing.

Physics — the bell is METAL (rigid body, no deformation), the clapper is HEAVY (inertia lag):
1. (0-0.3s) Bell swings right 15deg with cubic-bezier(0.16, 1, 0.3, 1)
2. Swings left 12deg (damping: each swing loses ~35% amplitude)
3. Then right 8deg, left 5deg, right 2deg — classic damping decay
4. Clapper follows bell with 50ms delay (inertia lag behind bell body)
5. At peak of first swing: 3 sound wave arcs pulse outward from bell top, staggered 80ms, each: scale 0→1, opacity 1→0, 500ms with ease-out
6. Small notification dot (red circle) bounces in at top-right with cubic-bezier(0.34, 1.56, 0.64, 1)

Total decay to stillness: 1.8 seconds. Then 2s pause. Loop.

Style: Clean line-art icon, stroke-width="2", stroke-linecap="round"
Colors: Bell body #374151, clapper #6B7280, sound waves #3B82F6 at 40% opacity, notification dot #EF4444

Technical:
- viewBox="0 0 100 100"
- CSS @keyframes, transform-origin at bell top center for swing pivot
- will-change: transform on bell group
- <title>Notification bell with alert</title>
- @media (prefers-reduced-motion: reduce) shows static bell with dot
- Under 10KB`,
  },
  {
    id: 'svg-4',
    title: 'Flowing Wave Divider',
    subtitle: 'Organic physics + sine easing + seamless loop',
    complexity: 'simple',
    prompt: `Generate a self-contained SVG animation for a full-width section divider.

Visual: Two overlapping wave paths creating a flowing liquid effect between page sections.

Animation:
- Wave 1: translateX oscillates 0→-50% over 8s with ease-in-out-sine, infinite loop
- Wave 2: translateX oscillates 0→-50% over 12s (different speed creates parallax depth)
- Both waves use organic, sine-wave motion — never linear, never mechanical

Colors:
- Wave 1: linear gradient from #2563EB to #8B5CF6, opacity 0.6
- Wave 2: linear gradient from #8B5CF6 to #EC4899, opacity 0.3
- Background: transparent

Technical:
- viewBox="0 0 1440 80", preserveAspectRatio="none" for full-width stretching
- Wave paths repeat horizontally (draw 2x width, translate to create infinite scroll effect)
- CSS @keyframes with cubic-bezier(0.37, 0, 0.63, 1) for organic sine feel
- <title>Decorative flowing wave section divider</title>
- @media (prefers-reduced-motion: reduce) freezes waves at rest position
- Under 8KB`,
  },
  {
    id: 'svg-5',
    title: 'Rocket Launch Sequence',
    subtitle: 'Multi-stage narrative + particle burst + parallax star field',
    complexity: 'complex',
    prompt: `Generate a single-file SVG animation of a rocket launch sequence.
Flat geometric illustration style with deep navy #1E1B4B body and vivid orange #FF6B35 flame.

Narrative stages:
Stage 1 (0-1s): Rocket sits at rest, subtle hover oscillation ±2px translateY with ease-in-out-sine, 2s loop. Countdown "3...2...1" text fades in sequence.
Stage 2 (1-1.5s): Exhaust flame scales from 0 to 1 with spring physics cubic-bezier(0.34, 1.56, 0.64, 1). Rocket vibrates (translateX ±1px, 50ms, 6 cycles).
Stage 3 (1.5-3s): Rocket translates Y from 0 to -300 with easeOutExpo cubic-bezier(0.16, 1, 0.3, 1). Squash horizontally at start (scaleX 0.95), then stretch vertically as speed increases (scaleY 1.1).
Stage 4 (1.5-3.5s): 8 particle circles burst from exhaust with staggered 60ms delay. Each: scale 0→1→0, translateY 0→120, opacity 1→0, 800ms. Random horizontal scatter ±20px.
Stage 5 (1-3.5s): Star field (20 small circles at random positions) parallax-scrolls downward at 0.3x rocket speed.

Colors: Body #1E1B4B, nose cone #FF6B35, flame gradient #FF6B35→#FBBF24, exhaust particles #FF6B35 at 60%, stars #E2E8F0

Technical:
- viewBox="0 0 300 500"
- CSS @keyframes with will-change: transform on rocket body, flame, and all particles
- animation-fill-mode: forwards (plays once, holds final state)
- <title>Rocket launch animation sequence</title>
- @media (prefers-reduced-motion: reduce) shows static rocket
- @media (prefers-color-scheme: dark) { stars brighter: #F8FAFC }
- Under 45KB`,
  },
];

// ---------------------------------------------------------------------------
// Image Prompts — Following the 7-Layer Framework
// ---------------------------------------------------------------------------

interface ImagePrompt {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  aspect_ratio: 'square' | 'portrait' | 'landscape';
}

const IMAGE_PROMPTS: ImagePrompt[] = [
  {
    id: 'img-1',
    title: 'SaaS Command Center Hero',
    subtitle: 'Cinematic still / Low-angle / Neon + golden hour mix',
    aspect_ratio: 'landscape',
    prompt: `A professional, photorealistic cinematic still of a futuristic SaaS command center.
A confident woman in her early 30s, sharp tailored charcoal blazer over a cream turtleneck,
minimal gold earrings, stands before a massive curved display wall showing real-time analytics
dashboards with glowing data visualizations in violet #8B5CF6 and blue #2563EB.
She gestures toward a floating 3D holographic pipeline chart, expression focused and decisive.
Dramatic low-angle shot, three-quarter view, shallow depth of field with bokeh on background monitors.
Set in a sleek glass-walled corner office at golden hour, floor-to-ceiling windows revealing
a downtown cityscape, warm golden light streaming in from the right mixing with cool blue
glow from the displays, creating dramatic color temperature contrast.
Volumetric light beams catching subtle atmospheric haze in the room.
Shot on 35mm lens, f/1.8 aperture, slight film grain, highly detailed textures on the displays
and fabric of her blazer, visible reflections in the glass walls, masterpiece quality, 4K.
Clean, high-end SaaS aesthetic. No text, no watermarks, no logos.`,
  },
  {
    id: 'img-2',
    title: 'Abstract AI Intelligence',
    subtitle: 'Conceptual / Center-out composition / Volumetric glow',
    aspect_ratio: 'landscape',
    prompt: `An abstract visualization of artificial intelligence awakening. A luminous sphere of
interconnected neural pathways at the center, made of thousands of tiny light particles
in violet #8B5CF6 and electric blue #3B82F6, radiating outward in concentric waves.
The core pulses with warm amber #F59E0B energy, suggesting consciousness forming.
Data streams spiral outward like galaxy arms, transitioning from dense warm tones at
the center to sparse cool tones at the edges. Scattered geometric fragments float in orbit
around the core, each reflecting the central light.
Centered composition, elements radiating outward from the bright focal point, fading to
deep navy #0F172A darkness at the edges. Perfect for text overlay on the outer areas.
Volumetric light bloom around the brightest nodes, subtle lens flare effects,
particle trails with motion blur suggesting rapid computation.
3D render with glass morphism elements, hyper-detailed energy textures,
subsurface scattering on the translucent geometric fragments, 4K resolution.
Clean, high-end SaaS aesthetic. No text, no watermarks, no logos.`,
  },
  {
    id: 'img-3',
    title: 'Startup Team Collaboration',
    subtitle: 'Editorial candid / Natural light / Warm documentary',
    aspect_ratio: 'landscape',
    prompt: `A candid, editorial-quality photograph of a small startup team of four diverse
professionals in their late 20s to early 30s, gathered around a standing desk in an
animated strategy discussion. One person points at a large monitor showing a colorful
Kanban board with sticky-note-like cards, another sketches on a glass whiteboard,
two lean in with engaged, genuine smiles and focused expressions. Smart casual attire:
a mix of tailored blazers, crew-neck sweaters, and clean button-downs.
Medium shot, eye level, slight bokeh on the background, natural framing by
the whiteboard edge and a tall potted monstera plant.
Set in a bright, airy loft office with exposed brick walls, polished concrete floors,
large arched windows flooding the space with natural morning light from the left,
warm pendant Edison bulbs hanging above adding golden accents.
The warm window light creates soft directional shadows, complemented by the
cool daylight bounce from the concrete floor, giving beautiful color temperature contrast.
Shot on 50mm prime lens, f/2.0, natural skin tones, slight warm color grade reminiscent
of Kinfolk magazine, precise focus on faces, richly detailed fabric textures, 4K.
Authentic and approachable — genuine expressions, not posed stock photography.
Clean, high-end SaaS aesthetic. No text, no watermarks, no logos.`,
  },
  {
    id: 'img-4',
    title: 'Isometric Tech Stack',
    subtitle: 'Vector illustration / 45-degree projection / Flat color palette',
    aspect_ratio: 'square',
    prompt: `An isometric vector illustration of a modern SaaS tech stack architecture.
A layered platform showing, from bottom to top: a cloud infrastructure base with
server racks and database cylinders, a middle API layer with glowing connection nodes,
and a top application layer with floating UI cards showing dashboard widgets,
chat interfaces, and notification bells.
Glowing data lines flow upward between layers as luminous gradient streams,
pulsing with energy to show real-time data processing.
45-degree isometric projection, centered composition, consistent 2px line weight
throughout all elements, each layer sitting on a platform with subtle depth shadows.
Color palette: #2563EB blue for infrastructure, #8B5CF6 violet for API connectors,
#10B981 emerald for application UI elements, #F8FAFC white for cards and surfaces,
on a clean #F1F5F9 light gray background.
Soft gradient fills give depth to each component. Small animated-looking directional
arrows on the data lines. Subtle drop shadows between layers create clear separation.
Clean vector isometric style, modern tech illustration suitable for a features page,
high-resolution, pixel-perfect edges, professionally crafted, print-ready quality.
Clean, high-end SaaS aesthetic. No text, no watermarks, no logos.`,
  },
  {
    id: 'img-5',
    title: 'Moody Developer Workspace',
    subtitle: 'Cinematic atmosphere / Neon + screen glow / Shallow DOF',
    aspect_ratio: 'landscape',
    prompt: `A cinematic, atmospheric photograph of a developer's workspace late at night.
An ultrawide curved monitor displaying a dark-themed code editor with syntax-highlighted
TypeScript code in violet and blue tones, a secondary vertical monitor showing a running
terminal with green #10B981 output text, and a laptop with lid at 120 degrees showing
a localhost preview of a sleek dark dashboard.
A ceramic mug of coffee with wisps of steam rising in gentle spirals sits beside
a mechanical keyboard with subtle RGB backlighting in #8B5CF6 violet.
Three-quarter view from slightly above and to the right, shallow depth of field
with the code on the main monitor in sharp focus, edges softening into creamy bokeh.
Set in a minimal home office corner at 2am, floor-to-ceiling window showing a rain-slicked
city street below with blurred neon reflections (cyan and warm orange).
Key light: the cool blue-white glow from the monitors, illuminating the desk surface.
Fill: warm amber from a small desk lamp on the far left. Accent: city neon reflected
faintly in the window glass. Light rain on the window adds subtle bokeh dots from
the street lights below. Thin atmospheric haze catches the monitor light.
Shot on 35mm lens, f/1.4, slight film grain, incredibly detailed textures:
visible keycaps, coffee surface reflection, rain droplets on glass, 4K.
Clean, high-end SaaS aesthetic. No text, no watermarks, no logos.`,
  },
];

// ---------------------------------------------------------------------------
// Generation State
// ---------------------------------------------------------------------------

interface GenerationResult {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: string; // SVG code or image URL
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VisualAssetsDemo() {
  const [svgResults, setSvgResults] = useState<Record<string, GenerationResult>>({});
  const [imageResults, setImageResults] = useState<Record<string, GenerationResult>>({});
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

  const togglePrompt = useCallback((id: string) => {
    setExpandedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const copyPrompt = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast.success('Prompt copied to clipboard');
  }, []);

  // Generate SVG
  const generateSvg = useCallback(async (prompt: DemoPrompt) => {
    setSvgResults(prev => ({ ...prev, [prompt.id]: { status: 'loading' } }));

    const result = await geminiSvgService.generate({
      description: prompt.prompt,
      complexity: prompt.complexity,
    });

    if (result) {
      setSvgResults(prev => ({ ...prev, [prompt.id]: { status: 'success', data: result.svg_code } }));
      toast.success(`Generated: ${prompt.title}`);
    } else {
      setSvgResults(prev => ({ ...prev, [prompt.id]: { status: 'error', error: 'Generation failed' } }));
    }
  }, []);

  // Generate Image
  const generateImage = useCallback(async (prompt: ImagePrompt) => {
    setImageResults(prev => ({ ...prev, [prompt.id]: { status: 'loading' } }));

    try {
      const result = await nanoBananaService.generateImage({
        prompt: prompt.prompt,
        aspect_ratio: prompt.aspect_ratio,
        num_images: 1,
      });

      if (result.images && result.images.length > 0) {
        setImageResults(prev => ({
          ...prev,
          [prompt.id]: { status: 'success', data: result.images![0] },
        }));
        toast.success(`Generated: ${prompt.title}`);
      } else {
        setImageResults(prev => ({
          ...prev,
          [prompt.id]: { status: 'error', error: result.error || 'No image returned' },
        }));
      }
    } catch (err) {
      setImageResults(prev => ({
        ...prev,
        [prompt.id]: { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      }));
    }
  }, []);

  // Generate all SVGs
  const generateAllSvgs = useCallback(async () => {
    for (const prompt of SVG_PROMPTS) {
      await generateSvg(prompt);
    }
  }, [generateSvg]);

  // Generate all images
  const generateAllImages = useCallback(async () => {
    for (const prompt of IMAGE_PROMPTS) {
      await generateImage(prompt);
    }
  }, [generateImage]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Visual Assets Demo</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              God-tier prompt engineering for Gemini 3.1 Pro SVG animations and Nano Banana 2 image generation
            </p>
          </div>
        </div>

        {/* SVG Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Gemini 3.1 Pro — SVG Animations
              </h2>
              <Badge variant="outline" className="text-xs">5 prompts</Badge>
            </div>
            <Button
              size="sm"
              onClick={generateAllSvgs}
              disabled={Object.values(svgResults).some(r => r.status === 'loading')}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Generate All
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {SVG_PROMPTS.map(prompt => {
              const result = svgResults[prompt.id];
              const isExpanded = expandedPrompts.has(prompt.id);

              return (
                <Card key={prompt.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{prompt.title}</CardTitle>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              prompt.complexity === 'complex' && 'border-violet-500/30 text-violet-500',
                              prompt.complexity === 'medium' && 'border-blue-500/30 text-blue-500',
                              prompt.complexity === 'simple' && 'border-green-500/30 text-green-500',
                            )}
                          >
                            {prompt.complexity}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {prompt.subtitle}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => copyPrompt(prompt.prompt)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => togglePrompt(prompt.id)}
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          Prompt
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => generateSvg(prompt)}
                          disabled={result?.status === 'loading'}
                        >
                          {result?.status === 'loading' ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : result?.status === 'success' ? (
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          {result?.status === 'success' ? 'Regenerate' : 'Generate'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Expandable prompt */}
                  {isExpanded && (
                    <div className="px-6 pb-3">
                      <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {prompt.prompt}
                      </pre>
                    </div>
                  )}

                  {/* Result area */}
                  {result && (
                    <CardContent className="pt-0">
                      {result.status === 'loading' && (
                        <div className="h-48 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                          <span className="ml-2 text-sm text-gray-500">Generating with Gemini 3.1 Pro...</span>
                        </div>
                      )}
                      {result.status === 'success' && result.data && (
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 flex items-center justify-center min-h-[200px]">
                          <div className="max-w-[500px] w-full">
                            <SvgPreview svg={result.data} />
                          </div>
                        </div>
                      )}
                      {result.status === 'error' && (
                        <div className="h-24 flex items-center justify-center bg-red-50 dark:bg-red-950/20 rounded-lg">
                          <X className="w-4 h-4 text-red-500 mr-2" />
                          <span className="text-sm text-red-600 dark:text-red-400">{result.error}</span>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        {/* Image Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Nano Banana 2 — Image Generation
              </h2>
              <Badge variant="outline" className="text-xs">5 prompts</Badge>
            </div>
            <Button
              size="sm"
              onClick={generateAllImages}
              disabled={Object.values(imageResults).some(r => r.status === 'loading')}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Generate All
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {IMAGE_PROMPTS.map(prompt => {
              const result = imageResults[prompt.id];
              const isExpanded = expandedPrompts.has(prompt.id);

              return (
                <Card key={prompt.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{prompt.title}</CardTitle>
                          <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-500">
                            {prompt.aspect_ratio}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {prompt.subtitle}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => copyPrompt(prompt.prompt)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => togglePrompt(prompt.id)}
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          Prompt
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => generateImage(prompt)}
                          disabled={result?.status === 'loading'}
                        >
                          {result?.status === 'loading' ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : result?.status === 'success' ? (
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          {result?.status === 'success' ? 'Regenerate' : 'Generate'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Expandable prompt */}
                  {isExpanded && (
                    <div className="px-6 pb-3">
                      <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {prompt.prompt}
                      </pre>
                    </div>
                  )}

                  {/* Result area */}
                  {result && (
                    <CardContent className="pt-0">
                      {result.status === 'loading' && (
                        <div className="h-48 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                          <span className="ml-2 text-sm text-gray-500">Generating with Nano Banana 2...</span>
                        </div>
                      )}
                      {result.status === 'success' && result.data && (
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
                          <img
                            src={result.data}
                            alt={prompt.title}
                            className={cn(
                              'w-full object-cover',
                              prompt.aspect_ratio === 'landscape' && 'max-h-[400px]',
                              prompt.aspect_ratio === 'square' && 'max-h-[500px] max-w-[500px] mx-auto',
                              prompt.aspect_ratio === 'portrait' && 'max-h-[600px] max-w-[400px] mx-auto',
                            )}
                          />
                        </div>
                      )}
                      {result.status === 'error' && (
                        <div className="h-24 flex items-center justify-center bg-red-50 dark:bg-red-950/20 rounded-lg">
                          <X className="w-4 h-4 text-red-500 mr-2" />
                          <span className="text-sm text-red-600 dark:text-red-400">{result.error}</span>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

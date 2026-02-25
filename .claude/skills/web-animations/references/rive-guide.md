# Rive for React — Complete Guide

Interactive, state-driven animations designed in the Rive Editor and rendered natively in React via canvas/WebGL.

**When to use Rive**: Complex illustrations with logic, character animations, interactive icons, data-driven visuals, scroll-driven storytelling. Anything too complex to build in CSS/JS but requiring interactivity.

---

## Installation

```bash
# Canvas renderer (recommended default)
npm install @rive-app/react-canvas

# WebGL2 renderer (best quality, advanced features)
npm install @rive-app/react-webgl2
```

**Canvas vs WebGL:**
| Criteria | `react-canvas` | `react-webgl2` |
|----------|----------------|-----------------|
| Bundle | Smaller WASM (~78KB) | Larger |
| Quality | Good for most | Best rendering |
| Multiple instances | No limit | 8-16 WebGL contexts max |
| Recommendation | Default choice | Single hero/showcase |

---

## Core: useRive Hook

```tsx
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';

function MyAnimation() {
  const { rive, RiveComponent } = useRive({
    src: '/animations/hero.riv',       // URL or path to .riv file
    stateMachines: 'MainSM',           // state machine name(s)
    artboard: 'MainArtboard',          // optional artboard name
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,                // Cover, Contain, Fill, FitWidth, FitHeight, None, ScaleDown, Layout
      alignment: Alignment.Center,
    }),
    onLoad: () => console.log('Loaded'),
    onStateChange: (event) => console.log('State:', event.data),
  });

  return (
    <div className="w-full h-[400px]">
      <RiveComponent />
    </div>
  );
}
```

### useRive Parameters

| Param | Type | Description |
|-------|------|-------------|
| `src` | string | URL/path to `.riv` file |
| `buffer` | ArrayBuffer | Raw `.riv` bytes (alternative to src) |
| `artboard` | string | Artboard name |
| `stateMachines` | string \| string[] | State machine name(s) |
| `animations` | string \| string[] | Timeline animation name(s) |
| `autoplay` | boolean | Auto-start (default: false) |
| `layout` | Layout | Fit + alignment config |
| `onLoad` | () => void | File loaded callback |
| `onStateChange` | (event) => void | State change callback |

### Fit Modes

| Fit | Behavior |
|-----|----------|
| `Fit.Contain` | Scale to fit, may letterbox (default) |
| `Fit.Cover` | Scale to fill, may crop |
| `Fit.Fill` | Stretch to fill, may distort |
| `Fit.Layout` | Responsive — Rive handles resizing natively |
| `Fit.FitWidth` | Match container width |
| `Fit.FitHeight` | Match container height |
| `Fit.ScaleDown` | Like Contain but never scales up |
| `Fit.None` | No scaling |

---

## State Machine Inputs

Three input types drive state machine transitions:

| Type | Read | Write |
|------|------|-------|
| Boolean | `input.value` | `input.value = true/false` |
| Number | `input.value` | `input.value = 42` |
| Trigger | N/A | `input.fire()` |

```tsx
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

function InteractiveButton() {
  const { rive, RiveComponent } = useRive({
    src: '/animations/button.riv',
    stateMachines: 'ButtonSM',
    autoplay: true,
  });

  const isHover = useStateMachineInput(rive, 'ButtonSM', 'isHover');
  const clickTrigger = useStateMachineInput(rive, 'ButtonSM', 'onClick');
  const progress = useStateMachineInput(rive, 'ButtonSM', 'progress');

  return (
    <div className="w-[200px] h-[60px]">
      <RiveComponent
        onMouseEnter={() => isHover && (isHover.value = true)}
        onMouseLeave={() => isHover && (isHover.value = false)}
        onClick={() => clickTrigger?.fire()}
      />
    </div>
  );
}
```

---

## Common Patterns

### Interactive Icon

```tsx
function RiveIcon({ src, size = 24 }: { src: string; size?: number }) {
  const { rive, RiveComponent } = useRive({
    src,
    stateMachines: 'IconSM',
    autoplay: false,
  });
  const isHover = useStateMachineInput(rive, 'IconSM', 'isHover');

  return (
    <div
      style={{ width: size, height: size }}
      onMouseEnter={() => isHover && (isHover.value = true)}
      onMouseLeave={() => isHover && (isHover.value = false)}
    >
      <RiveComponent />
    </div>
  );
}
```

### Scroll-Driven Animation

```tsx
function ScrollRive() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { rive, RiveComponent } = useRive({
    src: '/animations/scroll-story.riv',
    stateMachines: 'ScrollSM',
    autoplay: true,
  });
  const progress = useStateMachineInput(rive, 'ScrollSM', 'scrollProgress');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !progress) return;

    const handleScroll = () => {
      const rect = container.getBoundingClientRect();
      const vh = window.innerHeight;
      const pct = Math.min(100, Math.max(0,
        ((vh - rect.top) / (vh + rect.height)) * 100
      ));
      progress.value = pct;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [progress]);

  return (
    <div ref={containerRef} className="h-[200vh] relative">
      <div className="sticky top-0 h-screen">
        <RiveComponent />
      </div>
    </div>
  );
}
```

### Mouse-Tracking Hero

```tsx
function HeroMouseTrack() {
  const { rive, RiveComponent } = useRive({
    src: '/animations/hero.riv',
    stateMachines: 'HeroSM',
    autoplay: true,
  });
  const mouseX = useStateMachineInput(rive, 'HeroSM', 'mouseX');
  const mouseY = useStateMachineInput(rive, 'HeroSM', 'mouseY');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !mouseX || !mouseY) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.value = ((e.clientX - rect.left) / rect.width) * 100;
    mouseY.value = ((e.clientY - rect.top) / rect.height) * 100;
  };

  return (
    <div ref={containerRef} className="w-full h-[80vh]" onMouseMove={handleMouseMove}>
      <RiveComponent />
    </div>
  );
}
```

### Step-Based Onboarding

```tsx
function OnboardingAnimation({ step }: { step: number }) {
  const { rive, RiveComponent } = useRive({
    src: '/animations/onboarding.riv',
    stateMachines: 'OnboardingSM',
    autoplay: true,
  });
  const stepInput = useStateMachineInput(rive, 'OnboardingSM', 'currentStep');

  useEffect(() => {
    if (stepInput) stepInput.value = step;
  }, [step, stepInput]);

  return <div className="w-full h-64"><RiveComponent /></div>;
}
```

### State Change Listener

```tsx
const { rive, RiveComponent } = useRive({
  src: '/animations/flow.riv',
  stateMachines: 'FlowSM',
  autoplay: true,
  onStateChange: (event) => {
    const stateNames = event.data as string[];
    if (stateNames.includes('Complete')) {
      onAnimationComplete();
    }
  },
});
```

---

## Rive + Motion.dev Together

**Division of labor**: Rive handles canvas (illustrations, characters, complex visuals). Motion handles DOM (layout, page transitions, mount/unmount, scroll reveals).

### Pattern: Motion Container + Rive Illustration

```tsx
import { motion } from 'motion/react';
import { useRive } from '@rive-app/react-canvas';

function HeroSection() {
  const { RiveComponent } = useRive({
    src: '/animations/hero.riv',
    stateMachines: 'HeroSM',
    autoplay: true,
  });

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="relative w-full h-[80vh]"
    >
      {/* Rive: complex illustration */}
      <div className="absolute inset-0">
        <RiveComponent />
      </div>

      {/* Motion: text entrance */}
      <motion.div
        className="relative z-10 flex flex-col items-center justify-center h-full"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-5xl font-bold text-white">Welcome</h1>
      </motion.div>
    </motion.section>
  );
}
```

### Rules for Combining

1. **Rive controls its canvas; Motion controls the DOM.** Never apply Motion transforms to the Rive canvas element — let Rive handle internal rendering.
2. **Coordinate via callbacks.** Use Rive's `onStateChange` to trigger Motion animations, or Motion's `onAnimationComplete` to fire Rive triggers.
3. **No double-animating.** If Rive fades something inside canvas, don't also fade the container with Motion. One system per visual property.
4. **Performance is additive, not competitive.** Rive runs its own canvas loop. Motion animates DOM. They don't compete for resources.

---

## Rive MCP Integration

### Community MCP Server (`@rive-mcp/server-core`)

Standalone MCP server for animation discovery and code generation. Does NOT require the Rive Editor app.

**Claude Code config** (add to `.claude/settings.json`):

```json
{
  "mcpServers": {
    "rive-animation-assistant": {
      "command": "npx",
      "args": ["@rive-mcp/server-core"],
      "env": {}
    }
  }
}
```

**Capabilities:**
- Search and browse community Rive animations
- Generate React integration code
- Parse `.riv` file structure and metadata
- Performance analysis and recommendations
- Real-time previews via CodeSandbox/StackBlitz

### Official Rive Editor MCP (Early Access)

First-party MCP built into the Rive Editor desktop app (Mac only). Connects AI tools to the running editor.

**Tools:**
- `createStateMachineLayerStates` — create states
- `createTransitions` — wire transitions
- `createConditions` — add conditions
- `createShapes` — generate shapes
- `createViewModels` — define data binding
- `layout` — apply layout properties

Requires Rive Early Access Mac desktop app to be running.

---

## Performance Checklist

1. **Preload hero `.riv` files**: `<link rel="preload" href="/animations/hero.riv" as="fetch" crossorigin />`
2. **Self-host WASM**: `RuntimeLoader.setWasmUrl('/wasm/rive.wasm')` — avoids unpkg CDN latency
3. **Lazy load below-fold**: Use `React.lazy` + `Suspense` or Intersection Observer
4. **Canvas for many, WebGL for one**: Canvas renderer has no context limits
5. **`autoplay: false`** for non-hero animations — play on interaction/visibility
6. **Isolate in wrapper components**: `useRive` cleanup works correctly when the component unmounts
7. **Use `Fit.Layout`** for responsive artboards — Rive handles resizing natively

### Lazy Loading Pattern

```tsx
import { useInView } from 'react-intersection-observer';

function LazyRive({ src, stateMachine }: { src: string; stateMachine: string }) {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '200px' });

  return (
    <div ref={ref} className="w-full h-[300px]">
      {inView && <RiveWrapper src={src} stateMachine={stateMachine} />}
    </div>
  );
}

// Isolated wrapper for proper cleanup
function RiveWrapper({ src, stateMachine }: { src: string; stateMachine: string }) {
  const { RiveComponent } = useRive({
    src,
    stateMachines: stateMachine,
    autoplay: true,
  });
  return <RiveComponent style={{ width: '100%', height: '100%' }} />;
}
```

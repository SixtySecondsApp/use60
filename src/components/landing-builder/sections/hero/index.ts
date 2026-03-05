import { registerSection, setGlobalFallback } from '../registry';
import { HeroCentered } from './HeroCentered';
import { HeroSplitLeft } from './HeroSplitLeft';
import { HeroGradient } from './HeroGradient';

registerSection('hero', 'centered', HeroCentered, true);
registerSection('hero', 'split-left', HeroSplitLeft);
registerSection('hero', 'gradient', HeroGradient);

// HeroCentered is the global fallback for completely unknown types
setGlobalFallback(HeroCentered);

export { HeroCentered, HeroSplitLeft, HeroGradient };

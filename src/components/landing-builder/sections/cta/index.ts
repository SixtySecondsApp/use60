import { registerSection } from '../registry';
import { CtaCentered } from './CtaCentered';
import { CtaSplitLeft } from './CtaSplitLeft';
import { CtaGradient } from './CtaGradient';

registerSection('cta', 'centered', CtaCentered, true);
registerSection('cta', 'split-left', CtaSplitLeft);
registerSection('cta', 'gradient', CtaGradient);

export { CtaCentered, CtaSplitLeft, CtaGradient };

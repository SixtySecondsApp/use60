import { registerSection } from '../registry';
import { SolutionSplitLeft } from './SolutionSplitLeft';
import { SolutionSplitRight } from './SolutionSplitRight';
import { SolutionCentered } from './SolutionCentered';

registerSection('solution', 'split-left', SolutionSplitLeft, true);
registerSection('solution', 'split-right', SolutionSplitRight);
registerSection('solution', 'centered', SolutionCentered);

export { SolutionSplitLeft, SolutionSplitRight, SolutionCentered };

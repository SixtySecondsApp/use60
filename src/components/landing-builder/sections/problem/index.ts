import { registerSection } from '../registry';
import { ProblemCentered } from './ProblemCentered';
import { ProblemSplitRight } from './ProblemSplitRight';
import { ProblemSplitLeft } from './ProblemSplitLeft';

registerSection('problem', 'centered', ProblemCentered, true);
registerSection('problem', 'split-right', ProblemSplitRight);
registerSection('problem', 'split-left', ProblemSplitLeft);

export { ProblemCentered, ProblemSplitRight, ProblemSplitLeft };

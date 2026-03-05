import { registerSection } from '../registry';
import { ComparisonGrid } from './ComparisonGrid';

registerSection('comparison', 'centered', ComparisonGrid, true);

export { ComparisonGrid };

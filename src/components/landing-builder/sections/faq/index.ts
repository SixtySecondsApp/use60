import { registerSection } from '../registry';
import { FaqCentered } from './FaqCentered';
import { FaqSplitLeft } from './FaqSplitLeft';
import { FaqCardsGrid } from './FaqCardsGrid';

registerSection('faq', 'centered', FaqCentered, true);
registerSection('faq', 'split-left', FaqSplitLeft);
registerSection('faq', 'cards-grid', FaqCardsGrid);

export { FaqCentered, FaqSplitLeft, FaqCardsGrid };

import { registerSection } from '../registry';
import { FooterCentered } from './FooterCentered';
import { FooterCardsGrid } from './FooterCardsGrid';
import { FooterSplitLeft } from './FooterSplitLeft';

registerSection('footer', 'centered', FooterCentered, true);
registerSection('footer', 'cards-grid', FooterCardsGrid);
registerSection('footer', 'split-left', FooterSplitLeft);

export { FooterCentered, FooterCardsGrid, FooterSplitLeft };

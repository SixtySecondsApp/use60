import { registerSection } from '../registry';
import { FeaturesCardsGrid } from './FeaturesCardsGrid';
import { FeaturesCentered } from './FeaturesCentered';
import { FeaturesAlternating } from './FeaturesAlternating';

registerSection('features', 'cards-grid', FeaturesCardsGrid, true);
registerSection('features', 'centered', FeaturesCentered);
registerSection('features', 'alternating', FeaturesAlternating);

export { FeaturesCardsGrid, FeaturesCentered, FeaturesAlternating };

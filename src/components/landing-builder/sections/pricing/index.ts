import { registerSection } from '../registry';
import { PricingCentered } from './PricingCentered';

registerSection('pricing', 'centered', PricingCentered, true);

export { PricingCentered };

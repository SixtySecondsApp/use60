import { registerSection } from '../registry';
import { SocialProofCentered } from './SocialProofCentered';
import { SocialProofCardsGrid } from './SocialProofCardsGrid';
import { SocialProofLogoBanner } from './SocialProofLogoBanner';
import { MetricsBar } from './MetricsBar';
import { CaseStudy } from './CaseStudy';
import { ReviewBadges } from './ReviewBadges';

registerSection('social-proof', 'centered', SocialProofCentered, true);
registerSection('social-proof', 'cards-grid', SocialProofCardsGrid);
registerSection('social-proof', 'logo-banner', SocialProofLogoBanner);
registerSection('social-proof', 'metrics-bar', MetricsBar);
registerSection('social-proof', 'case-study', CaseStudy);
registerSection('social-proof', 'review-badges', ReviewBadges);

export { SocialProofCentered, SocialProofCardsGrid, SocialProofLogoBanner, MetricsBar, CaseStudy, ReviewBadges };

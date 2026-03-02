export { getSectionComponent, registerSection, setGlobalFallback } from './registry';
export type { SectionComponentProps } from './registry';

// Section registrations — each module self-registers on import
import './hero';
import './problem';
import './solution';
import './features';
import './social-proof';
import './cta';
import './faq';
import './footer';
import './pricing';
import './comparison';
import './stats';
import './how-it-works';

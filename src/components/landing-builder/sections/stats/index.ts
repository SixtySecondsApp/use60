import { registerSection } from '../registry';
import { StatsCentered } from './StatsCentered';

registerSection('stats', 'centered', StatsCentered, true);

export { StatsCentered };

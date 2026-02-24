import HeroSectionV5B from '../components/components-v5/HeroSectionV5B';
import { HowItWorksV4 } from '../components/components-v4';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';

export default function HeroV5BPreview() {
  useForceDarkMode();

  return (
    <div className="bg-gray-950">
      <HeroSectionV5B />
      <HowItWorksV4 />
    </div>
  );
}

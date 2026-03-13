import { motion } from 'framer-motion';

const LOGOS = [
  { name: 'HubSpot', width: 100 },
  { name: 'Slack', width: 80 },
  { name: 'Google', width: 70 },
  { name: 'Fathom', width: 80 },
  { name: 'Apollo', width: 80 },
  { name: 'Instantly', width: 90 },
  { name: 'Attio', width: 60 },
  { name: 'Stripe', width: 65 },
];

export function LogoBarV8() {
  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-16 border-b border-gray-100 dark:border-white/5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-6xl mx-auto px-6"
      >
        <p className="text-center text-sm font-medium text-gray-400 dark:text-gray-500 mb-10">
          Trusted by growing sales teams to build pipeline faster
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {LOGOS.map((logo) => (
            <div
              key={logo.name}
              className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
              style={{ width: logo.width }}
            >
              {/* Logo text placeholder — replace with actual SVG logos */}
              <div className="text-center font-display font-bold text-lg tracking-tight opacity-40 hover:opacity-70 dark:opacity-50 dark:hover:opacity-80 transition-opacity">
                {logo.name}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

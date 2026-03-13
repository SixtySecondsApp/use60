import { motion } from 'framer-motion';

const LOGOS = [
  { name: 'HubSpot', domain: 'hubspot.com' },
  { name: 'Slack', domain: 'slack.com' },
  { name: 'Google', domain: 'google.com' },
  { name: 'Fathom', domain: 'fathom.video' },
  { name: 'Apollo', domain: 'apollo.io' },
  { name: 'Instantly', domain: 'instantly.ai' },
  { name: 'Attio', domain: 'attio.com' },
  { name: 'Stripe', domain: 'stripe.com' },
];

export function LogoBarV10() {
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

        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {LOGOS.map((logo) => (
            <img
              key={logo.name}
              src={`https://img.logo.dev/${logo.domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=64&format=png`}
              alt={logo.name}
              className="h-6 md:h-7 w-auto opacity-40 hover:opacity-70 dark:opacity-30 dark:hover:opacity-60 transition-opacity grayscale"
              loading="lazy"
            />
          ))}
        </div>
      </motion.div>
    </section>
  );
}

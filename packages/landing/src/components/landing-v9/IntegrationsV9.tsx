import { useState } from 'react';
import { motion } from 'framer-motion';

interface Integration {
  name: string;
  domain: string;
  description: string;
  category: string;
  comingSoon?: boolean;
}

const INTEGRATIONS: Integration[] = [
  // CRM
  { name: 'HubSpot', domain: 'hubspot.com', description: 'Bi-directional sync — deals, contacts, activities', category: 'CRM' },
  { name: 'Attio', domain: 'attio.com', description: 'Native integration with field mapping', category: 'CRM' },
  { name: 'Salesforce', domain: 'salesforce.com', description: 'Enterprise CRM integration', category: 'CRM', comingSoon: true },
  // Communication
  { name: 'Slack', domain: 'slack.com', description: 'Where 60 lives — briefs, alerts, approvals', category: 'Communication' },
  { name: 'Gmail', domain: 'gmail.com', description: 'Email sync, search, and label management', category: 'Email' },
  { name: 'Google Calendar', domain: 'calendar.google.com', description: 'Meeting detection and availability', category: 'Calendar' },
  { name: 'Outlook', domain: 'outlook.com', description: 'Email and calendar integration', category: 'Email' },
  // Meetings
  { name: 'Fathom', domain: 'fathom.video', description: 'Transcription, speaker ID, semantic search', category: 'Meetings' },
  // Outreach & Data
  { name: 'Apollo', domain: 'apollo.io', description: 'Lead search, company enrichment, email finder', category: 'Data' },
  { name: 'Instantly', domain: 'instantly.ai', description: 'Cold email campaigns, tracking, replies', category: 'Outreach' },
  { name: 'Stripe', domain: 'stripe.com', description: 'Billing, subscriptions, payment tracking', category: 'Billing' },
  { name: 'LinkedIn', domain: 'linkedin.com', description: 'Profile enrichment and connection tracking', category: 'Data', comingSoon: true },
];

function IntegrationLogo({ domain, name }: { domain: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=128&format=png`;

  return (
    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0">
      {!errored ? (
        <img
          src={url}
          alt={`${name} logo`}
          width={40}
          height={40}
          className={`w-full h-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      ) : (
        <span className="text-sm font-bold text-gray-400 dark:text-gray-500">
          {name.charAt(0)}
        </span>
      )}
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export function IntegrationsV9() {
  return (
    <section className="bg-gray-50 dark:bg-[#111] py-24 md:py-32" id="integrations">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">
            Integrations
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Connects to everything. Replaces nothing.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            60 doesn't replace your CRM or your calendar. It connects to them, reads the context,
            and adds intelligence on top. Keep your stack. Add a brain.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          {INTEGRATIONS.map((integration) => (
            <motion.div
              key={integration.name}
              variants={fadeUp}
              className="group relative bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-5 hover:shadow-md hover:border-gray-300 dark:hover:border-white/20 dark:hover:shadow-none transition-all"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <IntegrationLogo domain={integration.domain} name={integration.name} />
                  {integration.comingSoon && (
                    <span className="text-[10px] font-medium leading-none text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-full px-2 py-1 whitespace-nowrap">
                      Soon
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {integration.name}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {integration.description}
                  </p>
                </div>
                <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {integration.category}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

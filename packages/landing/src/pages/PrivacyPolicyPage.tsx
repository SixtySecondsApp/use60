import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, FileText, Users, Lock, Globe, Mail } from 'lucide-react';
import { usePublicBrandingSettings } from '../lib/hooks/useBrandingSettings';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';

// Table of contents structure
interface TOCItem {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tableOfContents: TOCItem[] = [
  { id: 'introduction', title: 'Introduction', icon: FileText },
  { id: 'who-we-are', title: 'Who We Are', icon: Users },
  { id: 'data-collection', title: 'Data Collection', icon: Shield },
  { id: 'how-collected', title: 'How Data Is Collected', icon: Globe },
  { id: 'data-usage', title: 'How We Use Your Data', icon: Lock },
  { id: 'google-api', title: 'Google API Data', icon: Globe },
  { id: 'disclosures', title: 'Data Disclosures', icon: Users },
  { id: 'international-transfers', title: 'International Transfers', icon: Globe },
  { id: 'data-security', title: 'Data Security', icon: Lock },
  { id: 'retention', title: 'Data Retention', icon: FileText },
  { id: 'your-rights', title: 'Your Legal Rights', icon: Shield },
  { id: 'contact', title: 'Contact Us', icon: Mail },
];

export function PrivacyPolicyPage() {
  const [activeSection, setActiveSection] = useState('introduction');
  const { logoDark } = usePublicBrandingSettings();

  // Force dark mode for landing pages
  useForceDarkMode();

  // Track active section for table of contents
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -35% 0px' }
    );

    tableOfContents.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  // Smooth scroll to section
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-gray-950/90 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.a
              href="/"
              className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors"
              whileHover={{ x: -4 }}
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">Back to Home</span>
            </motion.a>

            <img src={logoDark} alt="60" className="h-10 w-auto" />

            <div className="w-20" /> {/* Spacer for centering */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
            {/* Table of Contents - Sticky Sidebar */}
            <aside className="hidden lg:block lg:col-span-3">
              <nav className="sticky top-24 space-y-1">
                <div className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Contents
                  </h2>
                </div>
                {tableOfContents.map(({ id, title, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => scrollToSection(id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all ${
                      activeSection === id
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium">{title}</span>
                  </button>
                ))}
              </nav>
            </aside>

            {/* Main Content */}
            <main className="lg:col-span-9">
              {/* Hero Section */}
              <div className="mb-12">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center lg:text-left"
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6">
                    <Shield className="w-4 h-4" />
                    Legal Document
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    Privacy Policy
                  </h1>
                  <p className="text-xl text-gray-400 max-w-3xl">
                    Your privacy and data security is important to us. This policy explains how we collect, use, and protect your personal information.
                  </p>
                  <p className="text-sm text-gray-500 mt-4">
                    Last Updated: <time dateTime="2026-03-04">4 March 2026</time>
                  </p>
                </motion.div>
              </div>

              {/* Privacy Policy Sections */}
              <div className="space-y-8">
                {/* Introduction */}
                <Section id="introduction" title="Introduction">
                  <p>
                    Sixty Seconds respects your privacy and is committed to protecting your personal data. This privacy notice explains how we look after your personal data when you visit our website, use our services, communicate with us or subscribe to our newsletter, and tells you about your privacy rights and how the law protects you.
                  </p>
                  <p>
                    If you have any questions about this policy or how we protect your information, please email us at{' '}
                    <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300 transition-colors">
                      info@sixtyseconds.video
                    </a>
                    .
                  </p>
                </Section>

                {/* Who We Are */}
                <Section id="who-we-are" title="Important Information and Who We Are">
                  <Subsection title="Purpose of This Privacy Notice">
                    <p>
                      Your privacy and data security is important to us. We are a B2B business and collect and process only a limited amount of personal information, and do so only where it is necessary for:
                    </p>
                    <ul>
                      <li>Providing our services</li>
                      <li>Improving and growing our business</li>
                      <li>Complying with legal or regulatory obligations</li>
                    </ul>
                    <InfoBox variant="warning">
                      Our website is not intended for children and we do not knowingly collect data relating to children (individuals under the age of 18).
                    </InfoBox>
                  </Subsection>

                  <Subsection title="Controller">
                    <p><strong>Sixty Seconds Ltd</strong> is the controller and responsible for your personal data.</p>
                    <ul>
                      <li><strong>Company Number:</strong> 09723940</li>
                      <li><strong>Registered Office:</strong> 29 St Augustine's Parade, Bristol BS1 4UL</li>
                      <li><strong>Email:</strong> <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300">info@sixtyseconds.video</a></li>
                    </ul>
                  </Subsection>

                  <Subsection title="Your Rights">
                    <p>
                      You have the right to make a complaint at any time to the Information Commissioner's Office (ICO), the UK supervisory authority for data protection issues (
                      <a href="https://www.ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                        www.ico.org.uk
                      </a>
                      ). However, we would appreciate the chance to deal with your concerns before you approach the ICO.
                    </p>
                  </Subsection>

                  <Subsection title="Third-Party Links">
                    <p>
                      Our website may include links to third-party websites or connections to third-party services. We do not control these websites and are not responsible for their privacy statements.
                    </p>
                    <p><strong>Third-party services we use:</strong></p>
                    <ul>
                      <li><strong>Stripe & GoCardless</strong> - Payment processing</li>
                      <li><strong>HubSpot</strong> - CRM and marketing</li>
                      <li><strong>Apollo</strong> - CRM and outreach</li>
                    </ul>
                    <p><strong>Privacy policies:</strong></p>
                    <ul>
                      <li><a href="https://gocardless.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">GoCardless Privacy Policy</a></li>
                      <li><a href="https://stripe.com/en-gb/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Stripe Privacy Policy</a></li>
                      <li><a href="https://legal.hubspot.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">HubSpot Privacy Policy</a></li>
                      <li><a href="https://www.apolloplatform.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Apollo Privacy Policy</a></li>
                    </ul>
                  </Subsection>
                </Section>

                {/* Data Collection */}
                <Section id="data-collection" title="The Data We Collect About You">
                  <Subsection title="What Information Do We Collect?">
                    <p>
                      Personal data means any information about an individual from which that person can be identified. We may collect, use, store and transfer the following types of personal data:
                    </p>
                    <DataTypeGrid>
                      <DataTypeCard title="Identity Data" description="First name, last name, nickname, username, title, gender" />
                      <DataTypeCard title="Contact Data" description="Billing address, delivery address, email address, telephone number" />
                      <DataTypeCard title="Profile Data" description="Purchases, orders, interests, preferences, feedback, survey responses" />
                      <DataTypeCard title="Transaction Data" description="Payment details, products and services purchased" />
                      <DataTypeCard title="Usage Data" description="Information about how you use our website, app, products and services" />
                      <DataTypeCard title="Technical Data" description="IP address, login data, browser type and version, time zone, location, browser plug-ins, operating system, platform" />
                      <DataTypeCard title="Marketing Data" description="Marketing preferences, communication preferences, correspondence with us" />
                    </DataTypeGrid>
                  </Subsection>

                  <Subsection title="Aggregated Data">
                    <p>
                      We also collect, use and share aggregated data such as statistical or demographic data. This is not considered personal data as it does not directly or indirectly reveal your identity.
                    </p>
                  </Subsection>

                  <Subsection title="What We Don't Collect">
                    <InfoBox variant="success">
                      We do not knowingly collect:
                      <ul className="mt-2 space-y-1">
                        <li>Special Categories of Personal Data (race, ethnicity, religious beliefs, sexual orientation, political opinions, health data, etc.)</li>
                        <li>Information about criminal convictions and offences</li>
                      </ul>
                    </InfoBox>
                  </Subsection>
                </Section>

                {/* How Data Is Collected */}
                <Section id="how-collected" title="How Is Your Personal Data Collected?">
                  <p>We collect data through:</p>

                  <Subsection title="Direct Interactions">
                    <p>You may give us your data by:</p>
                    <ul>
                      <li>Requesting information about or applying for our products or services</li>
                      <li>Filling in contact forms or using the chatbot on our website</li>
                      <li>Communicating with us on social media</li>
                      <li>Subscribing to our service or newsletter</li>
                      <li>Entering a competition, promotion or survey</li>
                      <li>Providing feedback</li>
                    </ul>
                  </Subsection>

                  <Subsection title="Automated Technologies">
                    <ul>
                      <li>Usage and Technical Data collected through cookies and similar technologies</li>
                      <li>Data from other websites employing our cookies</li>
                    </ul>
                  </Subsection>

                  <Subsection title="Third Parties">
                    <ul>
                      <li>Analytics and search providers (Google, Facebook, LinkedIn)</li>
                      <li>Payment and delivery services (Stripe, GoCardless)</li>
                      <li>Our clients who instruct us to create profiles for you</li>
                      <li>Lead forms on platforms like Facebook and Instagram</li>
                    </ul>
                  </Subsection>
                </Section>

                {/* How We Use Data */}
                <Section id="data-usage" title="How We Use Your Personal Data">
                  <Subsection title="Lawful Grounds for Processing">
                    <p>We will only use your personal data when the law allows us to:</p>
                    <ul>
                      <li><strong>Performance of Contract:</strong> Where we need to perform the contract we have with you</li>
                      <li><strong>Legal Obligation:</strong> Where we need to comply with a legal or regulatory obligation</li>
                      <li><strong>Legitimate Interests:</strong> Where it is necessary for our legitimate interests and your rights do not override those interests</li>
                    </ul>
                  </Subsection>

                  <Subsection title="Purposes for Which We Use Your Personal Data">
                    <UsagePurposeTable />
                  </Subsection>

                  <Subsection title="Marketing">
                    <InfoBox variant="info">
                      <strong>Promotional Offers</strong>
                      <ul className="mt-2 space-y-1">
                        <li>We may use your data to form a view on what may be of interest to you</li>
                        <li>You may receive marketing if you've requested information, purchased products/services, attended workshops, or entered competitions</li>
                        <li>You can opt out at any time</li>
                      </ul>
                    </InfoBox>
                    <p className="mt-4">
                      <strong>Third-Party Marketing:</strong> We will get your express opt-in consent before sharing your data with companies outside Sixty Seconds for marketing purposes.
                    </p>
                    <p className="mt-4">
                      <strong>Opting Out:</strong> Contact us at any time to stop receiving marketing messages. This won't apply to data provided as a result of product/service purchases or other transactions.
                    </p>
                    <p className="mt-4">
                      <strong>Cookies:</strong> You can set your browser to refuse cookies. Some parts of the website may become inaccessible if you disable cookies.
                    </p>
                  </Subsection>
                </Section>

                {/* Google API Services */}
                <Section id="google-api" title="Google API Services — User Data Policy">
                  <p>
                    60 integrates with Google Workspace services including Gmail, Google Calendar, Google Drive, Google Docs, and Google Tasks. When you connect your Google account, we access data from these services to provide 60's features.
                  </p>

                  <Subsection title="How We Use Google Data">
                    <ul>
                      <li><strong>Gmail:</strong> We sync emails from your CRM contacts to display communication history on deals and contacts. AI generates summaries of email threads — only summaries are stored, not raw email bodies. We send emails and create drafts on your behalf when you explicitly request it. We apply triage labels and manage read/starred/archived states within 60.</li>
                      <li><strong>Google Calendar:</strong> We sync your calendar events to display meetings alongside deal context, power meeting prep briefs, and check availability for scheduling. We create, update, and delete events when you use scheduling features.</li>
                      <li><strong>Google Drive & Docs:</strong> We create and share documents (proposals, meeting notes) in your Drive when you request it.</li>
                      <li><strong>Google Tasks:</strong> We provide bidirectional sync between 60's task system and Google Tasks.</li>
                    </ul>
                  </Subsection>

                  <Subsection title="Limited Use Disclosure">
                    <InfoBox variant="info">
                      <strong>Google API Services User Data Policy Compliance</strong>
                      <p className="mt-2">
                        60's use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200 underline">
                          Google API Services User Data Policy
                        </a>
                        , including the Limited Use requirements.
                      </p>
                    </InfoBox>
                    <p className="mt-4">Specifically, we commit to the following:</p>
                    <ul>
                      <li>Google user data is only used to provide and improve user-facing features within 60 that are prominent in the application's user interface.</li>
                      <li>We do not transfer Google user data to third parties, except: (a) as necessary to provide or improve user-facing features visible in 60; (b) to comply with applicable laws; (c) for security purposes such as investigating abuse; or (d) as part of a merger, acquisition, or asset sale with explicit user consent.</li>
                      <li>We do not use Google user data for serving advertisements, including retargeting, personalised, or interest-based advertising.</li>
                      <li>We do not use Google user data to determine creditworthiness or for lending purposes.</li>
                      <li>Human employees do not read Google user data unless: (a) we have your affirmative agreement to view specific data; (b) it is necessary for security purposes; (c) it is necessary to comply with applicable law; or (d) the data is aggregated and anonymised for internal operations.</li>
                    </ul>
                  </Subsection>

                  <Subsection title="Revoking Access">
                    <p>
                      You can disconnect your Google account at any time from Settings &rarr; Integrations within 60. You can also revoke access from your{' '}
                      <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                        Google Account permissions page
                      </a>
                      . When access is revoked, we stop all syncing and delete cached Google data.
                    </p>
                  </Subsection>
                </Section>

                {/* Disclosures */}
                <Section id="disclosures" title="Disclosures of Your Personal Data">
                  <p>We may share your personal data with:</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <DisclosureCard
                      title="Service Providers"
                      description="IT, CRM, and system administration services (e.g., HubSpot)"
                    />
                    <DisclosureCard
                      title="Professional Advisers"
                      description="Lawyers, bankers, auditors, insurers in the United Kingdom"
                    />
                    <DisclosureCard
                      title="Regulators and Authorities"
                      description="HM Revenue & Customs and other UK authorities when required"
                    />
                    <DisclosureCard
                      title="Business Transfers"
                      description="Third parties involved in business sales, transfers, mergers, or acquisitions"
                    />
                  </div>

                  <InfoBox variant="info" className="mt-6">
                    We require all third parties to respect the security of your personal data and treat it in accordance with the law.
                  </InfoBox>
                </Section>

                {/* International Transfers */}
                <Section id="international-transfers" title="International Transfers">
                  <p>
                    Some external third parties may be based outside the European Economic Area (EEA). When we transfer your personal data outside the EEA, we ensure protection by:
                  </p>
                  <ul>
                    <li>Transferring to countries deemed to provide adequate protection by the European Commission</li>
                    <li>Using specific contracts approved by the European Commission</li>
                  </ul>
                  <p>Contact us for further information on the specific mechanisms used.</p>
                </Section>

                {/* Data Security */}
                <Section id="data-security" title="Data Security">
                  <p>
                    We have implemented appropriate security measures to prevent your personal data from being:
                  </p>
                  <ul>
                    <li>Accidentally lost</li>
                    <li>Used or accessed in an unauthorized way</li>
                    <li>Altered or disclosed</li>
                  </ul>
                  <p>
                    Access to your personal data is limited to employees, agents, contractors, and third parties with a business need to know. We have procedures to deal with suspected personal data breaches and will notify you and regulators when legally required.
                  </p>
                </Section>

                {/* Data Retention */}
                <Section id="retention" title="How Long Do We Keep Personal Data?">
                  <p>
                    We retain your personal data only for as long as necessary to fulfill the purposes we collected it for, including satisfying legal, accounting, or reporting requirements.
                  </p>
                  <p>To determine retention periods, we consider:</p>
                  <ul>
                    <li>The amount, nature, and sensitivity of the personal data</li>
                    <li>The potential risk of harm from unauthorized use or disclosure</li>
                    <li>The purposes for which we process your personal data</li>
                    <li>Applicable legal requirements</li>
                  </ul>
                  <p>
                    In some circumstances, we may anonymize your personal data for research or statistical purposes, in which case we may use this information indefinitely.
                  </p>
                  <p>
                    You can request details of retention periods or ask us to delete your data by contacting us.
                  </p>
                </Section>

                {/* Your Rights */}
                <Section id="your-rights" title="Your Legal Rights">
                  <p>Under data protection laws, you have the right to:</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <RightCard
                      number="1"
                      title="Request Access"
                      description="Receive a copy of the personal data we hold about you"
                    />
                    <RightCard
                      number="2"
                      title="Request Correction"
                      description="Have incomplete or inaccurate data corrected"
                    />
                    <RightCard
                      number="3"
                      title="Request Erasure"
                      description="Ask us to delete or remove personal data where there's no good reason for us to continue processing it"
                    />
                    <RightCard
                      number="4"
                      title="Object to Processing"
                      description="Object to processing based on legitimate interests or for direct marketing"
                    />
                    <RightCard
                      number="5"
                      title="Request Restriction"
                      description="Ask us to suspend processing in certain scenarios"
                    />
                    <RightCard
                      number="6"
                      title="Request Transfer"
                      description="Receive your personal data in a structured, machine-readable format"
                    />
                    <RightCard
                      number="7"
                      title="Withdraw Consent"
                      description="Withdraw consent at any time where we're relying on consent to process your data"
                    />
                  </div>

                  <Subsection title="Exercising Your Rights" className="mt-8">
                    <p>
                      To exercise any of these rights, please contact us at{' '}
                      <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300">
                        info@sixtyseconds.video
                      </a>
                      .
                    </p>
                    <InfoBox variant="success" className="mt-4">
                      <strong>No Fee Usually Required</strong>
                      <ul className="mt-2 space-y-1">
                        <li>You will not have to pay a fee to access your personal data or exercise other rights</li>
                        <li>We may charge a reasonable fee if your request is clearly unfounded, repetitive, or excessive</li>
                      </ul>
                    </InfoBox>
                    <InfoBox variant="info" className="mt-4">
                      <strong>Response Time</strong>
                      <ul className="mt-2 space-y-1">
                        <li>We try to respond to all legitimate requests within one month</li>
                        <li>If your request is particularly complex, it may take longer, and we will notify you</li>
                      </ul>
                    </InfoBox>
                  </Subsection>
                </Section>

                {/* Contact */}
                <Section id="contact" title="Contact Us">
                  <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <Mail className="w-6 h-6 text-blue-400" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white mb-4">
                          Sixty Seconds Limited
                        </h3>
                        <div className="space-y-2 text-gray-300">
                          <p>29 St Augustine's Parade</p>
                          <p>Bristol BS1 4UL</p>
                          <p>
                            Email:{' '}
                            <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300">
                              info@sixtyseconds.video
                            </a>
                          </p>
                          <p className="text-sm text-gray-400 mt-4">
                            For the attention of: The Directors
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Section>
              </div>

              {/* Back to Top */}
              <div className="mt-12 text-center">
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800/50 hover:bg-gray-800 text-gray-300 hover:text-white rounded-lg transition-all border border-gray-700/50"
                >
                  <ArrowLeft className="w-4 h-4 rotate-90" />
                  Back to Top
                </button>
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center gap-4">
            <img src={logoDark} alt="60" className="h-8 w-auto" />
            <p className="text-gray-400 text-sm text-center">
              © 2026 Sixty Seconds Ltd. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Section Component
interface SectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 sm:p-8"
      >
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 pb-4 border-b border-gray-700/50">
          {title}
        </h2>
        <div className="prose prose-invert prose-blue max-w-none space-y-4">
          {children}
        </div>
      </motion.div>
    </section>
  );
}

// Subsection Component
interface SubsectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

function Subsection({ title, children, className = '' }: SubsectionProps) {
  return (
    <div className={`mt-6 ${className}`}>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <div className="space-y-3 text-gray-300">
        {children}
      </div>
    </div>
  );
}

// Info Box Component
interface InfoBoxProps {
  variant: 'info' | 'warning' | 'success';
  children: React.ReactNode;
  className?: string;
}

function InfoBox({ variant, children, className = '' }: InfoBoxProps) {
  const variants = {
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300',
    success: 'bg-green-500/10 border-green-500/20 text-green-300',
  };

  return (
    <div className={`p-4 rounded-lg border ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}

// Data Type Card Component
interface DataTypeCardProps {
  title: string;
  description: string;
}

function DataTypeCard({ title, description }: DataTypeCardProps) {
  return (
    <div className="p-4 bg-gray-800/30 border border-gray-700/30 rounded-lg">
      <h4 className="font-semibold text-white mb-2">{title}</h4>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}

// Data Type Grid Component
function DataTypeGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {children}
    </div>
  );
}

// Disclosure Card Component
interface DisclosureCardProps {
  title: string;
  description: string;
}

function DisclosureCard({ title, description }: DisclosureCardProps) {
  return (
    <div className="p-4 bg-gray-800/30 border border-gray-700/30 rounded-lg">
      <h4 className="font-semibold text-white mb-2">{title}</h4>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}

// Right Card Component
interface RightCardProps {
  number: string;
  title: string;
  description: string;
}

function RightCard({ number, title, description }: RightCardProps) {
  return (
    <div className="p-4 bg-gray-800/30 border border-gray-700/30 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
          {number}
        </div>
        <div>
          <h4 className="font-semibold text-white mb-1">{title}</h4>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

// Usage Purpose Table Component
function UsagePurposeTable() {
  const purposes = [
    {
      title: 'Registration and Account Management',
      data: 'Identity and Contact Data',
      purpose: 'Register new customers, create profiles, sign up for workshops',
      basis: 'Performance of contract',
    },
    {
      title: 'Service Delivery and Payments',
      data: 'Identity, Contact, Financial, Transaction, Marketing and Communications Data',
      purpose: 'Manage subscriptions, deliver services, manage payments, recover debts',
      basis: 'Performance of contract, legitimate interests',
    },
    {
      title: 'Relationship Management',
      data: 'Identity, Contact, Profile, Marketing and Communications Data',
      purpose: 'Notify you of changes, request reviews/surveys/feedback',
      basis: 'Performance of contract, legitimate interests, legal obligation',
    },
    {
      title: 'Business Administration',
      data: 'Identity, Contact, Technical Data',
      purpose: 'Protect our business and website, troubleshooting, data analysis, system maintenance',
      basis: 'Legitimate interests, legal obligation',
    },
    {
      title: 'Marketing and Advertising',
      data: 'Identity, Contact, Profile, Usage, Marketing and Communications, Technical Data',
      purpose: 'Deliver relevant content and advertisements, measure effectiveness',
      basis: 'Legitimate interests',
    },
    {
      title: 'Analytics and Improvements',
      data: 'Technical and Usage Data',
      purpose: 'Improve website, products/services, marketing, customer experiences',
      basis: 'Legitimate interests',
    },
    {
      title: 'Recommendations',
      data: 'Identity, Contact, Profile, Usage, Marketing and Communications, Technical Data',
      purpose: 'Make suggestions about products or services that may interest you',
      basis: 'Legitimate interests',
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      {purposes.map((purpose, index) => (
        <div key={index} className="p-4 bg-gray-800/30 border border-gray-700/30 rounded-lg">
          <h4 className="font-semibold text-white mb-3">{purpose.title}</h4>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-400">Data used: </span>
              <span className="text-gray-300">{purpose.data}</span>
            </div>
            <div>
              <span className="text-gray-400">Purpose: </span>
              <span className="text-gray-300">{purpose.purpose}</span>
            </div>
            <div>
              <span className="text-gray-400">Legal basis: </span>
              <span className="text-blue-400">{purpose.basis}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

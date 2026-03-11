import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, FileText, Users, Lock, Globe, Mail, Scale } from 'lucide-react';
import { usePublicBrandingSettings } from '../lib/hooks/useBrandingSettings';
import { useForceDarkMode } from '../lib/hooks/useForceDarkMode';

interface TOCItem {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tableOfContents: TOCItem[] = [
  { id: 'introduction', title: 'Introduction', icon: FileText },
  { id: 'definitions', title: 'Definitions', icon: Scale },
  { id: 'account', title: 'Your Account', icon: Users },
  { id: 'services', title: 'Our Services', icon: Globe },
  { id: 'acceptable-use', title: 'Acceptable Use', icon: Shield },
  { id: 'intellectual-property', title: 'Intellectual Property', icon: Lock },
  { id: 'third-party', title: 'Third-Party Services', icon: Globe },
  { id: 'payment', title: 'Payment Terms', icon: FileText },
  { id: 'liability', title: 'Limitation of Liability', icon: Scale },
  { id: 'termination', title: 'Termination', icon: Lock },
  { id: 'governing-law', title: 'Governing Law', icon: Scale },
  { id: 'contact', title: 'Contact Us', icon: Mail },
];

export function TermsOfServicePage() {
  const [activeSection, setActiveSection] = useState('introduction');
  const { logoDark } = usePublicBrandingSettings();

  useForceDarkMode();

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

            <div className="w-20" />
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
                    <Scale className="w-4 h-4" />
                    Legal Document
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    Terms of Service
                  </h1>
                  <p className="text-xl text-gray-400 max-w-3xl">
                    These terms govern your use of 60 and the services provided by Sixty Seconds Ltd. Please read them carefully.
                  </p>
                  <p className="text-sm text-gray-500 mt-4">
                    Last Updated: <time dateTime="2026-03-04">4 March 2026</time>
                  </p>
                </motion.div>
              </div>

              {/* Sections */}
              <div className="space-y-8">
                <Section id="introduction" title="Introduction">
                  <p>
                    These Terms of Service ("Terms") are a legal agreement between you ("you", "your") and Sixty Seconds Ltd ("we", "us", "our", "60"), a company registered in England and Wales (Company Number 09723940), with its registered office at 29 St Augustine's Parade, Bristol BS1 4UL.
                  </p>
                  <p>
                    By accessing or using 60 at use60.com or any related services, you agree to be bound by these Terms. If you do not agree to these Terms, you must not use our services.
                  </p>
                  <p>
                    We may update these Terms from time to time. We will notify you of material changes by email or through the service. Your continued use of 60 after changes are posted constitutes acceptance of the updated Terms.
                  </p>
                </Section>

                <Section id="definitions" title="Definitions">
                  <div className="space-y-3">
                    <DefinitionItem term="Service" definition="The 60 platform, including the web application at use60.com, APIs, integrations, and all related features and functionality." />
                    <DefinitionItem term="Account" definition="Your registered account on the 60 platform, including all data, settings, and configurations associated with it." />
                    <DefinitionItem term="User Data" definition="Any data, content, or information you submit, upload, or make available through the Service, including CRM data, contacts, meeting notes, and communications." />
                    <DefinitionItem term="Third-Party Services" definition="External services integrated with 60, including but not limited to Google Workspace, Slack, email providers, and calendar services." />
                  </div>
                </Section>

                <Section id="account" title="Your Account">
                  <p>To use 60, you must create an account. You agree to:</p>
                  <ul>
                    <li>Provide accurate and complete registration information</li>
                    <li>Maintain the security and confidentiality of your login credentials</li>
                    <li>Notify us immediately of any unauthorized use of your account</li>
                    <li>Accept responsibility for all activities that occur under your account</li>
                  </ul>
                  <p>
                    We reserve the right to suspend or terminate accounts that violate these Terms or that we reasonably believe are being used fraudulently.
                  </p>
                </Section>

                <Section id="services" title="Our Services">
                  <p>
                    60 is a sales productivity platform that helps sales teams manage deals, contacts, meetings, and communications. Our services include:
                  </p>
                  <ul>
                    <li>CRM and pipeline management</li>
                    <li>Meeting preparation and follow-up automation</li>
                    <li>Email synchronization and AI-assisted drafting</li>
                    <li>Calendar integration and scheduling</li>
                    <li>AI-powered sales intelligence and coaching</li>
                    <li>Task management and workflow automation</li>
                  </ul>
                  <p>
                    We may modify, update, or discontinue features of the Service at any time. We will provide reasonable notice for material changes that affect your use of the Service.
                  </p>
                </Section>

                <Section id="acceptable-use" title="Acceptable Use">
                  <p>You agree not to use the Service to:</p>
                  <ul>
                    <li>Violate any applicable laws, regulations, or third-party rights</li>
                    <li>Send spam, unsolicited communications, or bulk messages in violation of anti-spam laws</li>
                    <li>Upload or transmit malicious code, viruses, or harmful content</li>
                    <li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
                    <li>Interfere with or disrupt the Service or its infrastructure</li>
                    <li>Reverse-engineer, decompile, or disassemble any part of the Service</li>
                    <li>Use the Service to store or transmit content that is defamatory, obscene, or illegal</li>
                    <li>Resell, sublicense, or redistribute access to the Service without our written consent</li>
                  </ul>
                </Section>

                <Section id="intellectual-property" title="Intellectual Property">
                  <Subsection title="Our Intellectual Property">
                    <p>
                      The Service, including its design, features, code, documentation, and branding, is owned by Sixty Seconds Ltd and is protected by copyright, trademark, and other intellectual property laws. Nothing in these Terms grants you any right to use our trademarks, logos, or brand elements.
                    </p>
                  </Subsection>
                  <Subsection title="Your Data">
                    <p>
                      You retain ownership of all User Data you submit to the Service. By using 60, you grant us a limited, non-exclusive licence to process, store, and display your User Data solely for the purpose of providing and improving the Service.
                    </p>
                    <p>
                      We will not sell, rent, or share your User Data with third parties except as described in our{' '}
                      <a href="/privacy" className="text-blue-400 hover:text-blue-300 transition-colors">Privacy Policy</a>.
                    </p>
                  </Subsection>
                </Section>

                <Section id="third-party" title="Third-Party Services">
                  <p>
                    60 integrates with third-party services to provide its functionality. When you connect a third-party service (such as Google Workspace, Slack, or an email provider), you acknowledge that:
                  </p>
                  <ul>
                    <li>Your use of third-party services is governed by their respective terms and privacy policies</li>
                    <li>We are not responsible for the availability, accuracy, or conduct of third-party services</li>
                    <li>You authorize us to access and use data from connected services as needed to provide 60's features</li>
                    <li>You can disconnect third-party services at any time from Settings</li>
                  </ul>

                  <Subsection title="Google API Services">
                    <p>
                      60's use and transfer of information received from Google APIs adheres to the{' '}
                      <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">
                        Google API Services User Data Policy
                      </a>
                      , including the Limited Use requirements. See our{' '}
                      <a href="/privacy" className="text-blue-400 hover:text-blue-300 transition-colors">Privacy Policy</a>
                      {' '}for full details on how Google data is handled.
                    </p>
                  </Subsection>
                </Section>

                <Section id="payment" title="Payment Terms">
                  <p>
                    Certain features of 60 require a paid subscription. If you subscribe to a paid plan:
                  </p>
                  <ul>
                    <li>Fees are billed in advance on a monthly or annual basis as selected</li>
                    <li>All fees are non-refundable unless otherwise stated or required by law</li>
                    <li>We may change pricing with 30 days' notice before your next billing cycle</li>
                    <li>Failure to pay may result in suspension or termination of your account</li>
                  </ul>
                  <p>
                    Payments are processed securely by our payment provider (Stripe). We do not store your full payment card details on our servers.
                  </p>
                </Section>

                <Section id="liability" title="Limitation of Liability">
                  <p>
                    To the maximum extent permitted by law:
                  </p>
                  <ul>
                    <li>The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied</li>
                    <li>We do not warrant that the Service will be uninterrupted, error-free, or completely secure</li>
                    <li>Our total liability to you for any claims arising from or related to these Terms or the Service shall not exceed the amount you paid us in the 12 months preceding the claim</li>
                    <li>We are not liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities</li>
                  </ul>
                  <p>
                    Nothing in these Terms excludes or limits our liability for death or personal injury caused by our negligence, fraud, or any other liability that cannot be excluded by law.
                  </p>
                </Section>

                <Section id="termination" title="Termination">
                  <p>
                    You may terminate your account at any time by contacting us or through the account settings. We may terminate or suspend your access to the Service:
                  </p>
                  <ul>
                    <li>If you breach these Terms</li>
                    <li>If required by law or regulation</li>
                    <li>If we discontinue the Service (with reasonable notice)</li>
                  </ul>
                  <p>
                    Upon termination, your right to use the Service ceases immediately. We will retain your data for a reasonable period to allow you to export it, after which it will be deleted in accordance with our{' '}
                    <a href="/privacy" className="text-blue-400 hover:text-blue-300 transition-colors">Privacy Policy</a>.
                  </p>
                </Section>

                <Section id="governing-law" title="Governing Law">
                  <p>
                    These Terms are governed by and construed in accordance with the laws of England and Wales. Any disputes arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of England and Wales.
                  </p>
                  <p>
                    If any provision of these Terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.
                  </p>
                </Section>

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
              &copy; {new Date().getFullYear()} Sixty Seconds Ltd. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Reusable components (matching PrivacyPolicyPage style)

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
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

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <div className="space-y-3 text-gray-300">{children}</div>
    </div>
  );
}

function DefinitionItem({ term, definition }: { term: string; definition: string }) {
  return (
    <div className="p-4 bg-gray-800/30 border border-gray-700/30 rounded-lg">
      <h4 className="font-semibold text-white mb-1">{term}</h4>
      <p className="text-sm text-gray-400">{definition}</p>
    </div>
  );
}

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
  { id: 'acceptance', title: 'Acceptance of Terms', icon: FileText },
  { id: 'account-terms', title: 'Account Terms', icon: Users },
  { id: 'service-description', title: 'Service Description', icon: Globe },
  { id: 'acceptable-use', title: 'Acceptable Use', icon: Shield },
  { id: 'intellectual-property', title: 'Intellectual Property', icon: Lock },
  { id: 'payment-billing', title: 'Payment & Billing', icon: FileText },
  { id: 'termination', title: 'Termination', icon: Users },
  { id: 'limitation-liability', title: 'Limitation of Liability', icon: Shield },
  { id: 'governing-law', title: 'Governing Law', icon: Globe },
  { id: 'contact', title: 'Contact Us', icon: Mail },
];

export function TermsOfServicePage() {
  const [activeSection, setActiveSection] = useState('acceptance');
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
                    <FileText className="w-4 h-4" />
                    Legal Document
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    Terms of Service
                  </h1>
                  <p className="text-xl text-gray-400 max-w-3xl">
                    Please read these terms carefully before using the 60 platform. By accessing or using our service, you agree to be bound by these terms.
                  </p>
                  <p className="text-sm text-gray-500 mt-4">
                    Effective Date: <time dateTime="2026-03-02">2 March 2026</time>
                  </p>
                </motion.div>
              </div>

              {/* Terms of Service Sections */}
              <div className="space-y-8">
                {/* Acceptance of Terms */}
                <Section id="acceptance" title="Acceptance of Terms">
                  <p>
                    By accessing or using the 60 platform (the "Service"), operated by Sixty Seconds Ltd, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you must not use the Service.
                  </p>
                  <p>
                    These Terms apply to all users of the Service, including individuals accessing the platform on behalf of their employer or another organisation. In such cases, you represent and warrant that you have the authority to bind that organisation to these Terms.
                  </p>
                  <InfoBox variant="info">
                    We may update these Terms from time to time. We will notify you of material changes by email or via an in-app notice. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
                  </InfoBox>
                </Section>

                {/* Account Terms */}
                <Section id="account-terms" title="Account Terms">
                  <Subsection title="Eligibility">
                    <p>
                      You must be at least 18 years of age to use the Service. By using the Service, you represent and warrant that you meet this age requirement. The Service is intended for business use; it is not designed for or directed at children.
                    </p>
                  </Subsection>

                  <Subsection title="Account Registration">
                    <p>
                      To access the Service, you must create an account. You agree to:
                    </p>
                    <ul>
                      <li>Provide accurate, current, and complete information during registration</li>
                      <li>Maintain and promptly update your account information</li>
                      <li>Keep your password and login credentials secure and confidential</li>
                      <li>Notify us immediately of any unauthorised access to your account</li>
                      <li>Maintain only one active account per individual</li>
                    </ul>
                  </Subsection>

                  <Subsection title="Account Responsibility">
                    <p>
                      You are solely responsible for all activity that occurs under your account. Sixty Seconds Ltd is not liable for any loss or damage arising from unauthorised use of your account credentials. You must not share your account credentials with any third party.
                    </p>
                    <InfoBox variant="warning">
                      If you suspect your account has been compromised, contact us immediately at{' '}
                      <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300 transition-colors">
                        info@sixtyseconds.video
                      </a>
                      .
                    </InfoBox>
                  </Subsection>
                </Section>

                {/* Service Description */}
                <Section id="service-description" title="Service Description">
                  <p>
                    60 is an AI-powered sales productivity platform designed to automate sales administration for solo founders and small sales teams. The Service integrates with your existing tools — email, calendar, CRM, and communication platforms — to surface insights and take action on your behalf.
                  </p>

                  <Subsection title="Core Features">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <FeatureCard title="Meeting Intelligence" description="Automatic transcription, action item extraction, and follow-up generation" />
                      <FeatureCard title="Pipeline Management" description="AI-driven deal health monitoring and pipeline analysis" />
                      <FeatureCard title="Outreach Automation" description="Personalised email drafting and outreach sequence management" />
                      <FeatureCard title="Lead Research" description="Automated prospect enrichment and meeting preparation" />
                    </div>
                  </Subsection>

                  <Subsection title="Service Changes">
                    <p>
                      We reserve the right to modify, suspend, or discontinue any part of the Service at any time, with or without notice. We will make reasonable efforts to notify you in advance of significant changes that may affect your use of the Service. Sixty Seconds Ltd shall not be liable to you or any third party for any modification, suspension, or discontinuation of the Service.
                    </p>
                  </Subsection>

                  <Subsection title="Third-Party Integrations">
                    <p>
                      The Service integrates with third-party platforms including Google Workspace, Slack, HubSpot, and others. Your use of these integrations is subject to the relevant third-party terms of service. Sixty Seconds Ltd is not responsible for the availability or conduct of third-party services.
                    </p>
                  </Subsection>
                </Section>

                {/* Acceptable Use */}
                <Section id="acceptable-use" title="Acceptable Use">
                  <p>
                    You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not use the Service in any way that could damage, disable, overburden, or impair the platform.
                  </p>

                  <Subsection title="Prohibited Activities">
                    <p>You must not use the Service to:</p>
                    <ul>
                      <li>Send unsolicited bulk email, spam, or any form of mass unsolicited communication</li>
                      <li>Scrape, harvest, or collect data from the Service or third-party platforms in an unauthorised manner</li>
                      <li>Engage in any illegal activity, including data protection violations or consumer protection breaches</li>
                      <li>Circumvent, disable, or interfere with security-related features of the Service</li>
                      <li>Exceed rate limits or otherwise place unreasonable load on our infrastructure</li>
                      <li>Impersonate any person or entity, or misrepresent your affiliation with any person or entity</li>
                      <li>Upload or transmit viruses, malware, or any other malicious code</li>
                      <li>Use the Service to compete with Sixty Seconds Ltd or to build a substantially similar product</li>
                      <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                    </ul>
                  </Subsection>

                  <Subsection title="AI Usage">
                    <p>
                      The Service uses artificial intelligence to generate content, suggestions, and insights. You are responsible for reviewing and verifying any AI-generated output before acting on it or sharing it with third parties. You must not use AI-generated content in any manner that is misleading, defamatory, or harmful to others.
                    </p>
                    <InfoBox variant="warning">
                      AI-generated content may contain errors or inaccuracies. Always review outputs before sending emails, creating proposals, or making business decisions based on AI suggestions.
                    </InfoBox>
                  </Subsection>

                  <Subsection title="Rate Limits and Fair Use">
                    <p>
                      The Service operates within defined usage limits depending on your subscription plan. Excessive or automated usage that degrades the experience for other users may result in temporary throttling or, in severe cases, account suspension.
                    </p>
                  </Subsection>
                </Section>

                {/* Intellectual Property */}
                <Section id="intellectual-property" title="Intellectual Property">
                  <Subsection title="Platform Ownership">
                    <p>
                      The Service, including all software, algorithms, user interfaces, content, and documentation, is owned by Sixty Seconds Ltd and protected by intellectual property laws. Nothing in these Terms transfers any intellectual property rights to you. You are granted a limited, non-exclusive, non-transferable licence to use the Service in accordance with these Terms.
                    </p>
                  </Subsection>

                  <Subsection title="Your Data">
                    <p>
                      You retain ownership of all data, content, and information you upload to or create using the Service ("User Data"). By using the Service, you grant Sixty Seconds Ltd a limited licence to use your User Data solely to operate and improve the Service on your behalf.
                    </p>
                    <InfoBox variant="success">
                      We do not sell your data to third parties. Your User Data is used exclusively to provide and improve the Service for you.
                    </InfoBox>
                  </Subsection>

                  <Subsection title="AI-Generated Content">
                    <p>
                      Content generated by the AI features of the Service using your data and prompts is provided to you for your use. To the extent permissible by law, Sixty Seconds Ltd assigns to you any rights it may hold in AI-generated content produced specifically from your inputs. You are responsible for ensuring that your use of such content does not infringe the rights of third parties.
                    </p>
                  </Subsection>

                  <Subsection title="Feedback">
                    <p>
                      If you provide feedback, suggestions, or ideas about the Service, you grant Sixty Seconds Ltd a perpetual, irrevocable, royalty-free licence to use such feedback for any purpose without compensation to you.
                    </p>
                  </Subsection>
                </Section>

                {/* Payment & Billing */}
                <Section id="payment-billing" title="Payment &amp; Billing">
                  <Subsection title="Subscription Plans">
                    <p>
                      Access to the Service is provided on a subscription basis. Subscription fees are charged in advance on a monthly or annual basis, depending on the plan you select. All fees are stated exclusive of VAT, which will be added where applicable.
                    </p>
                  </Subsection>

                  <Subsection title="Payment Processing">
                    <p>
                      Payments are processed by our third-party payment providers. By providing payment details, you authorise us to charge the applicable fees to your payment method on each renewal date. You are responsible for ensuring your payment details remain current and that sufficient funds are available.
                    </p>
                  </Subsection>

                  <Subsection title="Price Changes">
                    <p>
                      We reserve the right to change subscription prices. We will provide at least 30 days' written notice of any price increase before it takes effect. Your continued use of the Service after the new pricing takes effect constitutes acceptance of the revised fees. If you do not accept the new pricing, you may cancel your subscription before the price change applies.
                    </p>
                  </Subsection>

                  <Subsection title="Refund Policy">
                    <p>
                      Subscription fees are generally non-refundable. However, if you experience a significant service disruption attributable to us, you may request a credit or partial refund at our discretion. Annual subscriptions cancelled within 14 days of initial purchase may be eligible for a pro-rated refund.
                    </p>
                    <InfoBox variant="info">
                      To request a refund or billing adjustment, contact us at{' '}
                      <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300 transition-colors">
                        info@sixtyseconds.video
                      </a>{' '}
                      with your account details and the reason for your request.
                    </InfoBox>
                  </Subsection>

                  <Subsection title="Credit-Based Features">
                    <p>
                      Some features of the Service operate on a credit basis, where each action consumes a defined number of credits. Credits are non-refundable and expire at the end of the billing period unless otherwise stated. Auto top-up options are available on supported plans.
                    </p>
                  </Subsection>
                </Section>

                {/* Termination */}
                <Section id="termination" title="Termination">
                  <Subsection title="Termination by You">
                    <p>
                      You may cancel your subscription and terminate your account at any time through the account settings in the Service or by contacting us. Cancellation will take effect at the end of your current billing period, and you will continue to have access to the Service until that date.
                    </p>
                  </Subsection>

                  <Subsection title="Termination by Us">
                    <p>
                      Sixty Seconds Ltd may suspend or terminate your account immediately if:
                    </p>
                    <ul>
                      <li>You breach any provision of these Terms</li>
                      <li>You engage in fraudulent or illegal activity</li>
                      <li>You fail to pay subscription fees when due</li>
                      <li>We are required to do so by law or regulation</li>
                      <li>We discontinue the Service</li>
                    </ul>
                    <p>
                      Where practical, we will provide advance notice before terminating your account, except in cases of serious breach or legal obligation.
                    </p>
                  </Subsection>

                  <Subsection title="Effect of Termination">
                    <p>
                      Upon termination of your account, your right to access the Service will cease immediately. We will retain your User Data for 30 days following termination, during which time you may request an export of your data. After this period, your data will be deleted in accordance with our data retention policy.
                    </p>
                    <InfoBox variant="success">
                      To request a data export before your account is closed, contact us at{' '}
                      <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300 transition-colors">
                        info@sixtyseconds.video
                      </a>{' '}
                      within 30 days of account termination.
                    </InfoBox>
                  </Subsection>
                </Section>

                {/* Limitation of Liability */}
                <Section id="limitation-liability" title="Limitation of Liability">
                  <Subsection title="No Warranty">
                    <p>
                      The Service is provided on an "as is" and "as available" basis without any warranties, express or implied. To the fullest extent permitted by law, Sixty Seconds Ltd disclaims all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
                    </p>
                    <InfoBox variant="warning">
                      AI-generated content, insights, and recommendations are provided for informational purposes only. Sixty Seconds Ltd makes no warranty as to the accuracy, completeness, or fitness for any purpose of AI outputs. You are solely responsible for any decisions you make based on such outputs.
                    </InfoBox>
                  </Subsection>

                  <Subsection title="Limitation of Liability">
                    <p>
                      To the maximum extent permitted by applicable law, Sixty Seconds Ltd shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenue, data, or business opportunities, arising out of or in connection with your use of the Service, even if we have been advised of the possibility of such damages.
                    </p>
                    <p>
                      Our total aggregate liability to you arising out of or in connection with these Terms shall not exceed the total fees paid by you to Sixty Seconds Ltd in the three months immediately preceding the event giving rise to the claim.
                    </p>
                  </Subsection>

                  <Subsection title="Exceptions">
                    <p>
                      Nothing in these Terms limits or excludes our liability for:
                    </p>
                    <ul>
                      <li>Death or personal injury caused by our negligence</li>
                      <li>Fraud or fraudulent misrepresentation</li>
                      <li>Any other liability that cannot be excluded or limited under applicable law</li>
                    </ul>
                  </Subsection>
                </Section>

                {/* Governing Law */}
                <Section id="governing-law" title="Governing Law">
                  <p>
                    These Terms and any dispute or claim arising out of or in connection with them (including non-contractual disputes or claims) shall be governed by and construed in accordance with the laws of England and Wales.
                  </p>
                  <p>
                    The courts of England and Wales shall have exclusive jurisdiction to settle any dispute or claim arising out of or in connection with these Terms or their subject matter or formation.
                  </p>

                  <Subsection title="Dispute Resolution">
                    <p>
                      Before commencing any legal proceedings, we encourage you to contact us to resolve any dispute informally. Most concerns can be resolved quickly and to everyone's satisfaction by contacting us at{' '}
                      <a href="mailto:info@sixtyseconds.video" className="text-blue-400 hover:text-blue-300 transition-colors">
                        info@sixtyseconds.video
                      </a>
                      .
                    </p>
                  </Subsection>

                  <Subsection title="Severability">
                    <p>
                      If any provision of these Terms is found to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it enforceable.
                    </p>
                  </Subsection>

                  <Subsection title="Entire Agreement">
                    <p>
                      These Terms, together with our Privacy Policy, constitute the entire agreement between you and Sixty Seconds Ltd regarding your use of the Service and supersede all prior agreements and understandings.
                    </p>
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
                          Sixty Seconds Ltd
                        </h3>
                        <div className="space-y-2 text-gray-300">
                          <p>Company Number: 09723940</p>
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
              &copy; 2026 Sixty Seconds Ltd. All rights reserved.
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

// Feature Card Component
interface FeatureCardProps {
  title: string;
  description: string;
}

function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <div className="p-4 bg-gray-800/30 border border-gray-700/30 rounded-lg">
      <h4 className="font-semibold text-white mb-2">{title}</h4>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}

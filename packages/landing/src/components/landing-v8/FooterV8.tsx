import { motion } from 'framer-motion';

const FOOTER_LINKS = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Integrations', href: '#integrations' },
    { label: 'Pricing', href: '/pricing' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
  ],
  Resources: [
    { label: 'Documentation', href: '#' },
    { label: 'Changelog', href: '#' },
    { label: 'Status', href: '#' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

export function FooterV8() {
  return (
    <footer className="bg-gray-900 dark:bg-[#050505] text-gray-400 py-16 md:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12">
          {/* Logo + tagline */}
          <div className="col-span-2 md:col-span-1">
            <a href="/" className="font-display font-extrabold text-2xl text-white tracking-tight">
              60
            </a>
            <p className="mt-3 text-sm text-gray-500 leading-relaxed">
              The AI command center for sales. Everything before and after the call.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-medium text-white text-sm mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-gray-800 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-600">
            &copy; {new Date().getFullYear()} Sixty Seconds. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {/* SOC 2 / security badges could go here */}
            <span className="text-xs text-gray-600 dark:text-gray-600">Built with care in Australia</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

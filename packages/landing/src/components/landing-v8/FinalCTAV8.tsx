import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface FinalCTAV8Props {
  onBookDemo: (email: string) => void;
}

export function FinalCTAV8({ onBookDemo }: FinalCTAV8Props) {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) onBookDemo(email.trim());
  };

  return (
    <section className="bg-gray-50 dark:bg-[#111] py-24 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl mx-auto px-6 text-center"
      >
        <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
          Your next follow-up is
          <br />
          60 seconds away
        </h2>
        <p className="mt-6 text-gray-500 dark:text-gray-400 text-lg font-body">
          Schedule a demo and see 60 work on your actual pipeline. 30 minutes. No strings.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-10 flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="flex-1 px-4 py-3 rounded-lg border border-gray-200 dark:border-white/10
              bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm font-body
              focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 focus:border-transparent
              focus:bg-white dark:focus:bg-white/10
              transition-shadow"
            required
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-lg text-sm font-semibold
              bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600
              transition-all hover:translate-y-[-1px] hover:shadow-lg
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-emerald-500 focus-visible:ring-offset-2
              flex items-center justify-center gap-2"
          >
            Book a demo
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="mt-4 text-gray-400 dark:text-gray-500 text-sm font-body">
          We'd love to set you up. No credit card. No commitment.
        </p>
      </motion.div>
    </section>
  );
}

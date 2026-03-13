import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

interface TestimonialInlineV8Props {
  quote: string;
  author: string;
  role: string;
}

export function TestimonialInlineV8({ quote, author, role }: TestimonialInlineV8Props) {
  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-20 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-3xl mx-auto px-6 text-center"
      >
        <Quote className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-6" />
        <blockquote className="font-body text-xl md:text-2xl text-gray-700 dark:text-gray-200 leading-relaxed italic">
          "{quote}"
        </blockquote>
        <div className="mt-6">
          <p className="font-medium text-gray-900 dark:text-white text-sm">{author}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">{role}</p>
        </div>
      </motion.div>
    </section>
  );
}

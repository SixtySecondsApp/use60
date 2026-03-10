export function FooterV7() {
  return (
    <footer className="border-t border-white/[0.08] py-8">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <a
            href="/"
            className="font-display font-bold text-lg text-stone-500 tracking-tight"
          >
            60
          </a>
          <span className="text-stone-500 text-sm">
            &copy; 2026 Sixty Seconds
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm text-stone-500">
          <a
            href="/pricing"
            className="hover:text-stone-300 transition-colors"
          >
            Pricing
          </a>
          <a
            href="/privacy"
            className="hover:text-stone-300 transition-colors"
          >
            Privacy
          </a>
          <a
            href="/terms"
            className="hover:text-stone-300 transition-colors"
          >
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}

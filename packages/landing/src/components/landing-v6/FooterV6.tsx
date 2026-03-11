export function FooterV6() {
  return (
    <footer className="border-t border-zinc-800 py-10 px-5 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <a href="/" className="font-display text-lg font-bold text-white tracking-tight">
            60
          </a>
          <span className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} Sixty Seconds
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <a href="/pricing" className="hover:text-white transition-colors">
            Pricing
          </a>
          <a href="/privacy" className="hover:text-white transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-white transition-colors">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}

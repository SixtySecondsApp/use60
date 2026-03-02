export function FooterV5() {
  return (
    <footer className="border-t border-white/[0.04] py-8 px-5 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm font-bold text-zinc-600 tracking-tight">60</span>
        <div className="flex items-center gap-6 text-xs text-zinc-600">
          <a href="/privacy-policy" className="hover:text-zinc-400 transition-colors">Privacy</a>
          <a href="/pricing" className="hover:text-zinc-400 transition-colors">Pricing</a>
          <span>&copy; {new Date().getFullYear()} Sixty AI</span>
        </div>
      </div>
    </footer>
  );
}

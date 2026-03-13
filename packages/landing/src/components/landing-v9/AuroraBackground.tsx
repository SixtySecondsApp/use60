export function AuroraBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute -top-1/2 -left-1/4 w-[80vw] h-[80vh] rounded-full opacity-20 dark:opacity-15 blur-[100px] bg-blue-400 dark:bg-emerald-600 animate-[aurora-float-1_12s_ease-in-out_infinite]" />
      <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vh] rounded-full opacity-15 dark:opacity-10 blur-[100px] bg-indigo-300 dark:bg-teal-700 animate-[aurora-float-2_15s_ease-in-out_infinite]" />
      <div className="absolute top-1/4 left-1/3 w-[50vw] h-[50vh] rounded-full opacity-10 dark:opacity-[0.08] blur-[100px] bg-purple-300 dark:bg-cyan-800 animate-[aurora-float-3_10s_ease-in-out_infinite]" />
      <style>{`
        @keyframes aurora-float-1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30%, -20%) scale(1.2); } }
        @keyframes aurora-float-2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-20%, 30%) scale(1.1); } }
        @keyframes aurora-float-3 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(15%, 15%) scale(1.3); } }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[aurora-float-1_12s_ease-in-out_infinite\\],
          .animate-\\[aurora-float-2_15s_ease-in-out_infinite\\],
          .animate-\\[aurora-float-3_10s_ease-in-out_infinite\\] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

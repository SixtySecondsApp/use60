interface DiffViewProps {
  oldContent: string;
  newContent: string;
}

export function DiffView({ oldContent, newContent }: DiffViewProps) {
  // Simple line-by-line diff
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const maxLines = Math.max(oldLines.length, newLines.length);

  return (
    <div className="grid grid-cols-2 gap-4 font-mono text-sm">
      {/* Old Version */}
      <div>
        <h4 className="font-semibold mb-2 text-red-600">Previous Version</h4>
        <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-lg border border-red-200 dark:border-red-900 overflow-auto max-h-[600px]">
          {oldLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {newLines[i] !== line && (
                <span className="bg-red-200 dark:bg-red-900/50">{line}</span>
              )}
              {newLines[i] === line && <span className="text-slate-500">{line}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* New Version */}
      <div>
        <h4 className="font-semibold mb-2 text-green-600">New Version</h4>
        <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-900 overflow-auto max-h-[600px]">
          {newLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {oldLines[i] !== line && (
                <span className="bg-green-200 dark:bg-green-900/50">{line}</span>
              )}
              {oldLines[i] === line && <span className="text-slate-500">{line}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

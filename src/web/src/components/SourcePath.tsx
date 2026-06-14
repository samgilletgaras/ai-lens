import { FolderOpen } from 'lucide-react';

export function SourcePath({ path }: { path: string }) {
  function openInFileManager() {
    fetch('/api/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono min-w-0 truncate">{path}</span>
      <button
        onClick={openInFileManager}
        title="Open in file manager"
        className="text-[10px] px-2 py-0.5 rounded border border-lens-accent/40 text-lens-accent hover:bg-lens-accent/20 transition-colors shrink-0"
      >
        <FolderOpen className="w-3 h-3" />
      </button>
    </div>
  );
}

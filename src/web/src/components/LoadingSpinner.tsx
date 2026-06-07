export function LoadingSpinner({ label, size = 'md' }: { label?: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-4 h-4 border-[1.5px]' : 'w-6 h-6 border-2';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${dim} rounded-full border-lens-border border-t-lens-accent animate-spin`} />
      {label && <span>{label}</span>}
    </div>
  );
}

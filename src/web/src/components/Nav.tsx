import type { NavItem } from './navConfig';

export function NavButton({ item, active, collapsed, onClick }: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = item.icon;
  const activeCls = active ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30';
  if (collapsed) {
    return (
      <button onClick={onClick} title={item.label} className={`w-full flex justify-center p-2 rounded transition-colors ${activeCls}`}>
        <Icon className="w-4 h-4" />
      </button>
    );
  }
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${activeCls}`}>
      <Icon className="w-4 h-4 mr-2 shrink-0" /> {item.label}
    </button>
  );
}

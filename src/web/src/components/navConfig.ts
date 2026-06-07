import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MessageSquare, Activity, Layers, Bot, Plug, Brain, ClipboardList } from 'lucide-react';
import type { ProviderCapabilities, ProviderInfo } from '../types';
import type { AppView } from '../routing';
import { GlobalDiagnostics } from './GlobalDiagnostics';
import { SkillsViewer } from './SkillsViewer';
import { AgentsViewer } from './AgentsViewer';
import { MCPsViewer } from './MCPsViewer';
import { MemoryViewer } from './MemoryViewer';
import { PlansViewer } from './PlansViewer';

// Sidebar navigation, driven by data so the collapsed and expanded rails stay
// in sync. `cap === null` means always shown; otherwise gated by that capability.
export type NavItem = { view: AppView; icon: LucideIcon; label: string; cap: keyof ProviderCapabilities | null };

export const NAV_ITEMS: NavItem[] = [
  { view: 'logs', icon: Activity, label: 'Diagnostics', cap: null },
  { view: 'history', icon: MessageSquare, label: 'Sessions', cap: null },
  { view: 'memory', icon: Brain, label: 'Memory', cap: 'hasMemory' },
  { view: 'plans', icon: ClipboardList, label: 'Plans', cap: 'hasPlans' },
  { view: 'agents', icon: Bot, label: 'Agents', cap: 'hasAgents' },
  { view: 'skills', icon: Layers, label: 'Skills', cap: 'hasSkills' },
  { view: 'mcps', icon: Plug, label: 'MCPs', cap: 'hasMcps' },
];

// Views that are a single self-fetching component sharing the same props.
// `providers` is consumed only by views that surface provider provenance (e.g. the
// all-mode Diagnostics cost breakdown); others ignore it.
export const SIMPLE_VIEWS: Partial<Record<AppView, ComponentType<{ demoMode: boolean; providers: ProviderInfo[]; provider?: string | null; showSourcePaths?: boolean }>>> = {
  logs: GlobalDiagnostics, skills: SkillsViewer, agents: AgentsViewer,
  mcps: MCPsViewer, memory: MemoryViewer, plans: PlansViewer,
};

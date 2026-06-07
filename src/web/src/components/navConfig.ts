import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MessageSquare, Activity, Layers, Bot, Plug, Brain, ClipboardList } from 'lucide-react';
import type { ProviderCapabilities, ProviderInfo } from '../types';
import type { AppView } from '../routing';
import { LogsViewer } from './LogsViewer';
import { SkillsViewer } from './SkillsViewer';
import { AgentsViewer } from './AgentsViewer';
import { MCPsViewer } from './MCPsViewer';
import { MemoryViewer } from './MemoryViewer';
import { PlansViewer } from './PlansViewer';

// Sidebar navigation, driven by data so the collapsed and expanded rails stay
// in sync. `cap === null` means always shown; otherwise gated by that capability.
export type NavItem = { view: AppView; icon: LucideIcon; label: string; cap: keyof ProviderCapabilities | null };

export const NAV_ITEMS: NavItem[] = [
  { view: 'history', icon: MessageSquare, label: 'Chat History', cap: null },
  { view: 'logs', icon: Activity, label: 'Diagnostics', cap: 'hasLogs' },
  { view: 'skills', icon: Layers, label: 'Skills', cap: 'hasSkills' },
  { view: 'agents', icon: Bot, label: 'Agents', cap: 'hasAgents' },
  { view: 'mcps', icon: Plug, label: 'MCPs', cap: 'hasMcps' },
  { view: 'memory', icon: Brain, label: 'Memory', cap: 'hasMemory' },
  { view: 'plans', icon: ClipboardList, label: 'Plans', cap: 'hasPlans' },
];

// Views that are a single self-fetching component sharing the same props.
// `providers` is consumed only by views that surface provider provenance (e.g. the
// all-mode Diagnostics cost breakdown); others ignore it.
export const SIMPLE_VIEWS: Partial<Record<AppView, ComponentType<{ demoMode: boolean; providers: ProviderInfo[]; provider?: string | null; showSourcePaths?: boolean }>>> = {
  logs: LogsViewer, skills: SkillsViewer, agents: AgentsViewer,
  mcps: MCPsViewer, memory: MemoryViewer, plans: PlansViewer,
};

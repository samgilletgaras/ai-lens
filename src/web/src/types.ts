export type Provider = string;

export interface ProviderCapabilities {
  hasHistory: boolean;
  hasStats: boolean;
  hasLogs: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasMcps: boolean;
  hasMemory: boolean;
  hasPlans: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  icon?: string | null; // lucide icon name, resolved via iconFor() in utils
  available: boolean;
  capabilities: ProviderCapabilities;
}

export interface Block {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

export interface AttachmentContent {
  type?: string;
  hookName?: string;
  hookEvent?: string;
  command?: string;
  content?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system_attachment' | 'system';
  content: string | Block[] | AttachmentContent;
  timestamp: number;
}

export interface ProjectSummary {
  id: string;
  fullPath: string;
  sessionCount: number;
  lastUpdated: number;
  provider?: string; // source provider id, set only under the "All Providers" view
}

export interface ConversationSummary {
  id: string;
  project: string;
  lastUpdated: number;
  firstMessageTs: number;
  preview: string;
  tokens?: { input: number; output: number; cacheRead: number; cacheCreation: number };
  turnCount?: number;
  metadata?: Record<string, string>;
  provider?: string; // source provider id, set only under the "All Providers" view
}

export interface Conversation {
  id: string;
  project: string;
  lastUpdated: number;
  messages: Message[];
  tokens?: { input: number; output: number; cacheRead: number; cacheCreation: number };
  turnCount?: number;
}

export interface Skill {
  slug: string;
  name: string;
  description: string | null;
  hasSkillMd: boolean;
  trigger: string | null;
  totalCalls: number;
  lastUsed: number | null;
  provider?: string; // source provider id, set only under the "All Providers" view
}

export interface SkillDetail {
  slug: string;
  name: string;
  hasSkillMd: boolean;
  frontmatter: Record<string, string>;
  body: string | null;
}

export interface LogEntry {
  project: string;
  session: string;
  lineNumber: number;
  raw: Record<string, unknown>;
}

export interface MCPServer {
  id: string;
  name: string;
  type: 'plugin' | 'cloud';
  config: { command?: string; args?: string[]; type?: string; url?: string } | null;
  toolCount: number;
  totalCalls: number;
  lastUsed: number | null;
  auth?: { authenticated: boolean; timestamp: number };
  source?: string;
  provider?: string; // source provider id, set only under the "All Providers" view
}

export interface MCPTool {
  name: string;
  count: number;
  lastUsed: number | null;
}

export interface MCPServerDetail extends MCPServer {
  tools: MCPTool[];
}

export interface MemoryEntry {
  project: string;
  filename: string;
  name: string;
  description: string | null;
  type: 'user' | 'feedback' | 'project' | 'reference' | null;
  snippet: string | null;
  provider?: string; // source provider id, set only under the "All Providers" view
}

export interface MemoryEntryDetail extends MemoryEntry {
  frontmatter: Record<string, string>;
  body: string;
}

export interface Plan {
  filename: string;
  title: string;
  snippet: string | null;
  mtime: number;
  provider?: string; // source provider id, set only under the "All Providers" view
}

export interface PlanDetail extends Plan {
  body: string;
}

export interface ProjectStats {
  totals: { sessions: number; messages: number; toolCalls: number };
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number; cacheHitRate: number };
  models: Record<string, number>;
  topTools: { name: string; count: number }[];
  activity: Record<string, number>;
  hooks: { success: number; failure: number; avgDurationMs: number };
  estimatedCostUsd: number;
}

export interface DiagnosticsStats {
  totals: { sessions: number; messages: number; toolCalls: number };
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number; cacheHitRate: number };
  stopReasons: Record<string, number>;
  models: Record<string, number>;
  hooks: { success: number; failure: number; avgDurationMs: number };
  topProjects: { id: string; messageCount: number; tokenCount: number; provider?: string }[];
  activity: Record<string, number>;
  estimatedCostUsd: number;
  estimatedCostByProvider?: Record<string, number>; // set only under the "All Providers" view
}

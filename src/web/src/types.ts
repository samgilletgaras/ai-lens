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
  hasSystemPrompts: boolean;
}

export interface SystemPromptEntry {
  label: string;
  filename: string;
  sourcePath: string;
  content: string;
  exists: boolean;
  provider?: string; // source provider id, set only under the "All Providers" view
}

export interface ProviderInfo {
  id: string;
  name: string;
  icon?: string | null; // lucide icon name, resolved via iconFor() in utils
  available: boolean;
  capabilities: ProviderCapabilities;
  vscodeInsidersDetected?: boolean;
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

/**
 * Normalized message event emitted by every provider's getMessages().
 * Each entry represents exactly one event — no bundled Block arrays.
 *
 * role          content / extra fields
 * ──────────    ──────────────────────
 * user          content: string
 * assistant     content: string
 * thinking      content: string           (Claude only)
 * tool_use      name, input, id?          (all providers)
 * tool_result   content, is_error?,
 *               tool_use_id?              (Claude + demo)
 * system        content: string
 * system_attachment  content: AttachmentContent  (Claude only)
 * local_command name, caveat?             (Claude slash commands)
 * skill_use     name (slug), location?   (Claude + Pi)
 */
export interface Message {
  role: 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result'
      | 'system' | 'system_attachment' | 'local_command' | 'skill_use';
  /** Text payload for user / assistant / thinking / tool_result / system */
  content?: string | AttachmentContent;
  /** tool_use, local_command, skill_use */
  name?: string;
  /** tool_use */
  input?: Record<string, unknown>;
  /** tool_use */
  id?: string;
  /** tool_result */
  tool_use_id?: string;
  /** tool_result */
  is_error?: boolean;
  /** local_command — the <local-command-caveat> text */
  caveat?: string;
  /** skill_use (Pi only) — path to the SKILL.md file */
  location?: string;
  timestamp: number | null;
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
  sourcePaths?: string[];
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
  sourcePath?: string;
  providers?: string[]; // source provider ids, set only under the "All Providers" view
}

export interface SkillDetail {
  slug: string;
  name: string;
  hasSkillMd: boolean;
  frontmatter: Record<string, string>;
  body: string | null;
  sourcePath?: string;
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
  providers?: string[]; // source provider ids, set only under the "All Providers" view
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
  sourcePath?: string;
  providers?: string[]; // source provider ids, set only under the "All Providers" view
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
  sourcePath?: string;
  providers?: string[]; // source provider ids, set only under the "All Providers" view
}

export interface PlanDetail extends Plan {
  body: string;
}

export interface TokenStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  cacheHitRate: number;
  inputEstimated?: boolean;
  outputEstimated?: boolean;
  inputEstimatedProviders?: string[];
  outputEstimatedProviders?: string[];
}

export interface ProjectStats {
  totals: { sessions: number; messages: number; toolCalls: number; projects?: number };
  tokens: TokenStats;
  models: Record<string, number>;
  topTools: { name: string; count: number }[];
  activity: Record<string, number>;
  hooks: { success: number; failure: number; avgDurationMs: number };
  estimatedCostUsd: number;
}

export interface DiagnosticsStats {
  totals: { sessions: number; messages: number; toolCalls: number; projects?: number };
  tokens: TokenStats;
  stopReasons: Record<string, number>;
  models: Record<string, number>;
  hooks: { success: number; failure: number; avgDurationMs: number };
  topProjects: { id: string; messageCount: number; tokenCount: number; provider?: string }[];
  topTools: { name: string; count: number }[];
  activity: Record<string, number>;
  estimatedCostUsd: number;
  estimatedCostByProvider?: Record<string, number>; // set only under the "All Providers" view
}

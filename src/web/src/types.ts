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
}

export interface MCPTool {
  name: string;
  count: number;
  lastUsed: number | null;
}

export interface MCPServerDetail extends MCPServer {
  tools: MCPTool[];
}

export interface DiagnosticsStats {
  totals: { sessions: number; messages: number; toolCalls: number };
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number; cacheHitRate: number };
  stopReasons: Record<string, number>;
  models: Record<string, number>;
  hooks: { success: number; failure: number; avgDurationMs: number };
  topProjects: { id: string; messageCount: number; tokenCount: number }[];
  activity: Record<string, number>;
  estimatedCostUsd: number;
}

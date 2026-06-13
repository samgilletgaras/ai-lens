import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, AttachmentContent } from '../types';
import { ChevronDown, ChevronRight, BrainCircuit, Play, CheckCircle2, XCircle, Terminal, Activity, Zap, AlertTriangle, Copy, Check, Sparkles } from 'lucide-react';
import { formatRelative } from '../utils';

function formatTime(timestamp?: number | null) {
  if (!timestamp) return '';
  return formatRelative(timestamp);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-lens-border hover:bg-lens-hover text-lens-text-sub hover:text-lens-text transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 400 || text.split('\n').length > 10;

  return (
    <div
      className={`relative group bg-lens-border/20 border border-lens-border/60 rounded-xl p-4 md:p-6 ${isLong ? 'cursor-pointer' : ''}`}
      onClick={() => isLong && setExpanded(v => !v)}
    >
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
        <CopyButton text={text} />
      </div>
      <div
        className="prose max-w-none prose-pre:bg-lens-deep prose-pre:border prose-pre:border-lens-border prose-code:text-lens-accent text-lens-text-body"
        style={!expanded && isLong ? {
          maxHeight: '9rem',
          overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, black 30%, transparent 85%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 85%)',
        } : undefined}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

function PipelineEvent({
  icon: Icon, dotColor, textColor, title, content,
  isCommand = false, useMarkdown = false, timestamp, collapseSignal,
}: {
  icon: React.ElementType;
  dotColor: string;
  textColor: string;
  title: string;
  content?: string | React.ReactNode;
  isCommand?: boolean;
  useMarkdown?: boolean;
  timestamp?: number | null;
  collapseSignal?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = !!content;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- responding to an external collapse signal
    if (collapseSignal && collapseSignal > 0) setExpanded(false);
  }, [collapseSignal]);

  return (
    <div className="relative flex w-full mb-2 group items-start">
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-lens-border/40" />

      <div className="w-4 h-5 shrink-0 flex items-center justify-center bg-lens-bg relative z-20">
        <div className={`w-2 h-2 rounded-full ${dotColor} ring-2 ring-lens-bg opacity-80 group-hover:opacity-100 transition-opacity`} />
      </div>

      {timestamp && (
        <div className="absolute right-0 top-0 text-[10px] text-lens-text-faint font-mono">
          {formatTime(timestamp)}
        </div>
      )}

      <div className="flex-1 min-w-0 pb-1 pr-16 text-left">
        <button
          onClick={() => hasContent && setExpanded(!expanded)}
          className={`w-full flex items-center h-5 text-[11px] font-medium ${textColor} focus:outline-none transition-colors ${!hasContent ? 'cursor-default' : ''}`}
        >
          {hasContent && (expanded ? <ChevronDown className="w-3 h-3 mr-1.5" /> : <ChevronRight className="w-3 h-3 mr-1.5" />)}
          {!hasContent && <span className="w-4.5" />}
          <Icon className="w-3 h-3 mr-1.5" />
          <span className={`${isCommand ? 'font-mono' : ''}`}>{title}</span>
        </button>

        {expanded && hasContent && (
          <div className="pl-6 pb-2 pt-1 relative">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-lens-border/40" />
            {useMarkdown && typeof content === 'string' ? (
              <div className="text-[12px] bg-lens-surface/50 p-4 rounded-xl border border-lens-border/60 shadow-inner relative">
                <div className="absolute top-2 right-2"><CopyButton text={content} /></div>
                <div className="prose max-w-none prose-sm prose-pre:bg-lens-deep prose-pre:border prose-pre:border-lens-border prose-p:leading-snug prose-li:leading-snug text-lens-text-sub">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              </div>
            ) : typeof content === 'string' ? (
              <div className="relative">
                <div className="absolute top-2 right-2 z-10"><CopyButton text={content} /></div>
                <div className="text-[10px] text-lens-text-sub max-h-64 overflow-y-auto font-mono whitespace-pre-wrap bg-lens-deep/80 p-3 pr-16 rounded-md border border-lens-border/80 shadow-inner">
                  {content}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-lens-text-sub max-h-64 overflow-y-auto font-mono whitespace-pre-wrap bg-lens-deep/80 p-3 rounded-md border border-lens-border/80 shadow-inner">
                {content}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AvatarBlock({ isUser, node, timestamp, assistantLabel }: { isUser: boolean; node: React.ReactNode; timestamp?: number | null; assistantLabel?: string }) {
  const textColor = isUser ? 'text-lens-accent/70' : 'text-emerald-500/70';
  const bgColor   = isUser ? 'bg-lens-accent'      : 'bg-emerald-500';
  const label     = isUser ? 'User'                : (assistantLabel ?? 'Assistant');

  return (
    <div className="relative flex w-full mb-2 group pt-2 pb-6 items-start">
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-lens-border/40" />

      <div className="w-4 shrink-0 flex items-center justify-center mt-[3px] bg-lens-bg relative z-20">
        <div className={`w-2 h-2 rounded-full ring-2 ring-lens-bg ${bgColor}`} />
      </div>

      {timestamp && (
        <div className="absolute right-0 top-[8px] text-[10px] text-lens-text-faint font-mono">
          {formatTime(timestamp)}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center ${textColor}`}>
          {label}
        </div>
        <div className="ml-1 md:ml-0">
          {node}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MessageBubble({ message, collapseSignal, assistantLabel }: { message: Message; collapseSignal?: number; assistantLabel?: string }) {
  const ts = message.timestamp ?? undefined;

  // ── Pipeline events (role decides icon + colors, no block iteration) ────────

  if (message.role === 'system_attachment') {
    const att = message.content as AttachmentContent;
    const title = att.hookEvent ? `Hook: ${att.hookEvent} (${att.type})` : (att.command || 'System Attachment');
    const isError = att.exitCode !== undefined && att.exitCode !== 0;
    return (
      <PipelineEvent
        timestamp={ts} icon={Activity}
        dotColor={isError ? 'bg-red-500' : 'bg-blue-500'}
        textColor={isError ? 'text-red-400/80 hover:text-red-300' : 'text-blue-400/80 hover:text-blue-300'}
        title={title}
        content={att.stdout || att.content || JSON.stringify(att, null, 2)}
        collapseSignal={collapseSignal}
      />
    );
  }

  if (message.role === 'system') {
    return (
      <PipelineEvent
        timestamp={ts} icon={Zap}
        dotColor="bg-lens-text-dim" textColor="text-lens-text-sub/80 hover:text-lens-text-body"
        title="System Event"
        content={typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
        collapseSignal={collapseSignal}
      />
    );
  }

  if (message.role === 'thinking') {
    // Plain pre-wrap (not Markdown) — Claude's thinking blocks contain raw XML/Markdown
    // that ReactMarkdown misparses, producing empty containers.
    return (
      <PipelineEvent
        timestamp={ts} icon={BrainCircuit}
        dotColor="bg-indigo-500" textColor="text-indigo-400/80 hover:text-indigo-300"
        title="Thought Process"
        content={typeof message.content === 'string' ? message.content : ''}
        useMarkdown={false}
        collapseSignal={collapseSignal}
      />
    );
  }

  if (message.role === 'tool_use') {
    const inputStr = JSON.stringify(message.input ?? {}, null, 2);
    return (
      <PipelineEvent
        timestamp={ts} icon={Play}
        dotColor="bg-blue-500" textColor="text-blue-400/80 hover:text-blue-300"
        title={`Tool Use: ${message.name ?? ''}`}
        isCommand
        content={inputStr}
        collapseSignal={collapseSignal}
      />
    );
  }

  if (message.role === 'tool_result') {
    const isError = message.is_error === true;
    return (
      <PipelineEvent
        timestamp={ts}
        icon={isError ? XCircle : CheckCircle2}
        dotColor={isError ? 'bg-red-500' : 'bg-emerald-500'}
        textColor={isError ? 'text-red-400/80 hover:text-red-300' : 'text-emerald-400/80 hover:text-emerald-300'}
        title="Tool Result"
        content={typeof message.content === 'string' ? message.content : ''}
        collapseSignal={collapseSignal}
      />
    );
  }

  if (message.role === 'local_command') {
    return (
      <div className="flex flex-col w-full">
        {message.caveat && (
          <PipelineEvent
            timestamp={ts} icon={AlertTriangle}
            dotColor="bg-lens-accent" textColor="text-lens-accent/80 hover:text-lens-accent"
            title="Local Command Override"
            content={message.caveat}
            collapseSignal={collapseSignal}
          />
        )}
        <PipelineEvent
          timestamp={ts} icon={Terminal}
          dotColor="bg-lens-accent" textColor="text-lens-accent/80 hover:text-lens-accent"
          title={`Local Command: ${message.name ?? ''}`}
          isCommand
          collapseSignal={collapseSignal}
        />
      </div>
    );
  }

  if (message.role === 'skill_use') {
    const skillContent = typeof message.content === 'string' ? message.content : message.location;
    return (
      <PipelineEvent
        timestamp={ts} icon={Sparkles}
        dotColor="bg-orange-500" textColor="text-orange-400/80 hover:text-orange-300"
        title={`Skill: ${message.name ?? ''}`}
        isCommand
        content={skillContent}
        useMarkdown={typeof message.content === 'string'}
        collapseSignal={collapseSignal}
      />
    );
  }

  // ── Conversation turns (user / assistant) ───────────────────────────────────

  const text = typeof message.content === 'string' ? message.content : '';
  if (!text) return null;

  return (
    <AvatarBlock
      isUser={message.role === 'user'}
      timestamp={ts}
      assistantLabel={assistantLabel}
      node={<MarkdownBlock text={text} />}
    />
  );
}

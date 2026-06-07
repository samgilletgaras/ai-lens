import type { ConversationSummary, Block, Message, AttachmentContent } from './types';
import { formatDuration } from './utils';

export function extractMessageText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return (msg.content as Block[])
      .map(b => [b.text, b.thinking, typeof b.content === 'string' ? b.content : ''].filter(Boolean).join(' '))
      .join(' ');
  }
  const att = msg.content as AttachmentContent;
  return [att.command, att.stdout, att.content, att.stderr].filter(Boolean).join(' ');
}

export function getSessionDuration(conv: ConversationSummary): string | null {
  if (!conv.firstMessageTs || !conv.lastUpdated || conv.lastUpdated <= conv.firstMessageTs) return null;
  return formatDuration(conv.lastUpdated - conv.firstMessageTs);
}

export function exportSession(conv: ConversationSummary, messages: Message[], assistantLabel = 'Claude') {
  const lines: string[] = [`# Session\n\n*${new Date(conv.lastUpdated).toLocaleString()}*\n\n---\n`];
  [...messages].reverse().forEach(msg => {
    if (msg.role === 'user') {
      lines.push('\n\n**User**\n\n');
      const c = msg.content;
      if (typeof c === 'string') lines.push(c);
      else if (Array.isArray(c)) {
        (c as Block[]).forEach(b => { if (b.type === 'text' && b.text) lines.push(b.text); });
      }
    } else if (msg.role === 'assistant') {
      lines.push(`\n\n**${assistantLabel}**\n\n`);
      const c = msg.content;
      if (typeof c === 'string') lines.push(c);
      else if (Array.isArray(c)) {
        (c as Block[]).forEach(b => {
          if (b.type === 'text' && b.text) lines.push(b.text);
          else if (b.type === 'tool_use') lines.push(`\n*Tool: ${b.name}*\n`);
        });
      }
    }
  });
  const blob = new Blob([lines.join('')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-${conv.id.slice(0, 8)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

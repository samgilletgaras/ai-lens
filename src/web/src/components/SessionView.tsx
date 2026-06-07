import { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { ConversationSummary, Message } from '../types';
import { fmt } from '../utils';
import { MessageBubble } from './MessageBubble';
import { extractMessageText, getSessionDuration, exportSession } from '../session';

export function SessionView({ conv, messages, loading, assistantLabel, showSourcePaths = true }: {
  conv: ConversationSummary;
  messages: Message[];
  loading: boolean;
  assistantLabel: string;
  showSourcePaths?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchQ = search.toLowerCase().trim();
  const displayedMessages: Message[] = [...messages].reverse();
  const matchedIndices = searchQ
    ? displayedMessages.reduce<number[]>((acc, msg, i) => {
        if (extractMessageText(msg).toLowerCase().includes(searchQ)) acc.push(i);
        return acc;
      }, [])
    : [];
  const clampedMatchIdx = matchedIndices.length > 0
    ? ((matchIdx % matchedIndices.length) + matchedIndices.length) % matchedIndices.length
    : 0;

  // Scroll to focused match
  useEffect(() => {
    if (!searchQ || matchedIndices.length === 0) return;
    document.getElementById(`msg-${matchedIndices[clampedMatchIdx]}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [clampedMatchIdx, searchQ, matchedIndices.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘F / Ctrl+F focuses the in-session search box
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Session header */}
      <div className="shrink-0 border-b border-lens-border px-4 md:px-8 lg:px-12 py-2.5 flex items-center gap-3 bg-lens-deep/50 flex-wrap">
        <div className="flex-1 min-w-0 flex items-center gap-3 text-[11px] text-lens-text-dim flex-wrap">
          {conv.turnCount !== undefined && (
            <span><span className="text-lens-text-body tabular-nums">{conv.turnCount}</span> turns</span>
          )}
          {conv.tokens && conv.tokens.input > 0 && (
            <>
              <span><span className="text-lens-text-body tabular-nums">{fmt(conv.tokens.input)}</span> in</span>
              <span><span className="text-lens-text-body tabular-nums">{fmt(conv.tokens.output)}</span> out</span>
              {conv.tokens.cacheRead > 0 && (
                <span><span className="text-sky-400 tabular-nums">{fmt(conv.tokens.cacheRead)}</span> cached</span>
              )}
            </>
          )}
          {(() => { const d = getSessionDuration(conv); return d ? <span><span className="text-lens-text-body">{d}</span></span> : null; })()}
          {conv.metadata?.vscodeVersion && (
            <span>VS Code {conv.metadata.vscodeVersion}</span>
          )}
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-2 w-3 h-3 text-lens-text-faint pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setMatchIdx(0); }}
              onKeyDown={e => {
                if (e.key === 'Escape') { setSearch(''); e.currentTarget.blur(); }
                if (e.key === 'Enter') { e.preventDefault(); setMatchIdx(i => i + (e.shiftKey ? -1 : 1)); }
              }}
              placeholder="Search… (⌘F)"
              className="bg-lens-surface border border-lens-border focus:border-lens-border-hi rounded pl-6 pr-6 py-0.5 text-[11px] text-lens-text-body placeholder:text-lens-text-faint outline-none w-32 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-1.5 text-lens-text-faint hover:text-lens-text-sub transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {searchQ && (
            <>
              <span className="text-[10px] text-lens-text-dim tabular-nums whitespace-nowrap">
                {matchedIndices.length > 0 ? `${clampedMatchIdx + 1} / ${matchedIndices.length}` : 'No matches'}
              </span>
              <button onClick={() => setMatchIdx(i => i - 1)} disabled={matchedIndices.length === 0} title="Previous match (Shift+Enter)" className="p-0.5 rounded text-lens-text-sub hover:text-lens-text disabled:opacity-30 transition-colors">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setMatchIdx(i => i + 1)} disabled={matchedIndices.length === 0} title="Next match (Enter)" className="p-0.5 rounded text-lens-text-sub hover:text-lens-text disabled:opacity-30 transition-colors">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        <button onClick={() => setCollapseSignal(s => s + 1)} className="px-2 py-1 text-[10px] rounded bg-lens-border/80 hover:bg-lens-hover text-lens-text-sub hover:text-lens-text transition-colors shrink-0">
          Collapse all
        </button>
        <button onClick={() => exportSession(conv, messages, assistantLabel)} className="px-2 py-1 text-[10px] rounded bg-lens-border/80 hover:bg-lens-hover text-lens-text-sub hover:text-lens-text transition-colors shrink-0">
          Export ↓
        </button>
      </div>

      {/* Source file paths */}
      {showSourcePaths && conv.sourcePaths && conv.sourcePaths.length > 0 && (
        <div className="shrink-0 px-4 md:px-8 lg:px-12 py-1 text-[10px] text-lens-text-faint border-b border-lens-border/40 flex items-center gap-2 flex-wrap">
          <span>Sources:</span>
          {conv.sourcePaths.map((p, i) => (
            <span key={i} title={p} className="font-mono">{p}</span>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto w-full relative">
        {loading && (
          <div className="flex items-center justify-center h-32 text-lens-text-dim text-sm">
            Loading messages…
          </div>
        )}
        <div className="p-8 pb-32 max-w-7xl mx-auto">
          {!loading && displayedMessages.map((msg, i) => (
            <div
              key={i}
              id={`msg-${i}`}
              className={searchQ && matchedIndices.length > 0 && !matchedIndices.includes(i) ? 'opacity-30 transition-opacity duration-150' : 'transition-opacity duration-150'}
            >
              <MessageBubble message={msg} collapseSignal={collapseSignal} />
            </div>
          ))}
        </div>
        {/* Floating scroll buttons */}
        <div className="sticky bottom-4 flex justify-end pr-4 pointer-events-none">
          <div className="flex flex-col gap-1 pointer-events-auto">
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              title="Scroll to top"
              className="p-1.5 rounded bg-lens-border/80 hover:bg-lens-hover text-lens-text-sub hover:text-lens-text transition-colors shadow-md"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              title="Scroll to bottom"
              className="p-1.5 rounded bg-lens-border/80 hover:bg-lens-hover text-lens-text-sub hover:text-lens-text transition-colors shadow-md"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

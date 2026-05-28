import { useEffect, useState } from 'react';
import type { Conversation, ProjectSummary, Block } from './types';
import { MessageBubble } from './components/MessageBubble';
import { MessageSquare, Clock, FolderOpen, ArrowLeft, Activity, Layers, Plug } from 'lucide-react';
import { LogsViewer } from './components/LogsViewer';
import { SkillsViewer } from './components/SkillsViewer';
import { MCPsViewer } from './components/MCPsViewer';
import { prettifyProjectName, formatRelative, fmt } from './utils';

const SESSION_PAGE_SIZE = 20;

function exportSession(conv: Conversation) {
  const lines: string[] = [`# Session\n\n*${new Date(conv.lastUpdated).toLocaleString()}*\n\n---\n`];
  [...conv.messages].reverse().forEach(msg => {
    if (msg.role === 'user') {
      lines.push('\n\n**User**\n\n');
      const c = msg.content;
      if (typeof c === 'string') lines.push(c);
      else if (Array.isArray(c)) {
        (c as Block[]).forEach(b => { if (b.type === 'text' && b.text) lines.push(b.text); });
      }
    } else if (msg.role === 'assistant') {
      lines.push('\n\n**Claude**\n\n');
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

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsPage, setSessionsPage] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'history' | 'logs' | 'skills' | 'mcps'>('history');
  const [sessionSort, setSessionSort] = useState<'newest' | 'oldest'>('newest');
  const [sessionDateFilter, setSessionDateFilter] = useState<'all' | '7d' | '30d'>('all');
  const [projectSort, setProjectSort] = useState<'updated' | 'sessions' | 'name'>('updated');
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setProjects(res.data || []);
      })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    const key = `${activeProjectId}:${sessionsPage}`;
    fetch(`/api/history?project=${encodeURIComponent(activeProjectId)}&page=${sessionsPage}&pageSize=${SESSION_PAGE_SIZE}`)
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setSessions(res.data || []);
        setSessionsTotal(res.total || 0);
        setLoadedKey(key);
      })
      .catch(() => setLoadedKey(key));
  }, [activeProjectId, sessionsPage]);

  const currentKey = activeProjectId ? `${activeProjectId}:${sessionsPage}` : null;
  const sessionsLoading = currentKey !== null && loadedKey !== currentKey;
  const activeConv = sessions.find(c => c.id === activeSessionId) ?? null;
  const sessionsTotalPages = Math.ceil(sessionsTotal / SESSION_PAGE_SIZE);

  const sortedSessions = sessionSort === 'oldest' ? [...sessions].reverse() : sessions;
  const filteredSessions = sortedSessions.filter(conv => {
    if (sessionDateFilter === '7d') return Date.now() - conv.lastUpdated < 7 * 86_400_000;
    if (sessionDateFilter === '30d') return Date.now() - conv.lastUpdated < 30 * 86_400_000;
    return true;
  });

  const sortedProjects = [...projects].sort((a, b) => {
    if (projectSort === 'name') return prettifyProjectName(a.id).localeCompare(prettifyProjectName(b.id));
    if (projectSort === 'sessions') return b.sessionCount - a.sessionCount;
    return (b.lastUpdated || 0) - (a.lastUpdated || 0);
  });

  function openProject(id: string) {
    setActiveProjectId(id);
    setSessionsPage(0);
    setActiveSessionId(null);
    setSessions([]);
    setLoadedKey(null);
  }

  function closeProject() {
    setActiveProjectId(null);
    setActiveSessionId(null);
    setSessions([]);
    setSessionsPage(0);
    setLoadedKey(null);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (activeSessionId) { setActiveSessionId(null); return; }
        if (activeProjectId) { closeProject(); return; }
      }
      if (!activeProjectId || filteredSessions.length === 0) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = filteredSessions.findIndex(s => s.id === activeSessionId);
        setActiveSessionId(filteredSessions[idx < filteredSessions.length - 1 ? idx + 1 : 0].id);
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filteredSessions.findIndex(s => s.id === activeSessionId);
        setActiveSessionId(filteredSessions[idx > 0 ? idx - 1 : filteredSessions.length - 1].id);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeProjectId, activeSessionId, filteredSessions]);

  return (
    <div className="flex h-screen bg-anthropic-bg text-slate-300 font-sans overflow-hidden">
      <div className="w-56 border-r border-zinc-800 flex flex-col bg-zinc-950/30">
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h1 className="text-xl font-medium tracking-tight text-slate-200">Claude Lens</h1>
          <p className="text-xs text-zinc-500 mt-1">Local History Explorer</p>
        </div>

        <div className="p-2 border-b border-zinc-800 shrink-0">
          {activeProjectId !== null ? (
            <button
              onClick={closeProject}
              className="w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/30"
              title={activeProjectId}
            >
              <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
              <span className="truncate flex-1">{prettifyProjectName(activeProjectId)}</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => { setCurrentView('history'); closeProject(); }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'history' ? 'bg-zinc-800/60 text-slate-200' : 'text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/30'}`}
              >
                <MessageSquare className="w-4 h-4 mr-2 shrink-0" /> Chat History
              </button>
              <button
                onClick={() => { setCurrentView('logs'); closeProject(); }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'logs' ? 'bg-zinc-800/60 text-slate-200' : 'text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/30'}`}
              >
                <Activity className="w-4 h-4 mr-2 shrink-0" /> Diagnostics
              </button>
              <button
                onClick={() => { setCurrentView('skills'); closeProject(); }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'skills' ? 'bg-zinc-800/60 text-slate-200' : 'text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/30'}`}
              >
                <Layers className="w-4 h-4 mr-2 shrink-0" /> Skills
              </button>
              <button
                onClick={() => { setCurrentView('mcps'); closeProject(); }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'mcps' ? 'bg-zinc-800/60 text-slate-200' : 'text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/30'}`}
              >
                <Plug className="w-4 h-4 mr-2 shrink-0" /> MCPs
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto w-full">
          {error && <div className="p-4 text-rose-400 text-sm">{error}</div>}

          {activeProjectId !== null && (
            <div className="flex flex-col h-full">
              {/* Date filter */}
              <div className="shrink-0 border-b border-zinc-800/50 px-2 py-1.5 flex items-center gap-1">
                {(['all', '7d', '30d'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setSessionDateFilter(f)}
                    className={`flex-1 text-[10px] px-1 py-1 rounded transition-colors ${sessionDateFilter === f ? 'bg-zinc-800 text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {f === 'all' ? 'All' : f === '7d' ? '7 days' : '30 days'}
                  </button>
                ))}
              </div>
              {/* Sort */}
              <div className="shrink-0 border-b border-zinc-800/50 px-2 py-1.5 flex items-center gap-1">
                <button
                  onClick={() => setSessionSort('newest')}
                  className={`flex-1 text-[10px] px-2 py-1 rounded transition-colors ${sessionSort === 'newest' ? 'bg-zinc-800 text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  ↓ Newest
                </button>
                <button
                  onClick={() => setSessionSort('oldest')}
                  className={`flex-1 text-[10px] px-2 py-1 rounded transition-colors ${sessionSort === 'oldest' ? 'bg-zinc-800 text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  ↑ Oldest
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {sessionsLoading && <div className="p-4 text-zinc-500 text-sm">Loading sessions...</div>}
                {!sessionsLoading && filteredSessions.map(conv => {
                  const isActive = activeSessionId === conv.id;
                  let firstText = 'New Session';
                  const firstUserMsg = conv.messages.find(m => m.role === 'user');
                  if (firstUserMsg) {
                    let rawText = '';
                    if (Array.isArray(firstUserMsg.content)) {
                      const textBlock = firstUserMsg.content.find((b: { type: string; text?: string }) => b.type === 'text');
                      if (textBlock && textBlock.text) rawText = textBlock.text;
                    } else if (typeof firstUserMsg.content === 'string') {
                      rawText = firstUserMsg.content;
                    }
                    const cmdMatch = rawText.match(/<command-message>([\s\S]*?)<\/command-message>/);
                    const localCmdMatch = rawText.match(/<command-name>(.*?)<\/command-name>/);
                    if (localCmdMatch) rawText = localCmdMatch[1];
                    else if (cmdMatch) rawText = cmdMatch[1];
                    else rawText = rawText.replace(/<[\s\S]*?>/g, '').trim();
                    rawText = rawText.split('\n')[0].trim();
                    if (rawText) firstText = rawText;
                  }
                  const totalTok = conv.tokens ? conv.tokens.input + conv.tokens.output : 0;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveSessionId(conv.id)}
                      className={`w-full text-left p-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${isActive ? 'bg-zinc-800/80 border-l-2 border-l-amber-500' : ''}`}
                    >
                      <div className={`text-sm font-medium ${isActive ? 'text-amber-100' : 'text-slate-200'} truncate w-full block overflow-hidden`}>
                        {firstText}
                      </div>
                      <div className="mt-1.5 text-[10px] text-zinc-500 flex items-center gap-2">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelative(conv.lastUpdated)}</span>
                        {conv.turnCount !== undefined && <span>{conv.turnCount}t</span>}
                        {totalTok > 0 && <span>{fmt(totalTok)}</span>}
                      </div>
                    </button>
                  );
                })}
                {!sessionsLoading && filteredSessions.length === 0 && sessions.length > 0 && (
                  <div className="p-4 text-zinc-600 text-xs text-center">No sessions in this date range</div>
                )}
              </div>

              {sessionsTotalPages > 1 && (
                <div className="shrink-0 border-t border-zinc-800 px-2 py-2 flex items-center justify-between">
                  <button
                    onClick={() => setSessionsPage(p => Math.max(0, p - 1))}
                    disabled={sessionsPage === 0}
                    className="px-2 py-1 text-xs rounded text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-[10px] text-zinc-500">{sessionsPage + 1} / {sessionsTotalPages}</span>
                  <button
                    onClick={() => setSessionsPage(p => Math.min(sessionsTotalPages - 1, p + 1))}
                    disabled={sessionsPage === sessionsTotalPages - 1}
                    className="px-2 py-1 text-xs rounded text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-anthropic-bg">
        {currentView === 'logs' ? (
          <LogsViewer />
        ) : currentView === 'skills' ? (
          <SkillsViewer />
        ) : currentView === 'mcps' ? (
          <MCPsViewer />
        ) : activeProjectId === null ? (
          <div className="flex-1 overflow-y-auto w-full p-8">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-2xl font-semibold flex items-center flex-1">
                  <FolderOpen className="mr-3 text-amber-500" /> Select a Project
                </h2>
                <div className="flex gap-1">
                  {(['updated', 'sessions', 'name'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setProjectSort(s)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${projectSort === s ? 'bg-zinc-800 text-amber-400' : 'text-zinc-600 hover:text-zinc-300'}`}
                    >
                      {s === 'updated' ? 'Recent' : s === 'sessions' ? 'Sessions' : 'A–Z'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedProjects.map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => openProject(proj.id)}
                    className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg p-6 text-left transition-colors flex flex-col"
                  >
                    <div className="font-medium text-slate-200 text-lg mb-2">{prettifyProjectName(proj.id)}</div>
                    <div className="text-xs text-zinc-500 truncate mb-4" title={proj.fullPath}>{proj.fullPath}</div>
                    <div className="mt-auto flex items-center justify-between text-xs text-zinc-400">
                      <span>{proj.sessionCount} Sessions</span>
                      <span>{proj.lastUpdated ? formatRelative(proj.lastUpdated) : 'Never'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : activeConv ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 border-b border-zinc-800 px-4 md:px-8 lg:px-12 py-2.5 flex items-center gap-3 bg-zinc-950/50">
              <div className="flex-1 min-w-0 flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap">
                {activeConv.turnCount !== undefined && (
                  <span><span className="text-zinc-300 tabular-nums">{activeConv.turnCount}</span> turns</span>
                )}
                {activeConv.tokens && activeConv.tokens.input > 0 && (
                  <>
                    <span><span className="text-zinc-300 tabular-nums">{fmt(activeConv.tokens.input)}</span> in</span>
                    <span><span className="text-zinc-300 tabular-nums">{fmt(activeConv.tokens.output)}</span> out</span>
                    {activeConv.tokens.cacheRead > 0 && (
                      <span><span className="text-sky-400 tabular-nums">{fmt(activeConv.tokens.cacheRead)}</span> cached</span>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={() => setCollapseSignal(s => s + 1)}
                className="px-2 py-1 text-[10px] rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              >
                Collapse all
              </button>
              <button
                onClick={() => exportSession(activeConv)}
                className="px-2 py-1 text-[10px] rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              >
                Export ↓
              </button>
            </div>
            <div className="flex-1 overflow-y-auto w-full">
              <div className="py-8 pb-32 px-4 md:px-8 lg:px-12 max-w-6xl mx-auto">
                {[...activeConv.messages].reverse().map((msg, idx) => (
                  <MessageBubble key={idx} message={msg} collapseSignal={collapseSignal} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a session to view history</p>
              <p className="text-xs mt-2 text-zinc-600">j/k or ↑↓ to navigate · Esc to go back</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

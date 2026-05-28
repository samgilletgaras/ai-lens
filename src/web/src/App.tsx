import { useEffect, useState } from 'react';
import type { Conversation, ProjectSummary, Block } from './types';
import { MessageBubble } from './components/MessageBubble';
import { MessageSquare, Clock, FolderOpen, ArrowLeft, Activity, Layers, Plug, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [projectSort, setProjectSort] = useState<'updated' | 'sessions' | 'name'>('updated');
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function refresh() {
    setRefreshing(true);
    setSessionsPage(0);
    setRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 600);
  }

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setProjects(res.data || []);
      })
      .catch(err => setError(err.message));
  }, [refreshKey]);

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
  }, [activeProjectId, sessionsPage, refreshKey]);

  const currentKey = activeProjectId ? `${activeProjectId}:${sessionsPage}` : null;
  const sessionsLoading = currentKey !== null && loadedKey !== currentKey;
  const activeConv = sessions.find(c => c.id === activeSessionId) ?? null;
  const sessionsTotalPages = Math.ceil(sessionsTotal / SESSION_PAGE_SIZE);

  const sortedSessions = sessionSort === 'oldest' ? [...sessions].reverse() : sessions;

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
    setSidebarCollapsed(false);
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
      if (!activeProjectId || sortedSessions.length === 0) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = sortedSessions.findIndex(s => s.id === activeSessionId);
        setActiveSessionId(sortedSessions[idx < sortedSessions.length - 1 ? idx + 1 : 0].id);
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = sortedSessions.findIndex(s => s.id === activeSessionId);
        setActiveSessionId(sortedSessions[idx > 0 ? idx - 1 : sortedSessions.length - 1].id);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeProjectId, activeSessionId, sortedSessions]);

  return (
    <div className="flex h-screen bg-lens-bg text-lens-text-body font-sans overflow-hidden">
      <div className={`${sidebarCollapsed ? 'w-12' : 'w-56'} border-r border-lens-border flex flex-col bg-lens-deep/30 shrink-0 transition-[width] duration-200 overflow-hidden`}>

        {/* Header — hidden when collapsed */}
        {!sidebarCollapsed && (
          <div className="p-4 border-b border-lens-border shrink-0">
            <h1 className="text-xl font-medium tracking-tight text-lens-text">Claude Lens</h1>
            <p className="text-xs text-lens-text-dim mt-1">Local History Explorer</p>
          </div>
        )}

        {/* Nav */}
        <div className={`${sidebarCollapsed ? 'p-1' : 'p-2'} border-b border-lens-border shrink-0`}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-0.5">
              {activeProjectId !== null ? (
                <button onClick={closeProject} title="Back to projects" className="w-full flex justify-center p-2 rounded text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <>
                  <button onClick={() => { setCurrentView('history'); closeProject(); }} title="Chat History" className={`w-full flex justify-center p-2 rounded transition-colors ${currentView === 'history' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <MessageSquare className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setCurrentView('logs'); closeProject(); }} title="Diagnostics" className={`w-full flex justify-center p-2 rounded transition-colors ${currentView === 'logs' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <Activity className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setCurrentView('skills'); closeProject(); }} title="Skills" className={`w-full flex justify-center p-2 rounded transition-colors ${currentView === 'skills' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <Layers className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setCurrentView('mcps'); closeProject(); }} title="MCPs" className={`w-full flex justify-center p-2 rounded transition-colors ${currentView === 'mcps' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <Plug className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {activeProjectId !== null ? (
                <button
                  onClick={closeProject}
                  className="w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30"
                  title={activeProjectId}
                >
                  <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate flex-1">{prettifyProjectName(activeProjectId)}</span>
                </button>
              ) : (
                <>
                  <button onClick={() => { setCurrentView('history'); closeProject(); }} className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'history' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <MessageSquare className="w-4 h-4 mr-2 shrink-0" /> Chat History
                  </button>
                  <button onClick={() => { setCurrentView('logs'); closeProject(); }} className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'logs' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <Activity className="w-4 h-4 mr-2 shrink-0" /> Diagnostics
                  </button>
                  <button onClick={() => { setCurrentView('skills'); closeProject(); }} className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'skills' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <Layers className="w-4 h-4 mr-2 shrink-0" /> Skills
                  </button>
                  <button onClick={() => { setCurrentView('mcps'); closeProject(); }} className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'mcps' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
                    <Plug className="w-4 h-4 mr-2 shrink-0" /> MCPs
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Session list — hidden when collapsed */}
        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto w-full">
            {error && <div className="p-4 text-rose-400 text-sm">{error}</div>}

            {activeProjectId !== null && (
              <div className="flex flex-col h-full">
                <div className="shrink-0 border-b border-lens-border/50 px-2 py-1.5 flex items-center gap-1">
                  <button
                    onClick={() => setSessionSort('newest')}
                    className={`flex-1 text-[10px] px-2 py-1 rounded transition-colors ${sessionSort === 'newest' ? 'bg-lens-border text-lens-accent' : 'text-lens-text-dim hover:text-lens-text-body'}`}
                  >
                    ↓ Newest
                  </button>
                  <button
                    onClick={() => setSessionSort('oldest')}
                    className={`flex-1 text-[10px] px-2 py-1 rounded transition-colors ${sessionSort === 'oldest' ? 'bg-lens-border text-lens-accent' : 'text-lens-text-dim hover:text-lens-text-body'}`}
                  >
                    ↑ Oldest
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {sessionsLoading && <div className="p-4 text-lens-text-dim text-sm">Loading sessions...</div>}
                  {!sessionsLoading && sortedSessions.map(conv => {
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
                        className={`w-full text-left p-3 border-b border-lens-border/50 hover:bg-lens-border/30 transition-colors ${isActive ? 'bg-lens-border/80 border-l-2 border-l-lens-accent' : ''}`}
                      >
                        <div className={`text-sm font-medium ${isActive ? 'text-lens-accent-hi' : 'text-lens-text'} truncate w-full block overflow-hidden`}>
                          {firstText}
                        </div>
                        <div className="mt-1.5 text-[10px] text-lens-text-dim flex items-center gap-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelative(conv.lastUpdated)}</span>
                          {conv.turnCount !== undefined && <span>{conv.turnCount}t</span>}
                          {totalTok > 0 && <span>{fmt(totalTok)}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {sessionsTotalPages > 1 && (
                  <div className="shrink-0 border-t border-lens-border px-2 py-2 flex items-center justify-between">
                    <button
                      onClick={() => setSessionsPage(p => Math.max(0, p - 1))}
                      disabled={sessionsPage === 0}
                      className="px-2 py-1 text-xs rounded text-lens-text-sub hover:text-lens-text hover:bg-lens-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Prev
                    </button>
                    <span className="text-[10px] text-lens-text-dim">{sessionsPage + 1} / {sessionsTotalPages}</span>
                    <button
                      onClick={() => setSessionsPage(p => Math.min(sessionsTotalPages - 1, p + 1))}
                      disabled={sessionsPage === sessionsTotalPages - 1}
                      className="px-2 py-1 text-xs rounded text-lens-text-sub hover:text-lens-text hover:bg-lens-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {sidebarCollapsed && <div className="flex-1" />}

        {/* Bottom bar */}
        <div className={`shrink-0 border-t border-lens-border p-1.5 flex items-center ${sidebarCollapsed ? 'flex-col gap-1' : 'justify-between'}`}>
          <button
            onClick={refresh}
            title="Refresh data"
            className="p-1.5 rounded text-lens-text-dim hover:text-lens-text hover:bg-lens-border/50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded text-lens-text-dim hover:text-lens-text hover:bg-lens-border/50 transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-lens-bg">
        {currentView === 'logs' ? (
          <LogsViewer key={refreshKey} />
        ) : currentView === 'skills' ? (
          <SkillsViewer key={refreshKey} />
        ) : currentView === 'mcps' ? (
          <MCPsViewer key={refreshKey} />
        ) : activeProjectId === null ? (
          <div className="flex-1 overflow-y-auto w-full p-8">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-2xl font-semibold flex items-center flex-1">
                  <FolderOpen className="mr-3 text-lens-accent" /> Select a Project
                </h2>
                <div className="flex gap-1">
                  {(['updated', 'sessions', 'name'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setProjectSort(s)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${projectSort === s ? 'bg-lens-border text-lens-accent' : 'text-lens-text-faint hover:text-lens-text-body'}`}
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
                    className="bg-lens-surface border border-lens-border hover:border-lens-border-hi rounded-lg p-6 text-left transition-colors flex flex-col"
                  >
                    <div className="font-medium text-lens-text text-lg mb-2">{prettifyProjectName(proj.id)}</div>
                    <div className="text-xs text-lens-text-dim truncate mb-4" title={proj.fullPath}>{proj.fullPath}</div>
                    <div className="mt-auto flex items-center justify-between text-xs text-lens-text-sub">
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
            <div className="shrink-0 border-b border-lens-border px-4 md:px-8 lg:px-12 py-2.5 flex items-center gap-3 bg-lens-deep/50">
              <div className="flex-1 min-w-0 flex items-center gap-3 text-[11px] text-lens-text-dim flex-wrap">
                {activeConv.turnCount !== undefined && (
                  <span><span className="text-lens-text-body tabular-nums">{activeConv.turnCount}</span> turns</span>
                )}
                {activeConv.tokens && activeConv.tokens.input > 0 && (
                  <>
                    <span><span className="text-lens-text-body tabular-nums">{fmt(activeConv.tokens.input)}</span> in</span>
                    <span><span className="text-lens-text-body tabular-nums">{fmt(activeConv.tokens.output)}</span> out</span>
                    {activeConv.tokens.cacheRead > 0 && (
                      <span><span className="text-sky-400 tabular-nums">{fmt(activeConv.tokens.cacheRead)}</span> cached</span>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={() => setCollapseSignal(s => s + 1)}
                className="px-2 py-1 text-[10px] rounded bg-lens-border/80 hover:bg-lens-hover text-lens-text-sub hover:text-lens-text transition-colors shrink-0"
              >
                Collapse all
              </button>
              <button
                onClick={() => exportSession(activeConv)}
                className="px-2 py-1 text-[10px] rounded bg-lens-border/80 hover:bg-lens-hover text-lens-text-sub hover:text-lens-text transition-colors shrink-0"
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
          <div className="flex-1 flex items-center justify-center text-lens-text-dim">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a session to view history</p>
              <p className="text-xs mt-2 text-lens-text-faint">j/k or ↑↓ to navigate · Esc to go back</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

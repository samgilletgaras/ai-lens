import { useEffect, useState } from 'react';
import type { Conversation, ProjectSummary } from './types';
import { MessageBubble } from './components/MessageBubble';
import { MessageSquare, Clock, FolderOpen, ArrowLeft, Activity, Layers, Plug, Search } from 'lucide-react';
import { LogsViewer } from './components/LogsViewer';
import { SkillsViewer } from './components/SkillsViewer';
import { MCPsViewer } from './components/MCPsViewer';
import { SearchView } from './components/SearchView';
import { prettifyProjectName, formatRelative } from './utils';

const SESSION_PAGE_SIZE = 20;

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsPage, setSessionsPage] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [directSession, setDirectSession] = useState<Conversation | null>(null);
  const [currentView, setCurrentView] = useState<'history' | 'logs' | 'skills' | 'mcps' | 'search'>('history');
  const [sessionSort, setSessionSort] = useState<'newest' | 'oldest'>('newest');
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
  const activeConv = sessions.find(c => c.id === activeSessionId)
    ?? (directSession?.id === activeSessionId ? directSession : null);
  const sessionsTotalPages = Math.ceil(sessionsTotal / SESSION_PAGE_SIZE);

  const sortedSessions = sessionSort === 'oldest' ? [...sessions].reverse() : sessions;

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
    setDirectSession(null);
    setSessions([]);
    setSessionsPage(0);
    setLoadedKey(null);
  }

  function navigateToSession(project: string, sessionId: string) {
    setCurrentView('history');
    setDirectSession(null);
    setActiveSessionId(sessionId);
    openProject(project);
    fetch(`/api/session?project=${encodeURIComponent(project)}&id=${encodeURIComponent(sessionId)}`)
      .then(res => res.json())
      .then(res => {
        if (res.data) setDirectSession(res.data);
      });
  }

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
                onClick={() => { setCurrentView('search'); closeProject(); }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center ${currentView === 'search' ? 'bg-zinc-800/60 text-slate-200' : 'text-zinc-400 hover:text-slate-200 hover:bg-zinc-800/30'}`}
              >
                <Search className="w-4 h-4 mr-2 shrink-0" /> Search
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
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveSessionId(conv.id)}
                      className={`w-full text-left p-4 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${isActive ? 'bg-zinc-800/80 border-l-2 border-l-amber-500' : ''}`}
                    >
                      <div className={`text-sm font-medium ${isActive ? 'text-amber-100' : 'text-slate-200'} truncate w-full block overflow-hidden`}>
                        {firstText}
                      </div>
                      <div className="mt-2 text-[10px] text-zinc-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatRelative(conv.lastUpdated)}
                      </div>
                    </button>
                  );
                })}
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
        ) : currentView === 'search' ? (
          <SearchView onNavigate={navigateToSession} />
        ) : activeProjectId === null ? (
          <div className="flex-1 overflow-y-auto w-full p-8">
            <h2 className="text-2xl font-semibold mb-6 flex items-center"><FolderOpen className="mr-3 text-amber-500" /> Select a Project</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
              {projects.map(proj => (
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
        ) : activeConv ? (
          <div className="flex-1 overflow-y-auto w-full">
            <div className="py-8 pb-32 px-4 md:px-8 lg:px-12 max-w-6xl mx-auto">
              {[...activeConv.messages].reverse().map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a session to view history</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

import { useEffect, useState, useRef } from 'react';
import type { ConversationSummary, ProjectSummary, Message, Provider, ProviderInfo, ProviderCapabilities } from './types';
import { MessageSquare, Clock, ArrowLeft, RefreshCw, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { ProjectDiagnostics } from './components/ProjectDiagnostics';
import { SettingsViewer } from './components/SettingsViewer';
import { ProjectGrid } from './components/ProjectGrid';
import { SessionView } from './components/SessionView';
import { NavButton } from './components/Nav';
import { NAV_ITEMS, SIMPLE_VIEWS } from './components/navConfig';
import { prettifyProjectName, formatRelative, fmt, apiUrl, slugify, iconFor } from './utils';
import { getSessionDuration } from './session';
import { SESSION_PAGE_SIZE, NO_CAPABILITIES, parseHash, buildHash } from './routing';
import type { AppView } from './routing';

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsPage, setSessionsPage] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('history');
  const [sessionSort, setSessionSort] = useState<'newest' | 'oldest'>('newest');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [demoMode, setDemoMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('lens-demo-mode');
    return saved !== null ? saved === 'true' : false;
  });
  const [theme, setTheme] = useState<'default' | 'tycho' | 'parchment'>(() => {
    const saved = localStorage.getItem('lens-theme');
    if (saved === 'tycho' || saved === 'parchment') return saved;
    return 'default';
  });
  const [provider, setProvider] = useState<Provider | null>(() => {
    const MIGRATIONS: Record<string, Provider> = { ghcopilot: 'ghcopilot-vscode' };
    const raw = localStorage.getItem('lens-provider');
    if (!raw) return null;
    const p = MIGRATIONS[raw] ?? raw;
    if (p !== raw) localStorage.setItem('lens-provider', p);
    return p;
  });
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  const skipHashRead = useRef(false);
  const activeProjectIdRef = useRef<string | null>(null);
  const pendingSessionIdRef = useRef<string | null>(null);

  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'default') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', theme);
  }, [theme]);

  function refresh() {
    setRefreshing(true);
    setSessionsPage(0);
    setRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 600);
  }

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(r => {
        const list: ProviderInfo[] = r.data?.providers ?? [];
        setProviders(list);
        // Resolve the active provider: keep the saved one if it still exists,
        // otherwise use the backend-declared default (falling back to the first
        // available, then first registered provider).
        setProvider(prev => {
          if (prev && list.some(p => p.id === prev)) return prev;
          const def = r.data?.defaultProvider as string | undefined;
          const chosen = (def && list.some(p => p.id === def) ? def : (list.find(p => p.available) ?? list[0])?.id) ?? null;
          if (chosen) localStorage.setItem('lens-provider', chosen);
          return chosen;
        });
        // Auto-enable demo mode when no provider has real data and the user hasn't chosen.
        if (list.length > 0 && list.every(p => !p.available) && localStorage.getItem('lens-demo-mode') === null) {
          setDemoMode(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!provider) return;
    fetch(apiUrl('/api/projects', demoMode))
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setProjects(res.data || []);
      })
      .catch(err => setError(err.message));
  }, [refreshKey, demoMode, provider]);

  useEffect(() => {
    if (!activeProjectId) return;
    const key = `${activeProjectId}:${sessionsPage}`;
    fetch(apiUrl(`/api/history?project=${encodeURIComponent(activeProjectId)}&page=${sessionsPage}&pageSize=${SESSION_PAGE_SIZE}`, demoMode))
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setSessions(res.data || []);
        setSessionsTotal(res.total || 0);
        setLoadedKey(key);
        if (pendingSessionIdRef.current) {
          setActiveSessionId(pendingSessionIdRef.current);
          pendingSessionIdRef.current = null;
        }
      })
      .catch(() => setLoadedKey(key));
  }, [activeProjectId, sessionsPage, refreshKey, demoMode, provider]);

  // Write state → hash
  useEffect(() => {
    const hash = buildHash(currentView, activeProjectId, activeSessionId);
    if (window.location.hash !== hash) {
      skipHashRead.current = true;
      window.location.hash = hash;
    }
  }, [currentView, activeProjectId, activeSessionId]);

  // Read hash → state (mount + browser back/forward)
  useEffect(() => {
    function onHashChange() {
      if (skipHashRead.current) { skipHashRead.current = false; return; }
      const { view, projectId, sessionId } = parseHash(window.location.hash);
      setCurrentView(view);
      if (projectId !== activeProjectIdRef.current) {
        if (projectId) {
          setActiveProjectId(projectId);
          setSessionsPage(0);
          setActiveSessionId(null);
          setSessions([]);
          setLoadedKey(null);
          setSidebarCollapsed(false);
          if (sessionId) pendingSessionIdRef.current = sessionId;
        } else {
          setActiveProjectId(null);
          setActiveSessionId(null);
          setSessions([]);
          setSessionsPage(0);
          setLoadedKey(null);
        }
      } else {
        setActiveSessionId(sessionId);
      }
    }
    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Fetch messages when a session is selected
  useEffect(() => {
    let ignore = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale messages when no session is selected
    if (!activeProjectId || !activeSessionId) { setActiveMessages([]); return; }
    setMessagesLoading(true);
    fetch(apiUrl(`/api/messages?project=${encodeURIComponent(activeProjectId)}&session=${encodeURIComponent(activeSessionId)}`, demoMode))
      .then(r => r.json())
      .then(r => { if (!ignore) setActiveMessages(r.data || []); })
      .catch(() => { if (!ignore) setActiveMessages([]); })
      .finally(() => { if (!ignore) setMessagesLoading(false); });
    return () => { ignore = true; };
  }, [activeProjectId, activeSessionId, refreshKey, demoMode]);

  const currentKey = activeProjectId ? `${activeProjectId}:${sessionsPage}` : null;
  const sessionsLoading = currentKey !== null && loadedKey !== currentKey;
  const activeConv = sessions.find(c => c.id === activeSessionId) ?? null;
  const sessionsTotalPages = Math.ceil(sessionsTotal / SESSION_PAGE_SIZE);
  const sortedSessions = sessionSort === 'oldest' ? [...sessions].reverse() : sessions;

  function handleDemoToggle(v: boolean) {
    setDemoMode(v);
    localStorage.setItem('lens-demo-mode', String(v));
    refresh();
  }

  function handleProviderChange(p: Provider) {
    setProvider(p);
    localStorage.setItem('lens-provider', p);
    setActiveProjectId(null);
    setActiveSessionId(null);
    setSessions([]);
    setSessionsPage(0);
    setLoadedKey(null);
    const caps = providers.find(x => x.id === p)?.capabilities;
    const viewCapMap: Partial<Record<AppView, keyof ProviderCapabilities>> = {
      logs: 'hasLogs', skills: 'hasSkills', agents: 'hasAgents', mcps: 'hasMcps', memory: 'hasMemory', plans: 'hasPlans',
    };
    const capKey = viewCapMap[currentView as AppView];
    if (capKey && caps && !caps[capKey]) setCurrentView('history');
    refresh();
  }

  // Click the sidebar provider tag to switch to the next provider. Skips ones
  // that aren't selectable (unavailable while demo mode is off), mirroring the
  // Settings picker; falls back to cycling all if none are selectable.
  function cycleProvider() {
    if (providers.length < 2) return;
    const selectable = providers.filter(p => p.available || demoMode);
    const pool = selectable.length > 0 ? selectable : providers;
    const idx = pool.findIndex(p => p.id === provider);
    const next = pool[(idx + 1) % pool.length];
    if (next && next.id !== provider) handleProviderChange(next.id);
  }

  function handleThemeChange(t: 'default' | 'tycho' | 'parchment') {
    setTheme(t);
    localStorage.setItem('lens-theme', t);
  }

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

  const activeProviderInfo = providers.find(p => p.id === provider) ?? null;
  const capabilities = activeProviderInfo?.capabilities ?? NO_CAPABILITIES;
  const providerBadgeClass = `provider-badge provider-badge-${provider ? slugify(provider) : ''}`;
  const SimpleView = SIMPLE_VIEWS[currentView];

  return (
    <div className="flex h-screen bg-lens-bg text-lens-text-body font-sans overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-12' : 'w-56'} border-r border-lens-border flex flex-col bg-lens-deep/30 shrink-0 transition-[width] duration-200 overflow-hidden`}>

        {!sidebarCollapsed && (
          <div className="p-4 border-b border-lens-border shrink-0">
            <h1 className="text-xl font-medium tracking-tight text-lens-text">AI Lens</h1>
            <p className="text-xs text-lens-text-dim mt-1">Local History Explorer</p>
          </div>
        )}

        <div className={`${sidebarCollapsed ? 'p-1' : 'p-2'} border-b border-lens-border shrink-0`}>
          {activeProjectId !== null ? (
            sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-0.5">
                <button onClick={closeProject} title="Back to projects" className="w-full flex justify-center p-2 rounded text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={closeProject} className="w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30" title={activeProjectId}>
                <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
                <span className="truncate flex-1">{prettifyProjectName(activeProjectId)}</span>
              </button>
            )
          ) : (
            <div className={sidebarCollapsed ? 'flex flex-col items-center gap-0.5' : undefined}>
              {NAV_ITEMS.filter(it => it.cap === null || capabilities[it.cap]).map(it => (
                <NavButton
                  key={it.view}
                  item={it}
                  collapsed={sidebarCollapsed}
                  active={currentView === it.view}
                  onClick={() => { setCurrentView(it.view); closeProject(); }}
                />
              ))}
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <div className="flex-1 overflow-y-auto w-full">
            {error && <div className="p-4 text-rose-400 text-sm">{error}</div>}

            {activeProjectId !== null && (
              <div className="flex flex-col h-full">
                <div className="shrink-0 border-b border-lens-border/50 px-2 py-1.5 flex items-center gap-1">
                  <button onClick={() => setSessionSort('newest')} className={`flex-1 text-[10px] px-2 py-1 rounded transition-colors ${sessionSort === 'newest' ? 'bg-lens-border text-lens-accent' : 'text-lens-text-dim hover:text-lens-text-body'}`}>
                    ↓ Newest
                  </button>
                  <button onClick={() => setSessionSort('oldest')} className={`flex-1 text-[10px] px-2 py-1 rounded transition-colors ${sessionSort === 'oldest' ? 'bg-lens-border text-lens-accent' : 'text-lens-text-dim hover:text-lens-text-body'}`}>
                    ↑ Oldest
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {sessionsLoading && <div className="p-4 text-lens-text-dim text-sm">Loading sessions...</div>}
                  {!sessionsLoading && sortedSessions.map(conv => {
                    const isActive = activeSessionId === conv.id;
                    let firstText = conv.preview || 'New Session';
                    if (firstText) {
                      const cmdMatch = firstText.match(/<command-message>([\s\S]*?)<\/command-message>/);
                      const localCmdMatch = firstText.match(/<command-name>(.*?)<\/command-name>/);
                      if (localCmdMatch) firstText = localCmdMatch[1];
                      else if (cmdMatch) firstText = cmdMatch[1];
                      else firstText = firstText.replace(/<[\s\S]*?>/g, '').trim();
                      firstText = firstText.split('\n')[0].trim() || 'New Session';
                    }
                    const totalTok = conv.tokens ? conv.tokens.input + conv.tokens.output : 0;
                    const dur = getSessionDuration(conv);
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setActiveSessionId(conv.id)}
                        className={`w-full text-left p-3 border-b border-lens-border/50 hover:bg-lens-border/30 transition-colors ${isActive ? 'bg-lens-border/80 border-l-2 border-l-lens-accent' : ''}`}
                      >
                        <div className={`text-sm font-medium ${isActive ? 'text-lens-accent-hi' : 'text-lens-text'} truncate w-full block overflow-hidden`}>
                          {firstText}
                        </div>
                        <div className="mt-1.5 text-[10px] text-lens-text-dim flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelative(conv.lastUpdated)}</span>
                          {dur && <span>{dur}</span>}
                          {conv.turnCount !== undefined && <span>{conv.turnCount}t</span>}
                          {totalTok > 0 && <span>{fmt(totalTok)}</span>}
                          {conv.metadata?.copilotVersion && <span className="text-sky-400">v{conv.metadata.copilotVersion}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {sessionsTotalPages > 1 && (
                  <div className="shrink-0 border-t border-lens-border px-2 py-2 flex items-center justify-between">
                    <button onClick={() => setSessionsPage(p => Math.max(0, p - 1))} disabled={sessionsPage === 0} className="px-2 py-1 text-xs rounded text-lens-text-sub hover:text-lens-text hover:bg-lens-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      ← Prev
                    </button>
                    <span className="text-[10px] text-lens-text-dim">{sessionsPage + 1} / {sessionsTotalPages}</span>
                    <button onClick={() => setSessionsPage(p => Math.min(sessionsTotalPages - 1, p + 1))} disabled={sessionsPage === sessionsTotalPages - 1} className="px-2 py-1 text-xs rounded text-lens-text-sub hover:text-lens-text hover:bg-lens-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {sidebarCollapsed && <div className="flex-1" />}

        {/* Active provider tag — sits directly above Settings */}
        {activeProviderInfo && (
          <div className={`shrink-0 ${sidebarCollapsed ? 'p-1 flex justify-center' : 'px-2 py-2'}`}>
            {!sidebarCollapsed && providers.length > 1 && (
              <p className="text-[9px] text-lens-text-faint mb-1 px-0.5">Tip: click to switch provider quickly</p>
            )}
            {(() => { const Icon = iconFor(activeProviderInfo.icon); return (
              <button
                onClick={cycleProvider}
                disabled={providers.length < 2}
                title={providers.length < 2 ? activeProviderInfo.name : `${activeProviderInfo.name} — click to switch provider`}
                className={`flex items-center gap-1.5 rounded border transition-colors enabled:hover:brightness-125 enabled:cursor-pointer disabled:cursor-default ${providerBadgeClass} ${sidebarCollapsed ? 'p-1.5 justify-center' : 'px-2 py-1 text-[11px] w-full'}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{activeProviderInfo.name}</span>}
              </button>
            ); })()}
          </div>
        )}

        {/* Settings — above bottom bar, always visible */}
        <div className={`shrink-0 border-t border-lens-border ${sidebarCollapsed ? 'p-1 flex flex-col items-center' : 'p-2'}`}>
          {sidebarCollapsed ? (
            <button onClick={() => setCurrentView('settings')} title="Settings" className={`w-full flex justify-center p-2 rounded transition-colors ${currentView === 'settings' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
              <Settings className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => { setCurrentView('settings'); closeProject(); }} className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${currentView === 'settings' ? 'bg-lens-border/60 text-lens-text' : 'text-lens-text-sub hover:text-lens-text hover:bg-lens-border/30'}`}>
              <span className="flex items-center"><Settings className="w-4 h-4 mr-2 shrink-0" /> Settings</span>
              {demoMode && <span className="text-[9px] bg-lens-accent/20 text-lens-accent rounded px-1.5 py-0.5 shrink-0">DEMO</span>}
            </button>
          )}
        </div>

        <div className={`shrink-0 border-t border-lens-border p-1.5 flex items-center ${sidebarCollapsed ? 'flex-col gap-1' : 'justify-between'}`}>
          <button onClick={refresh} title="Refresh data" className="p-1.5 rounded text-lens-text-dim hover:text-lens-text hover:bg-lens-border/50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setSidebarCollapsed(c => !c)} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="p-1.5 rounded text-lens-text-dim hover:text-lens-text hover:bg-lens-border/50 transition-colors">
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-lens-bg">
        {demoMode && (
          <div className="shrink-0 bg-lens-accent/10 border-b border-lens-accent/30 px-4 py-2 flex items-center gap-3">
            <span className="text-lens-accent text-xs font-medium">Demo mode</span>
            <span className="text-lens-text-dim text-xs flex-1">
              Showing sample data — not reading from real sources
            </span>
            <button
              onClick={() => { setCurrentView('settings'); closeProject(); }}
              className="text-[10px] px-2 py-0.5 rounded border border-lens-accent/40 text-lens-accent hover:bg-lens-accent/20 transition-colors shrink-0"
            >
              Settings →
            </button>
          </div>
        )}
        {currentView === 'settings' ? (
          <SettingsViewer demoMode={demoMode} providers={providers} provider={provider} onProviderChange={handleProviderChange} onToggle={handleDemoToggle} theme={theme} onThemeChange={handleThemeChange} />
        ) : SimpleView ? (
          <SimpleView key={refreshKey} demoMode={demoMode} providers={providers} provider={provider} />
        ) : activeProjectId === null ? (
          <ProjectGrid projects={projects} providers={providers} onOpen={openProject} />
        ) : activeConv ? (
          <SessionView
            key={activeConv.id}
            conv={activeConv}
            messages={activeMessages}
            loading={messagesLoading}
            assistantLabel={providers.find(p => p.id === activeConv.provider)?.name ?? activeProviderInfo?.name ?? 'Assistant'}
          />
        ) : activeProjectId !== null && !activeConv ? (
          <ProjectDiagnostics key={activeProjectId} projectId={activeProjectId} demoMode={demoMode} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-lens-text-dim">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a session to view history</p>
              <p className="text-xs mt-2 text-lens-text-faint">j/k or ↑↓ to navigate · Esc to go back · ⌘F to search</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

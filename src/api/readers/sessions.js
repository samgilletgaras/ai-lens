// Pure registry — no knowledge of any specific provider.
// Each provider registers its implementation on import.

const registry = new Map();

export function register(name, impl) {
  registry.set(name, impl);
}

function resolve(provider) {
  const impl = registry.get(provider);
  if (!impl) throw new Error(`No sessions implementation registered for provider: ${provider}`);
  return impl;
}

export const getProjects = (provider) =>
  resolve(provider).getProjects();

export const getSessions = (provider, project, page = 0, pageSize = 20) =>
  resolve(provider).getSessions(project, page, pageSize);

export const getMessages = (provider, project, sessionId) =>
  resolve(provider).getMessages(project, sessionId);

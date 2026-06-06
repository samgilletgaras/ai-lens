// Pure registry — no knowledge of any specific provider.
// Each provider registers its implementation on import.

const registry = new Map();

export function register(name, impl) {
  registry.set(name, impl);
}

function resolve(provider) {
  const impl = registry.get(provider);
  if (!impl) throw new Error(`No stats implementation registered for provider: ${provider}`);
  return impl;
}

export const getStats = (provider, project = null) =>
  resolve(provider).getStats(project);

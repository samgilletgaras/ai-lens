/**
 * @typedef {Object} Provider
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => Promise<import('../readers/sessions.js').ProjectSummary[]>} getProjects
 * @property {(project: string, page: number, pageSize: number) => Promise<{data: any[], total: number}>} getSessions
 * @property {(project: string, session: string) => Promise<any[]>} getMessages
 * @property {(project?: string|null) => Promise<any|null>} getStats
 */

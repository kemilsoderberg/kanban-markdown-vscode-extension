// Kanban types

export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type FeatureStatus = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done'
export type IssueStatus = 'todo' | 'doing' | 'done'

export interface Issue {
  id: string
  status: IssueStatus
  created: string
  modified: string
  title: string
  content: string
  filePath: string
}

// AI agent types
export type AIAgent = 'claude' | 'codex' | 'opencode' | 'copilot'
export type AIPermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'

export interface Feature {
  id: string
  status: FeatureStatus
  priority: Priority
  assignee: string | null
  epic: string | null
  dueDate: string | null
  created: string
  modified: string
  completedAt: string | null
  labels: string[]
  order: string
  content: string
  filePath: string
  /** Issues linked by location (`<featureDir>/issues/`). Populated by the extension. */
  issues?: Issue[]
}

// Parse title from the first # heading in markdown content, falling back to the first line
export function getTitleFromContent(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  const firstLine = content.split('\n').map(l => l.trim()).find(l => l.length > 0)
  return firstLine || 'Untitled'
}

// Generate a filename-safe slug from a title
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Trim hyphens from start/end
    .slice(0, 50) // Limit length
}

export function generateFeatureSlug(title: string): string {
  return slugifyTitle(title) || 'feature'
}

export interface KanbanColumn {
  id: string
  name: string
  color: string
}

export const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', name: 'Backlog', color: '#6b7280' },
  { id: 'todo', name: 'To Do', color: '#3b82f6' },
  { id: 'in-progress', name: 'In Progress', color: '#f59e0b' },
  { id: 'review', name: 'Review', color: '#8b5cf6' },
  { id: 'done', name: 'Done', color: '#22c55e' }
]

export interface CardDisplaySettings {
  showPriorityBadges: boolean
  showAssignee: boolean
  showDueDate: boolean
  showLabels: boolean
  showEpic: boolean
  showBuildWithAI: boolean
  showFileName: boolean
  compactMode: boolean
  markdownEditorMode: boolean
  hideScrollbar: boolean
  defaultPriority: Priority
  defaultStatus: FeatureStatus
}

// Messages between extension and webview
export type BoardViewMode = 'standard' | 'epic'

/** Stable id for the "no epic" swim lane (persisted collapse state). */
export const NO_EPIC_LANE_ID = '__no_epic__'

export function epicLaneId(epic: string | null | undefined): string {
  const t = epic?.trim()
  return t ? t : NO_EPIC_LANE_ID
}

export type ExtensionMessage =
  | { type: 'init'; features: Feature[]; columns: KanbanColumn[]; settings: CardDisplaySettings; collapsedColumns: string[]; boardViewMode: BoardViewMode; collapsedEpics: string[]; locale: string; translations: Record<string, string> }
  | { type: 'featuresUpdated'; features: Feature[] }
  | { type: 'triggerCreateDialog' }
  | { type: 'featureContent'; featureId: string; content: string; frontmatter: FeatureFrontmatter }
  | { type: 'issueContent'; issueId: string; featureId: string; content: string; frontmatter: IssueFrontmatter }
  | { type: 'issuesUpdated'; featureId: string; issues: Issue[] }

// Frontmatter for editing
export interface FeatureFrontmatter {
  id: string
  status: FeatureStatus
  priority: Priority
  assignee: string | null
  epic: string | null
  dueDate: string | null
  created: string
  modified: string
  completedAt: string | null
  labels: string[]
  order: string
}

// Minimal frontmatter for editing issues
export interface IssueFrontmatter {
  id: string
  status: IssueStatus
  created: string
  modified: string
}

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'createFeature'; data: { status: FeatureStatus; priority: Priority; content: string; assignee: string | null; epic: string | null; dueDate: string | null; labels: string[] } }
  | { type: 'moveFeature'; featureId: string; newStatus: string; newOrder: number }
  | { type: 'deleteFeature'; featureId: string }
  | { type: 'updateFeature'; featureId: string; updates: Partial<Feature> }
  | { type: 'openFeature'; featureId: string }
  | { type: 'saveFeatureContent'; featureId: string; content: string; frontmatter: FeatureFrontmatter }
  | { type: 'closeFeature' }
  | { type: 'openFile'; featureId: string }
  | { type: 'openSettings' }
  | { type: 'toggleColumnCollapsed'; columnId: string }
  | { type: 'setBoardViewMode'; mode: BoardViewMode }
  | { type: 'toggleEpicCollapsed'; epicKey: string }
  | { type: 'moveAllCards'; sourceColumnId: string; targetColumnId: string; epicLane?: string | null }
  | { type: 'archiveAllCards'; sourceColumnId: string }
  | { type: 'renameLabel'; oldName: string; newName: string }
  | { type: 'deleteLabel'; labelName: string }
  | { type: 'addIssue'; featureId: string; title: string }
  | { type: 'openIssue'; featureId: string; issueId: string }
  | { type: 'saveIssueContent'; featureId: string; issueId: string; content: string; frontmatter: IssueFrontmatter }
  | { type: 'deleteIssue'; featureId: string; issueId: string }
  | { type: 'closeIssue' }

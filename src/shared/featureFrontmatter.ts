import * as path from 'path'
import type { Feature, FeatureStatus, Issue, IssueStatus, Priority } from './types'

/**
 * The feature id falls back to the filename base; for directory-layout
 * features (a `<slug>/spec.md`) it falls back to the directory name.
 */
export function featureIdFromPath(filePath: string): string {
  const base = path.basename(filePath, '.md')
  if (base === 'spec') {
    return path.basename(path.dirname(filePath))
  }
  return base
}

// Issue title comes from the first `#` heading in the body, falling back to
// the first non-empty line, then 'Untitled'.
function getTitleFromIssueContent(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  const firstLine = content.split('\n').map(l => l.trim()).find(l => l.length > 0)
  return firstLine || 'Untitled'
}

export function parseFeatureFile(content: string, filePath: string): Feature | null {
  content = content.replace(/\r\n/g, '\n')
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!frontmatterMatch) return null

  const frontmatter = frontmatterMatch[1]
  const body = frontmatterMatch[2] || ''

  const getValue = (key: string): string => {
    const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
    if (!match) return ''
    const value = match[1].trim().replace(/^["']|["']$/g, '')
    return value === 'null' ? '' : value
  }

  const getArrayValue = (key: string): string[] => {
    const match = frontmatter.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'))
    if (!match) return []
    return match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }

  const id = getValue('id') || featureIdFromPath(filePath)

  return {
    id,
    status: (getValue('status') as FeatureStatus) || 'backlog',
    priority: (getValue('priority') as Priority) || 'medium',
    assignee: getValue('assignee') || null,
    epic: getValue('epic') || null,
    dueDate: getValue('dueDate') || null,
    created: getValue('created') || new Date().toISOString(),
    modified: getValue('modified') || new Date().toISOString(),
    completedAt: getValue('completedAt') || null,
    labels: getArrayValue('labels'),
    order: getValue('order') || 'a0',
    content: body.trim(),
    filePath
  }
}

export function serializeFeature(feature: Feature): string {
  const frontmatter = [
    '---',
    `id: "${feature.id}"`,
    `status: "${feature.status}"`,
    `priority: "${feature.priority}"`,
    `assignee: ${feature.assignee ? `"${feature.assignee}"` : 'null'}`,
    `epic: ${feature.epic ? `"${feature.epic}"` : 'null'}`,
    `dueDate: ${feature.dueDate ? `"${feature.dueDate}"` : 'null'}`,
    `created: "${feature.created}"`,
    `modified: "${feature.modified}"`,
    `completedAt: ${feature.completedAt ? `"${feature.completedAt}"` : 'null'}`,
    `labels: [${feature.labels.map(l => `"${l}"`).join(', ')}]`,
    `order: "${feature.order}"`,
    '---',
    ''
  ].join('\n')

  return frontmatter + feature.content
}

export function parseIssueFile(content: string, filePath: string): Issue | null {
  content = content.replace(/\r\n/g, '\n')
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!frontmatterMatch) return null

  const frontmatter = frontmatterMatch[1]
  const body = frontmatterMatch[2] || ''

  const getValue = (key: string): string => {
    const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
    if (!match) return ''
    const value = match[1].trim().replace(/^["']|["']$/g, '')
    return value === 'null' ? '' : value
  }

  const title = getTitleFromIssueContent(body)

  return {
    id: getValue('id') || path.basename(filePath, '.md'),
    status: (getValue('status') as IssueStatus) || 'todo',
    created: getValue('created') || new Date().toISOString(),
    modified: getValue('modified') || new Date().toISOString(),
    title,
    content: body.trim(),
    filePath
  }
}

export function serializeIssue(issue: Issue): string {
  const frontmatter = [
    '---',
    `id: "${issue.id}"`,
    `status: "${issue.status}"`,
    `created: "${issue.created}"`,
    `modified: "${issue.modified}"`,
    '---',
    ''
  ].join('\n')

  return frontmatter + issue.content
}


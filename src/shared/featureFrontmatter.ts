import * as path from 'path'
import type { Feature, FeatureStatus, Issue, IssueStatus, Priority } from './types'
import { getTitleFromContent } from './types'

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

/**
 * Decides whether a path points at a feature directory's spec file
 * (`<...>/spec.md`) as opposed to a legacy flat feature file or an issue
 * file. Central decision: what makes a feature a directory feature.
 */
export function isDirectoryFeaturePath(filePath: string): boolean {
  return path.basename(filePath) === 'spec.md'
}

// Issue titles use the same rule as feature titles: the first `#` heading,
// falling back to the first non-empty line, then 'Untitled' (shared with
// types.ts via getTitleFromContent).

export function parseFeatureFile(content: string, filePath: string): Feature | null {
  const split = splitFrontmatter(content)
  if (!split) return null

  const { getValue, getArrayValue } = splitFrontmatterHelpers(split.frontmatter)

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
    content: split.body.trim(),
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

/** The line-scoped frontmatter accessors shared by the feature and issue parsers. */
function splitFrontmatterHelpers(frontmatter: string): {
  getValue: (key: string) => string
  getArrayValue: (key: string) => string[]
} {
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

  return { getValue, getArrayValue }
}

/** The frontmatter extraction shared by the feature and issue parsers. */
function splitFrontmatter(content: string): { frontmatter: string; body: string } | null {
  const normalized = content.replace(/\r\n/g, '\n')
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!frontmatterMatch) return null
  return { frontmatter: frontmatterMatch[1], body: frontmatterMatch[2] || '' }
}

export function parseIssueFile(content: string, filePath: string): Issue | null {
  const split = splitFrontmatter(content)
  if (!split) return null

  const { getValue } = splitFrontmatterHelpers(split.frontmatter)

  const title = getTitleFromContent(split.body)

  return {
    id: getValue('id') || path.basename(filePath, '.md'),
    status: (getValue('status') as IssueStatus) || 'todo',
    created: getValue('created') || new Date().toISOString(),
    modified: getValue('modified') || new Date().toISOString(),
    title,
    content: split.body.trim(),
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


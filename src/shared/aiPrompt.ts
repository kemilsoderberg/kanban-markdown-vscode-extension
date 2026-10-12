import * as path from 'path'

/**
 * The shared prompt sent to an AI agent for a feature. References the
 * feature's spec.md; for directory features it also mentions the feature's
 * issues/ directory so the agent picks up subtasks itself.
 */
export function buildFeaturePrompt(input: {
  title: string
  priority: string
  labels: string[]
  content: string
  filePath: string
}): string {
  const labels = input.labels.length > 0 ? ` [${input.labels.join(', ')}]` : ''
  const description = input.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  const shortDesc = description.length > 200 ? description.substring(0, 200) + '...' : description

  let details = `See full details in: ${input.filePath}`
  if (path.basename(input.filePath) === 'spec.md') {
    const issuesDir = path.join(path.dirname(input.filePath), 'issues')
    details += ` and its subtasks in: ${issuesDir}`
  }

  return `Implement this feature: "${input.title}" (${input.priority} priority)${labels}. ${shortDesc} ${details}`
}

/**
 * The prompt sent to an AI agent for a single issue. References the issue
 * file and the feature's spec.md for context.
 */
export function buildIssuePrompt(input: {
  title: string
  content: string
  issuePath: string
  specPath: string
}): string {
  const description = input.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  const shortDesc = description.length > 200 ? description.substring(0, 200) + '...' : description
  return `Implement this issue: "${input.title}". ${shortDesc} See full details in: ${input.issuePath}. The feature spec for context is: ${input.specPath}`
}

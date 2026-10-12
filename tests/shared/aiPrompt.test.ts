import { describe, it, expect } from 'vitest'
import { buildFeaturePrompt, buildIssuePrompt } from '../../src/shared/aiPrompt'

describe('buildFeaturePrompt', () => {
  it('references the spec.md path and the issues/ directory for a directory feature', () => {
    const prompt = buildFeaturePrompt({
      title: 'Feature directories',
      priority: 'high',
      labels: ['backend'],
      content: '# Feature directories\n\nMake features directories.',
      filePath: '/ws/.devtool/features/feature-directories/spec.md'
    })
    expect(prompt).toContain('/ws/.devtool/features/feature-directories/spec.md')
    expect(prompt).toContain('/ws/.devtool/features/feature-directories/issues')
  })

  it('keeps the flat-file prompt for a legacy flat feature (no issues/ mention)', () => {
    const prompt = buildFeaturePrompt({
      title: 'Old feature',
      priority: 'medium',
      labels: [],
      content: '# Old feature\n\nDo the thing.',
      filePath: '/ws/.devtool/features/old-feature.md'
    })
    expect(prompt).toContain('/ws/.devtool/features/old-feature.md')
    expect(prompt).not.toContain('issues')
  })

  it('includes title, priority, labels and a truncated description', () => {
    const long = 'word '.repeat(100)
    const prompt = buildFeaturePrompt({
      title: 'T',
      priority: 'low',
      labels: ['a', 'b'],
      content: `# T\n${long}`,
      filePath: '/ws/features/t/spec.md'
    })
    expect(prompt).toContain('"T"')
    expect(prompt).toContain('low priority')
    expect(prompt).toContain('[a, b]')
    expect(prompt).toContain('...')
    expect(prompt.length).toBeLessThan(600)
  })
})

describe('buildIssuePrompt', () => {
  it('references the issue file path and the feature spec for context', () => {
    const prompt = buildIssuePrompt({
      title: 'Set up database',
      content: '# Set up database\n\nCreate the schema.',
      issuePath: '/ws/.devtool/features/my-feature/issues/001-setup-db.md',
      specPath: '/ws/.devtool/features/my-feature/spec.md'
    })
    expect(prompt).toContain('/ws/.devtool/features/my-feature/issues/001-setup-db.md')
    expect(prompt).toContain('/ws/.devtool/features/my-feature/spec.md')
    expect(prompt).toContain('"Set up database"')
  })

  it('truncates a long issue body', () => {
    const prompt = buildIssuePrompt({
      title: 'Big',
      content: `# Big\n${'word '.repeat(100)}`,
      issuePath: '/ws/f/issues/001-big.md',
      specPath: '/ws/f/spec.md'
    })
    expect(prompt).toContain('...')
  })
})

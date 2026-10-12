import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/webview/store'
import type { Feature, Issue, IssueStatus } from '../../src/shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const initialState = useStore.getState()

beforeEach(() => {
  useStore.setState(initialState, true)
})

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'f1',
    status: 'todo',
    priority: 'medium',
    assignee: null,
    epic: null,
    dueDate: null,
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    labels: [],
    order: 'a0',
    content: '# Feature',
    filePath: '/workspace/features/feature/spec.md',
    ...overrides
  }
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: '001-setup-db',
    status: 'todo',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    title: 'Set up database',
    content: '# Set up database',
    filePath: '/workspace/features/feature/issues/001-setup-db.md',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Issue state
// ---------------------------------------------------------------------------

describe('setFeatures with issues', () => {
  it('carries issues attached to features', () => {
    const f = makeFeature({ issues: [makeIssue()] })
    useStore.getState().setFeatures([f])
    expect(useStore.getState().features[0].issues).toHaveLength(1)
    expect(useStore.getState().features[0].issues![0].id).toBe('001-setup-db')
  })
})

describe('addIssue', () => {
  it('appends an issue to the named feature', () => {
    useStore.getState().setFeatures([makeFeature({ id: 'f1' })])
    useStore.getState().addIssue('f1', makeIssue({ id: '001-a' }))
    const feature = useStore.getState().features.find(f => f.id === 'f1')!
    expect(feature.issues).toHaveLength(1)
    expect(feature.issues![0].id).toBe('001-a')
  })

  it('leaves other features untouched', () => {
    useStore.getState().setFeatures([makeFeature({ id: 'a' }), makeFeature({ id: 'b' })])
    useStore.getState().addIssue('a', makeIssue({ id: '001-a' }))
    expect(useStore.getState().features.find(f => f.id === 'b')!.issues).toBeUndefined()
  })

  it('initializes the issues list when the feature has none', () => {
    useStore.getState().setFeatures([makeFeature({ id: 'f1', issues: undefined })])
    useStore.getState().addIssue('f1', makeIssue())
    expect(useStore.getState().features.find(f => f.id === 'f1')!.issues).toHaveLength(1)
  })

  it('does nothing when the feature does not exist', () => {
    useStore.getState().setFeatures([makeFeature({ id: 'f1' })])
    useStore.getState().addIssue('missing', makeIssue())
    expect(useStore.getState().features.find(f => f.id === 'f1')!.issues).toBeUndefined()
  })
})

describe('removeIssue', () => {
  it('removes the issue with the given id from the feature', () => {
    useStore.getState().setFeatures([
      makeFeature({ id: 'f1', issues: [makeIssue({ id: '001-a' }), makeIssue({ id: '002-b' })] })
    ])
    useStore.getState().removeIssue('f1', '001-a')
    const feature = useStore.getState().features.find(f => f.id === 'f1')!
    expect(feature.issues!.map(i => i.id)).toEqual(['002-b'])
  })

  it('keeps other features untouched', () => {
    useStore.getState().setFeatures([
      makeFeature({ id: 'a', issues: [makeIssue()] }),
      makeFeature({ id: 'b', issues: [makeIssue({ id: '002-b' })] })
    ])
    useStore.getState().removeIssue('a', '001-setup-db')
    expect(useStore.getState().features.find(f => f.id === 'b')!.issues).toHaveLength(1)
  })
})

describe('updateIssue', () => {
  it('merges updates into the matching issue', () => {
    useStore.getState().setFeatures([
      makeFeature({ id: 'f1', issues: [makeIssue({ id: '001-a', status: 'todo' })] })
    ])
    useStore.getState().updateIssue('f1', '001-a', { status: 'done' })
    const issue = useStore.getState().features.find(f => f.id === 'f1')!.issues![0]
    expect(issue.status).toBe('done')
    expect(issue.id).toBe('001-a')
  })

  it('does nothing when the issue does not exist', () => {
    useStore.getState().setFeatures([makeFeature({ id: 'f1', issues: [makeIssue()] })])
    useStore.getState().updateIssue('f1', 'missing', { status: 'done' })
    expect(useStore.getState().features.find(f => f.id === 'f1')!.issues![0].status).toBe('todo')
  })
})

// ---------------------------------------------------------------------------
// Mini-board move transitions
// ---------------------------------------------------------------------------

describe('moveIssue', () => {
  it('moves an issue to the new status within the feature', () => {
    useStore.getState().setFeatures([
      makeFeature({ id: 'f1', issues: [makeIssue({ id: '001-a', status: 'todo' })] })
    ])
    useStore.getState().moveIssue('f1', '001-a', 'doing')
    const issue = useStore.getState().features.find(f => f.id === 'f1')!.issues![0]
    expect(issue.status).toBe('doing')
  })

  it('leaves other issues and features untouched', () => {
    useStore.getState().setFeatures([
      makeFeature({ id: 'f1', issues: [makeIssue({ id: '001-a' }), makeIssue({ id: '002-b' })] }),
      makeFeature({ id: 'f2', issues: [makeIssue({ id: '003-c' })] })
    ])
    useStore.getState().moveIssue('f1', '001-a', 'done')
    const f1 = useStore.getState().features.find(f => f.id === 'f1')!
    expect(f1.issues!.find(i => i.id === '002-b')!.status).toBe('todo')
    expect(useStore.getState().features.find(f => f.id === 'f2')!.issues![0].status).toBe('todo')
  })

  it('does nothing when the issue does not exist', () => {
    useStore.getState().setFeatures([makeFeature({ id: 'f1', issues: [makeIssue()] })])
    useStore.getState().moveIssue('f1', 'missing', 'done')
    expect(useStore.getState().features.find(f => f.id === 'f1')!.issues![0].status).toBe('todo')
  })
})

// ---------------------------------------------------------------------------
// Issue selectors
// ---------------------------------------------------------------------------

describe('getIssuesByStatus', () => {
  it('returns only the feature’s issues with the given status, alphabetical by id', () => {
    useStore.getState().setFeatures([
      makeFeature({
        id: 'f1',
        issues: [
          makeIssue({ id: '002-b', status: 'done' }),
          makeIssue({ id: '001-a', status: 'todo' }),
          makeIssue({ id: '003-c', status: 'todo' }),
          makeIssue({ id: '004-d', status: 'doing' })
        ]
      }),
      makeFeature({ id: 'f2', issues: [makeIssue({ id: '001-z', status: 'todo' })] })
    ])
    const todos = useStore.getState().getIssuesByStatus('f1', 'todo' as IssueStatus)
    expect(todos.map(i => i.id)).toEqual(['001-a', '003-c'])
    const doing = useStore.getState().getIssuesByStatus('f1', 'doing' as IssueStatus)
    expect(doing.map(i => i.id)).toEqual(['004-d'])
    const done = useStore.getState().getIssuesByStatus('f1', 'done' as IssueStatus)
    expect(done.map(i => i.id)).toEqual(['002-b'])
  })

  it('returns an empty list for a feature without issues', () => {
    useStore.getState().setFeatures([makeFeature({ id: 'f1' })])
    expect(useStore.getState().getIssuesByStatus('f1', 'todo' as IssueStatus)).toEqual([])
  })
})

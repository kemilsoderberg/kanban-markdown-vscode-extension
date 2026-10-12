// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeatureEditor } from '../../../src/webview/components/FeatureEditor'
import { useStore } from '../../../src/webview/store'
import type { Feature, Issue, IssueFrontmatter, CardDisplaySettings } from '../../../src/shared/types'

// ---------------------------------------------------------------------------
// vscode bridge mock
// ---------------------------------------------------------------------------

const { mockPostMessage } = vi.hoisted(() => ({ mockPostMessage: vi.fn() }))
vi.mock('../../../src/webview/vscodeApi', () => ({
  vscode: { postMessage: mockPostMessage }
}))

// ---------------------------------------------------------------------------
// Store reset
// ---------------------------------------------------------------------------

const initialState = useStore.getState()

beforeEach(() => {
  useStore.setState(initialState, true)
  mockPostMessage.mockClear()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultSettings: CardDisplaySettings = {
  showPriorityBadges: true,
  showAssignee: true,
  showDueDate: true,
  showLabels: true,
  showEpic: true,
  showBuildWithAI: true,
  showFileName: false,
  compactMode: false,
  markdownEditorMode: false,
  defaultPriority: 'medium',
  defaultStatus: 'backlog'
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'my-feature',
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
    content: '# My Feature',
    filePath: '/workspace/features/my-feature/spec.md',
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
    filePath: '/workspace/features/my-feature/issues/001-setup-db.md',
    ...overrides
  }
}

function makeIssueFrontmatter(overrides: Partial<IssueFrontmatter> = {}): IssueFrontmatter {
  return {
    id: '001-setup-db',
    status: 'todo',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function setup(overrides: { feature?: Feature; issueFrontmatter?: IssueFrontmatter } = {}) {
  const feature = overrides.feature ?? makeFeature({
    issues: [makeIssue(), makeIssue({ id: '002-b', title: 'Write tests', status: 'doing' })]
  })
  useStore.setState({ features: [feature], cardSettings: defaultSettings })
  return (
    <FeatureEditor
      featureId={feature.id}
      content={'# My Feature\n\nBody.'}
      frontmatter={{
        id: feature.id,
        status: feature.status,
        priority: feature.priority,
        assignee: feature.assignee,
        epic: feature.epic,
        dueDate: feature.dueDate,
        created: feature.created,
        modified: feature.modified,
        completedAt: feature.completedAt,
        labels: feature.labels,
        order: feature.order
      }}
      issueFrontmatter={overrides.issueFrontmatter ?? null}
      onSave={() => {}}
      onClose={() => {}}
      onDelete={() => {}}
      onOpenFile={() => {}}
      onStartWithAI={() => {}}
    />
  )
}

// ---------------------------------------------------------------------------
// Issue list section in the detail view
// ---------------------------------------------------------------------------

describe('FeatureEditor — issue list', () => {
  it('shows the feature’s issues', () => {
    render(setup())
    expect(screen.getByText('Set up database')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
  })

  it('has an add-issue input; submitting posts addIssue', () => {
    render(setup())
    const input = screen.getByPlaceholderText(/add issue/i)
    fireEvent.change(input, { target: { value: 'New subtask' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'addIssue',
      featureId: 'my-feature',
      title: 'New subtask'
    })
  })

  it('clicking an issue posts openIssue', () => {
    render(setup())
    fireEvent.click(screen.getByText('Write tests'))
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'openIssue',
      featureId: 'my-feature',
      issueId: '002-b'
    })
  })

  it('shows a delete affordance per issue; confirming posts deleteIssue', () => {
    render(setup())
    fireEvent.click(screen.getByText('Write tests'))
    // The delete affordance sits in the same row as the issue title
    const row = screen.getByText('Write tests').closest('div')!
    fireEvent.click(row.querySelector('button[title]')!)
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'deleteIssue',
      featureId: 'my-feature',
      issueId: '002-b'
    })
  })
})

// ---------------------------------------------------------------------------
// Issue editing mode
// ---------------------------------------------------------------------------

describe('FeatureEditor — issue editing mode', () => {
  it('when issueFrontmatter is set, shows only the three issue statuses', () => {
    render(setup({ issueFrontmatter: makeIssueFrontmatter() }))
    fireEvent.click(screen.getByText(/to do/i))
    expect(screen.getByText('Doing')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByText('Backlog')).not.toBeInTheDocument()
    expect(screen.queryByText('Review')).not.toBeInTheDocument()
  })

  it('in issue mode the feature property rows (priority, assignee, epic, due date, labels) are absent', () => {
    render(setup({ issueFrontmatter: makeIssueFrontmatter() }))
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/assignee/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/epic/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/due date/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/labels/i)).not.toBeInTheDocument()
  })

  it('closing an open issue posts closeIssue', () => {
    render(setup({ issueFrontmatter: makeIssueFrontmatter() }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'closeIssue' })
  })
})

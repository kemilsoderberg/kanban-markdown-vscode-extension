// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeatureCard } from '../../../src/webview/components/FeatureCard'
import { useStore } from '../../../src/webview/store'
import type { Feature, Issue, CardDisplaySettings } from '../../../src/shared/types'

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

function setSettings(overrides: Partial<CardDisplaySettings> = {}) {
  useStore.setState({ cardSettings: { ...defaultSettings, ...overrides } })
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

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'my-feature',
    status: 'todo',
    priority: 'high',
    assignee: 'lucio',
    epic: null,
    dueDate: null,
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    labels: ['frontend', 'bug'],
    order: 'a0',
    content: '# My Feature\n\nA short description.',
    filePath: '/workspace/features/my-feature/spec.md',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Done counter
// ---------------------------------------------------------------------------

describe('FeatureCard — issues done counter', () => {
  it('shows the done-counter (done/total) when the feature has issues', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature({ issues: [makeIssue(), makeIssue({ id: '002-b', status: 'done' }), makeIssue({ id: '003-c' })] })} onClick={() => {}} />)
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('shows no counter when the feature has no issues', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature()} onClick={() => {}} />)
    expect(screen.queryByText('0/0')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Expandable issue list
// ---------------------------------------------------------------------------

describe('FeatureCard — expandable issue list', () => {
  it('does not show issue titles until expanded', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature({ issues: [makeIssue()] })} onClick={() => {}} />)
    expect(screen.queryByText('Set up database')).not.toBeInTheDocument()
  })

  it('shows the issue list after clicking the expander', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature({ issues: [makeIssue(), makeIssue({ id: '002-b', title: 'Write tests' })] })} onClick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle issues/i }))
    expect(screen.getByText('Set up database')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
  })

  it('clicking an issue in the expanded list posts openIssue and does not open the feature', () => {
    setSettings()
    const onClick = vi.fn()
    render(<FeatureCard feature={makeFeature({ issues: [makeIssue()] })} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle issues/i }))
    fireEvent.click(screen.getByText('Set up database'))
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'openIssue',
      featureId: 'my-feature',
      issueId: '001-setup-db'
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('collapses the list again on a second expander click', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature({ issues: [makeIssue()] })} onClick={() => {}} />)
    const expander = screen.getByRole('button', { name: /toggle issues/i })
    fireEvent.click(expander)
    fireEvent.click(expander)
    expect(screen.queryByText('Set up database')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Build with AI on issues
// ---------------------------------------------------------------------------

describe('FeatureCard — issue Build with AI', () => {
  it('exposes a Build with AI affordance per issue in the expanded list; clicking posts startIssueWithAI', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature({ issues: [makeIssue(), makeIssue({ id: '002-b', title: 'Write tests' })] })} onClick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle issues/i }))
    const buttons = screen.getAllByRole('button', { name: /build this issue with ai/i })
    expect(buttons.length).toBe(2)
    fireEvent.click(buttons[1])
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'startIssueWithAI',
      featureId: 'my-feature',
      issueId: '002-b',
      agent: 'claude',
      permissionMode: 'default'
    })
  })
})

// ---------------------------------------------------------------------------
// Add issue from the card
// ---------------------------------------------------------------------------

describe('FeatureCard — add issue', () => {
  it('typing an issue title and submitting posts addIssue with the title', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature()} onClick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /add issue/i }))
    const input = screen.getByPlaceholderText(/issue/i)
    fireEvent.change(input, { target: { value: 'Set up database' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'addIssue',
      featureId: 'my-feature',
      title: 'Set up database'
    })
  })

  it('an empty submission posts nothing', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature()} onClick={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /add issue/i }))
    const input = screen.getByPlaceholderText(/issue/i)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPostMessage).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Card preview stays spec-only
// ---------------------------------------------------------------------------

describe('FeatureCard — preview stays spec-only', () => {
  it('the card description still comes from spec.md content only', () => {
    setSettings()
    render(<FeatureCard feature={makeFeature({ issues: [makeIssue({ title: 'Issue body text' })] })} onClick={() => {}} />)
    expect(screen.getByText('A short description.')).toBeInTheDocument()
    expect(screen.queryByText('Issue body text')).not.toBeInTheDocument()
  })
})

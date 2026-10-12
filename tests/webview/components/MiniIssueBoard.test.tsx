// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MiniIssueBoard } from '../../../src/webview/components/MiniIssueBoard'
import { useStore } from '../../../src/webview/store'
import type { Feature, Issue } from '../../../src/shared/types'

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

function setup(issues: Issue[], featureId = 'my-feature', onDeleteIssue?: (featureId: string, issueId: string) => void, onStartWithAI?: (issueId: string) => void) {
  useStore.setState({
    features: [makeFeature({ id: featureId, issues })]
  })
  return render(<MiniIssueBoard featureId={featureId} onDeleteIssue={onDeleteIssue} onStartWithAI={onStartWithAI} />)
}

// ---------------------------------------------------------------------------
// Rendering — three columns
// ---------------------------------------------------------------------------

describe('MiniIssueBoard — rendering', () => {
  it('renders three columns labeled todo / doing / done', () => {
    setup([makeIssue()])
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('Doing')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows each issue title in its status column', () => {
    setup([
      makeIssue({ id: '001-a', title: 'Set up database', status: 'todo' }),
      makeIssue({ id: '002-b', title: 'Write tests', status: 'doing' }),
      makeIssue({ id: '003-c', title: 'Ship it', status: 'done' })
    ])
    const todoCol = screen.getByText('To Do').closest('[data-testid="mini-column-todo"]')!
    const doingCol = screen.getByText('Doing').closest('[data-testid="mini-column-doing"]')!
    const doneCol = screen.getByText('Done').closest('[data-testid="mini-column-done"]')!
    expect(within(todoCol as HTMLElement).getByText('Set up database')).toBeInTheDocument()
    expect(within(doingCol as HTMLElement).getByText('Write tests')).toBeInTheDocument()
    expect(within(doneCol as HTMLElement).getByText('Ship it')).toBeInTheDocument()
  })

  it('orders issues alphabetically by filename (id) within each column', () => {
    setup([
      makeIssue({ id: '003-c', title: 'Charlie', status: 'todo' }),
      makeIssue({ id: '001-a', title: 'Alpha', status: 'todo' }),
      makeIssue({ id: '002-b', title: 'Bravo', status: 'todo' })
    ])
    const todoCol = screen.getByText('To Do').closest('[data-testid="mini-column-todo"]')!
    const titles = within(todoCol as HTMLElement).getAllByText(/^(Alpha|Bravo|Charlie)$/)
    expect(titles.map(t => t.textContent)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
})

// ---------------------------------------------------------------------------
// Drag and drop — move between columns
// ---------------------------------------------------------------------------

describe('MiniIssueBoard — drag and drop', () => {
  it('dragging an issue to another column posts moveIssue with the new status', () => {
    setup([makeIssue({ id: '001-a', title: 'Set up database', status: 'todo' })])
    const card = screen.getByText('Set up database')
    fireEvent.dragStart(card, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' }
    })
    const doingCol = screen.getByText('Doing').closest('[data-testid="mini-column-doing"]')!
    fireEvent.drop(doingCol as HTMLElement, {
      dataTransfer: { getData: () => '001-a' }
    })
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'moveIssue',
      featureId: 'my-feature',
      issueId: '001-a',
      newStatus: 'doing'
    })
  })

  it('does not post moveIssue when the issue is dropped on its own column', () => {
    setup([makeIssue({ id: '001-a', title: 'Set up database', status: 'todo' })])
    const card = screen.getByText('Set up database')
    fireEvent.dragStart(card, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' }
    })
    const todoCol = screen.getByText('To Do').closest('[data-testid="mini-column-todo"]')!
    fireEvent.drop(todoCol as HTMLElement, {
      dataTransfer: { getData: () => '001-a' }
    })
    expect(mockPostMessage).not.toHaveBeenCalled()
  })

  it('after a move, the issue re-renders in the new column', () => {
    setup([makeIssue({ id: '001-a', title: 'Set up database', status: 'todo' })])
    const card = screen.getByText('Set up database')
    fireEvent.dragStart(card, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' }
    })
    const doingCol = screen.getByText('Doing').closest('[data-testid="mini-column-doing"]')!
    fireEvent.drop(doingCol as HTMLElement, {
      dataTransfer: { getData: () => '001-a' }
    })
    const doingColAfter = screen.getByText('Doing').closest('[data-testid="mini-column-doing"]')!
    expect(within(doingColAfter as HTMLElement).getByText('Set up database')).toBeInTheDocument()
    const todoColAfter = screen.getByText('To Do').closest('[data-testid="mini-column-todo"]')!
    expect(within(todoColAfter as HTMLElement).queryByText('Set up database')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Add issue
// ---------------------------------------------------------------------------

describe('MiniIssueBoard — add issue', () => {
  it('has an add-issue input; submitting posts addIssue', () => {
    setup([])
    const input = screen.getAllByPlaceholderText(/add issue/i)[0]
    fireEvent.change(input, { target: { value: 'New subtask' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'addIssue',
      featureId: 'my-feature',
      title: 'New subtask'
    })
  })

  it('an empty submission posts nothing', () => {
    setup([])
    const input = screen.getAllByPlaceholderText(/add issue/i)[0]
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPostMessage).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Delete routes through the undo-toast flow
// ---------------------------------------------------------------------------

describe('MiniIssueBoard — delete', () => {
  it('the delete button calls the delete handler instead of posting deleteIssue directly', () => {
    const onDeleteIssue = vi.fn()
    setup([makeIssue({ id: '001-a', title: 'Set up database' })], 'my-feature', onDeleteIssue)
    const row = screen.getByText('Set up database').closest('div')!
    fireEvent.click(row.querySelector('button[title="Delete issue"]')!)
    expect(onDeleteIssue).toHaveBeenCalledWith('my-feature', '001-a')
    expect(mockPostMessage).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Click opens the issue
// ---------------------------------------------------------------------------

describe('MiniIssueBoard — open issue', () => {
  it('clicking an issue posts openIssue', () => {
    setup([makeIssue({ id: '001-a', title: 'Set up database' })])
    fireEvent.click(screen.getByText('Set up database'))
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'openIssue',
      featureId: 'my-feature',
      issueId: '001-a'
    })
  })
})

// ---------------------------------------------------------------------------
// Build with AI — routed through the shared plumbing, no hardcoded agent
// ---------------------------------------------------------------------------

describe('MiniIssueBoard — build with AI', () => {
  it('the wand button calls the AI handler with the issue id only', () => {
    const onStartWithAI = vi.fn()
    setup([makeIssue({ id: '001-a', title: 'Set up database' })], 'my-feature', undefined, onStartWithAI)
    const row = screen.getByText('Set up database').closest('div')!
    const wand = row.querySelector('button[title="Build this issue with AI"]')!
    fireEvent.click(wand)
    expect(onStartWithAI).toHaveBeenCalledWith('001-a')
    expect(mockPostMessage).not.toHaveBeenCalled()
  })
})

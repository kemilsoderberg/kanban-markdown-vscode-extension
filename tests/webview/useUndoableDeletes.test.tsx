// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoableDeletes } from '../../src/webview/lib/useUndoableDeletes'
import { useStore } from '../../src/webview/store'
import type { Feature, Issue } from '../../src/shared/types'

const { mockPostMessage } = vi.hoisted(() => ({ mockPostMessage: vi.fn() }))
vi.mock('../../src/webview/vscodeApi', () => ({
  vscode: { postMessage: mockPostMessage }
}))

const initialState = useStore.getState()

beforeEach(() => {
  useStore.setState(initialState, true)
  mockPostMessage.mockClear()
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
    filePath: '/workspace/features/f1/spec.md',
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
    filePath: '/workspace/features/f1/issues/001-setup-db.md',
    ...overrides
  }
}

describe('useUndoableDeletes — issue delete is deferred', () => {
  it('deleteIssue removes the issue locally without posting deleteIssue to the extension', () => {
    useStore.getState().setFeatures([makeFeature({ issues: [makeIssue()] })])
    const { result } = renderHook(() => useUndoableDeletes())

    act(() => {
      result.current.deleteIssue('f1', '001-setup-db')
    })

    // Local state: issue gone
    const feature = useStore.getState().features.find(f => f.id === 'f1')!
    expect(feature.issues).toHaveLength(0)
    // Deferred: nothing sent to the extension yet
    expect(mockPostMessage).not.toHaveBeenCalled()
    // A pending entry exists for the undo toast
    expect(result.current.pendingDeletes).toHaveLength(1)
    expect(result.current.pendingDeletes[0].issue?.id).toBe('001-setup-db')
  })

  it('commitDelete posts deleteIssue to the extension when the toast expires', () => {
    useStore.getState().setFeatures([makeFeature({ issues: [makeIssue()] })])
    const { result } = renderHook(() => useUndoableDeletes())

    act(() => {
      result.current.deleteIssue('f1', '001-setup-db')
    })
    const entryId = result.current.pendingDeletes[0].id
    act(() => {
      result.current.commitDelete(entryId)
    })

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'deleteIssue',
      featureId: 'f1',
      issueId: '001-setup-db'
    })
    expect(result.current.pendingDeletes).toHaveLength(0)
  })

  it('undoDelete restores the deleted issue to the store without touching disk', () => {
    useStore.getState().setFeatures([makeFeature({ issues: [makeIssue()] })])
    const { result } = renderHook(() => useUndoableDeletes())

    act(() => {
      result.current.deleteIssue('f1', '001-setup-db')
    })
    const entryId = result.current.pendingDeletes[0].id
    act(() => {
      result.current.undoDelete(entryId)
    })

    const feature = useStore.getState().features.find(f => f.id === 'f1')!
    expect(feature.issues![0].id).toBe('001-setup-db')
    expect(mockPostMessage).not.toHaveBeenCalled()
    expect(result.current.pendingDeletes).toHaveLength(0)
  })
})

describe('useUndoableDeletes — feature delete', () => {
  it('deleteFeature defers and commitDelete posts deleteFeature', () => {
    useStore.getState().setFeatures([makeFeature()])
    const { result } = renderHook(() => useUndoableDeletes())

    act(() => {
      result.current.deleteFeature('f1')
    })
    expect(useStore.getState().features).toHaveLength(0)
    expect(mockPostMessage).not.toHaveBeenCalled()

    const entryId = result.current.pendingDeletes[0].id
    act(() => {
      result.current.commitDelete(entryId)
    })
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'deleteFeature', featureId: 'f1' })
  })

  it('undoDelete restores the feature', () => {
    useStore.getState().setFeatures([makeFeature()])
    const { result } = renderHook(() => useUndoableDeletes())

    act(() => {
      result.current.deleteFeature('f1')
    })
    const entryId = result.current.pendingDeletes[0].id
    act(() => {
      result.current.undoDelete(entryId)
    })
    expect(useStore.getState().features.map(f => f.id)).toEqual(['f1'])
    expect(mockPostMessage).not.toHaveBeenCalled()
  })
})

describe('useUndoableDeletes — undoLatest', () => {
  it('undoes the most recent delete only', () => {
    useStore.getState().setFeatures([
      makeFeature({ id: 'f1', issues: [makeIssue()] }),
      makeFeature({ id: 'f2' })
    ])
    const { result } = renderHook(() => useUndoableDeletes())

    act(() => {
      result.current.deleteFeature('f1')
      result.current.deleteFeature('f2')
    })

    act(() => {
      result.current.undoLatest()
    })

    // Only the last delete (f2) is undone; f1 stays deleted
    expect(useStore.getState().features.map(f => f.id)).toEqual(['f2'])
    expect(result.current.pendingDeletes).toHaveLength(1)
  })
})

import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { vscode } from '../vscodeApi'
import type { Feature, Issue } from '../../shared/types'

/**
 * The undo-delete stack shared by every delete entry point (board cards,
 * the feature editor, the issue editor and the mini-board). Deletes are
 * deferred: the item disappears from the store immediately and the
 * extension is only told to delete the file when the undo toast expires.
 */
export function useUndoableDeletes(onFeatureDeleted?: (featureId: string) => void) {
  const [pendingDeletes, setPendingDeletes] = useState<{ id: string; feature: Feature; issue?: Issue }[]>([])
  const pendingDeletesRef = useRef(pendingDeletes)
  useEffect(() => {
    pendingDeletesRef.current = pendingDeletes
  }, [pendingDeletes])

  const nextIdRef = useRef(0)

  const deleteFeature = useCallback((featureId: string) => {
    const { features, setFeatures } = useStore.getState()
    const feature = features.find(f => f.id === featureId)
    if (!feature) return

    // Optimistically remove from local state
    setFeatures(features.filter(f => f.id !== featureId))

    if (onFeatureDeleted) onFeatureDeleted(featureId)

    const id = String(nextIdRef.current++)
    setPendingDeletes(prev => [...prev, { id, feature }])
  }, [onFeatureDeleted])

  const deleteIssue = useCallback((featureId: string, issueId: string) => {
    const { features, removeIssue } = useStore.getState()
    const feature = features.find(f => f.id === featureId)
    const issue = feature?.issues?.find(i => i.id === issueId)
    if (!issue) return

    // Optimistically remove from local state
    removeIssue(featureId, issueId)

    // Defer the actual deletion until the undo toast expires
    const id = String(nextIdRef.current++)
    setPendingDeletes(prev => [...prev, { id, feature: feature!, issue }])
  }, [])

  const commitDelete = useCallback((entryId: string) => {
    const entry = pendingDeletesRef.current.find(d => d.id === entryId)
    if (!entry) return
    if (entry.issue) {
      vscode.postMessage({ type: 'deleteIssue', featureId: entry.feature.id, issueId: entry.issue.id })
    } else {
      vscode.postMessage({ type: 'deleteFeature', featureId: entry.feature.id })
    }
    setPendingDeletes(prev => prev.filter(d => d.id !== entryId))
  }, [])

  const undoDelete = useCallback((entryId: string) => {
    const entry = pendingDeletesRef.current.find(d => d.id === entryId)
    if (!entry) return
    if (entry.issue) {
      useStore.getState().addIssue(entry.feature.id, entry.issue)
    } else {
      const { features, setFeatures } = useStore.getState()
      setFeatures([...features, entry.feature])
    }
    setPendingDeletes(prev => prev.filter(d => d.id !== entryId))
  }, [])

  const undoLatest = useCallback(() => {
    const stack = pendingDeletesRef.current
    if (stack.length === 0) return
    undoDelete(stack[stack.length - 1].id)
  }, [undoDelete])

  /** Stable check for pending entries, safe to call from event handlers. */
  const hasPendingDeletes = useCallback(() => pendingDeletesRef.current.length > 0, [])

  return { pendingDeletes, deleteFeature, deleteIssue, commitDelete, undoDelete, undoLatest, hasPendingDeletes }
}

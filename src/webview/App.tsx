import { useEffect, useState, useRef, useCallback } from 'react'
import { generateKeyBetween } from 'fractional-indexing'
import { useStore } from './store'
import { KanbanBoard } from './components/KanbanBoard'
import { KanbanEpicBoard } from './components/KanbanEpicBoard'
import { CreateFeatureDialog } from './components/CreateFeatureDialog'
import { FeatureEditor } from './components/FeatureEditor'
import { Toolbar } from './components/Toolbar'
import { UndoToast } from './components/UndoToast'
import type { Feature, FeatureStatus, Priority, ExtensionMessage, FeatureFrontmatter, IssueFrontmatter, AIAgent, AIPermissionMode, BoardViewMode } from '../shared/types'
import { getTitleFromContent } from '../shared/types'
import { vscode } from './vscodeApi'
import { initLocale, t } from './lib/i18n'
import { useUndoableDeletes } from './lib/useUndoableDeletes'

function App(): React.JSX.Element {

  const {
    columns,
    cardSettings,
    setFeatures,
    setColumns,
    setIsDarkMode,
    setCardSettings,
    setCollapsedColumns,
    setCollapsedEpics,
    boardViewMode,
    setBoardViewMode,
    setLocale
  } = useStore()

  const [createFeatureOpen, setCreateFeatureOpen] = useState(false)
  const [createFeatureStatus, setCreateFeatureStatus] = useState<FeatureStatus>('backlog')

  // Editor state
  const contentVersionRef = useRef(0)
  const [editingFeature, setEditingFeature] = useState<{
    id: string
    content: string
    frontmatter: FeatureFrontmatter
    contentVersion: number
  } | null>(null)
  const editingFeatureRef = useRef(editingFeature)
  useEffect(() => {
    editingFeatureRef.current = editingFeature
  }, [editingFeature])

  // Issue editor state (shares the FeatureEditor pane)
  const [editingIssue, setEditingIssue] = useState<{
    featureId: string
    issueId: string
    content: string
    frontmatter: IssueFrontmatter
    contentVersion: number
  } | null>(null)

  // Undo delete stack (features and issues): deletes are deferred until the
  // undo toast expires, so every entry point routes through this hook.
  const { pendingDeletes, deleteFeature, deleteIssue, commitDelete, undoDelete, undoLatest, hasPendingDeletes } =
    useUndoableDeletes((featureId) => {
      // Close the editor if the deleted feature is open
      if (editingFeatureRef.current?.id === featureId) {
        setEditingFeature(null)
      }
    })

  const handleDeleteFeatureFromCard = useCallback((featureId: string) => {
    deleteFeature(featureId)
  }, [deleteFeature])

  const handleDeleteIssueFromList = useCallback((featureId: string, issueId: string) => {
    deleteIssue(featureId, issueId)
  }, [deleteIssue])

  // Keyboard shortcuts
  useEffect(() => {
    let altPressedAlone = false
    let altDownTimer: ReturnType<typeof setTimeout> | null = null

    const handleKeyDown = (e: KeyboardEvent) => {
      // Track bare ALT press to forward to VS Code menu bar
      if (e.key === 'Alt') {
        altPressedAlone = true
        // If ALT is held >1s it's likely a modifier hold or window drag, not a menu toggle
        if (altDownTimer) clearTimeout(altDownTimer)
        altDownTimer = setTimeout(() => { altPressedAlone = false }, 1000)
        return
      }
      if (e.altKey) {
        altPressedAlone = false
        if (altDownTimer) { clearTimeout(altDownTimer); altDownTimer = null }
      }

      // Ctrl/Cmd+Z to undo delete (works even in inputs)
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && hasPendingDeletes()) {
        e.preventDefault()
        undoLatest()
        return
      }

      // Ignore if user is typing in an input or contentEditable (e.g. TipTap editor)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }

      switch (e.key) {
        case 'n':
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
            return
          }
          e.preventDefault()
          setCreateFeatureStatus('backlog')
          setCreateFeatureOpen(true)
          break
        case 'Escape':
          if (createFeatureOpen) {
            setCreateFeatureOpen(false)
          }
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && altPressedAlone) {
        altPressedAlone = false
        if (altDownTimer) { clearTimeout(altDownTimer); altDownTimer = null }
        vscode.postMessage({ type: 'focusMenuBar' })
      }
    }

    // Cancel ALT-alone if mouse is clicked while ALT is held (e.g. ALT+click window drag on Linux)
    const handleMouseDown = () => { altPressedAlone = false }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousedown', handleMouseDown)
      if (altDownTimer) clearTimeout(altDownTimer)
    }
  }, [createFeatureOpen, undoLatest, hasPendingDeletes])

  // Listen for VSCode theme changes
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.body.classList.contains('vscode-dark') ||
                     document.body.classList.contains('vscode-high-contrast')
      setIsDarkMode(isDark)
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    updateTheme()

    // Watch for class changes on body
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [setIsDarkMode])

  // Toggle scrollbar visibility based on user setting
  useEffect(() => {
    document.documentElement.classList.toggle('hide-scrollbar', cardSettings.hideScrollbar)
  }, [cardSettings.hideScrollbar])

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data
      if (!message || typeof message.type !== 'string') return

      switch (message.type) {
        case 'init':
          if (message.translations) {
            initLocale(message.translations)
          }
          if (message.locale) {
            setLocale(message.locale)
          }
          setFeatures(message.features)
          setColumns(message.columns)
          setCollapsedColumns(message.collapsedColumns ?? [])
          setCollapsedEpics(message.collapsedEpics ?? [])
          setBoardViewMode((message.boardViewMode ?? 'standard') as BoardViewMode)
          if (message.settings) {
            if (message.settings.markdownEditorMode && editingFeatureRef.current) {
              setEditingFeature(null)
            }
            setCardSettings(message.settings)
          }
          break
        case 'featuresUpdated':
          setFeatures(message.features)
          break
        case 'triggerCreateDialog':
          setCreateFeatureStatus('backlog')
          setCreateFeatureOpen(true)
          break
        case 'featureContent': {
          const { cardSettings } = useStore.getState()
          if (cardSettings.markdownEditorMode) break
          contentVersionRef.current += 1
          setEditingIssue(null)
          setEditingFeature({
            id: message.featureId,
            content: message.content,
            frontmatter: message.frontmatter,
            contentVersion: contentVersionRef.current
          })
          break
        }
        case 'issueContent': {
          const { cardSettings } = useStore.getState()
          if (cardSettings.markdownEditorMode) break
          contentVersionRef.current += 1
          setEditingFeature(null)
          setEditingIssue({
            featureId: message.featureId,
            issueId: message.issueId,
            content: message.content,
            frontmatter: message.frontmatter,
            contentVersion: contentVersionRef.current
          })
          break
        }
      }
    }

    window.addEventListener('message', handleMessage)

    // Tell extension we're ready
    vscode.postMessage({ type: 'ready' })

    return () => window.removeEventListener('message', handleMessage)
  }, [setFeatures, setColumns, setCardSettings, setCollapsedColumns, setCollapsedEpics, setBoardViewMode, setLocale])

  const handleFeatureClick = (feature: Feature): void => {
    // Request feature content for inline editing
    vscode.postMessage({
      type: 'openFeature',
      featureId: feature.id
    })
  }

  const handleSaveFeature = (content: string, frontmatter: FeatureFrontmatter): void => {
    if (!editingFeature) return
    vscode.postMessage({
      type: 'saveFeatureContent',
      featureId: editingFeature.id,
      content,
      frontmatter
    })
  }

  const handleCloseEditor = (): void => {
    setEditingFeature(null)
    vscode.postMessage({ type: 'closeFeature' })
  }

  const handleDeleteFeature = (): void => {
    if (!editingFeature) return
    handleDeleteFeatureFromCard(editingFeature.id)
  }

  const handleOpenFile = (): void => {
    if (!editingFeature) return
    vscode.postMessage({ type: 'openFile', featureId: editingFeature.id })
  }

  const handleDeleteIssueFromEditor = (featureId: string, issueId: string): void => {
    handleDeleteIssueFromList(featureId, issueId)
    if (editingIssue?.issueId === issueId) {
      setEditingIssue(null)
      vscode.postMessage({ type: 'closeIssue' })
    }
  }

  const handleCloseIssueEditor = (): void => {
    setEditingIssue(null)
    vscode.postMessage({ type: 'closeIssue' })
  }

  const handleStartWithAI = (issueId: string | null, agent?: AIAgent, permissionMode?: AIPermissionMode): void => {
    if (issueId !== null && editingIssue) {
      vscode.postMessage({ type: 'startIssueWithAI', featureId: editingIssue.featureId, issueId, agent, permissionMode })
      return
    }
    if (issueId !== null && editingFeature) {
      vscode.postMessage({ type: 'startIssueWithAI', featureId: editingFeature.id, issueId, agent, permissionMode })
      return
    }
    vscode.postMessage({ type: 'startWithAI', agent, permissionMode })
  }

  const handleAddFeatureInColumn = (status: string): void => {
    setCreateFeatureStatus(status as FeatureStatus)
    setCreateFeatureOpen(true)
  }

  const handleCreateFeature = (data: {
    status: FeatureStatus
    priority: Priority
    content: string
    assignee: string | null
    epic: string | null
    dueDate: string | null
    labels: string[]
  }): void => {
    vscode.postMessage({
      type: 'createFeature',
      data
    })
  }

  const handleMoveFeature = (
    featureId: string,
    newStatus: string,
    newOrder: number
  ): void => {
    // Optimistic update: compute fractional index locally before server confirms
    const { features } = useStore.getState()
    const feature = features.find(f => f.id === featureId)
    if (feature) {
      // Get sorted target column features (excluding the moved feature)
      const targetColumn = features
        .filter(f => f.status === newStatus && f.id !== featureId)
        .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))

      const clampedOrder = Math.max(0, Math.min(newOrder, targetColumn.length))
      const before = clampedOrder > 0 ? targetColumn[clampedOrder - 1].order : null
      const after = clampedOrder < targetColumn.length ? targetColumn[clampedOrder].order : null
      const newOrderKey = generateKeyBetween(before, after)

      const updated = features.map(f =>
        f.id === featureId
          ? { ...f, status: newStatus as FeatureStatus, order: newOrderKey }
          : f
      )
      setFeatures(updated)
    }

    // Tell extension to persist
    vscode.postMessage({
      type: 'moveFeature',
      featureId,
      newStatus,
      newOrder
    })
  }

  // Show loading if no columns yet
  if (columns.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--vscode-editor-background)]">
        <div className="text-[var(--vscode-foreground)] opacity-60">{t('app.loading')}</div>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-[var(--vscode-editor-background)]">
      <Toolbar
        onOpenSettings={() => vscode.postMessage({ type: 'openSettings' })}
        boardViewMode={boardViewMode}
        onBoardViewModeChange={(mode) => {
          setBoardViewMode(mode)
          vscode.postMessage({ type: 'setBoardViewMode', mode })
        }}
      />
      <div className="flex-1 flex overflow-hidden">
        <div className={editingFeature ? 'w-1/2' : 'w-full'}>
          {boardViewMode === 'epic' ? (
            <KanbanEpicBoard
              onFeatureClick={handleFeatureClick}
              onAddFeature={handleAddFeatureInColumn}
              onMoveFeature={handleMoveFeature}
            />
          ) : (
            <KanbanBoard
              onFeatureClick={handleFeatureClick}
              onAddFeature={handleAddFeatureInColumn}
              onMoveFeature={handleMoveFeature}
            />
          )}
        </div>
        {editingFeature && !editingIssue && (
          <div className="w-1/2">
            <FeatureEditor
              featureId={editingFeature.id}
              content={editingFeature.content}
              frontmatter={editingFeature.frontmatter}
              issueFrontmatter={null}
              contentVersion={editingFeature.contentVersion}
              onSave={handleSaveFeature}
              onClose={handleCloseEditor}
              onDelete={handleDeleteFeature}
              onDeleteIssue={handleDeleteIssueFromEditor}
              onOpenFile={handleOpenFile}
              onStartWithAI={handleStartWithAI}
            />
          </div>
        )}
        {editingIssue && (
          <div className="w-1/2">
            <FeatureEditor
              featureId={editingIssue.featureId}
              content={editingIssue.content}
              frontmatter={{
                id: editingIssue.frontmatter.id,
                status: 'todo',
                priority: 'medium',
                assignee: null,
                epic: null,
                dueDate: null,
                created: editingIssue.frontmatter.created,
                modified: editingIssue.frontmatter.modified,
                completedAt: null,
                labels: [],
                order: 'a0'
              }}
              issueFrontmatter={editingIssue.frontmatter}
              contentVersion={editingIssue.contentVersion}
              onSave={handleSaveFeature}
              onClose={handleCloseIssueEditor}
              onDelete={() => handleDeleteIssueFromEditor(editingIssue.featureId, editingIssue.issueId)}
              onDeleteIssue={handleDeleteIssueFromEditor}
              onOpenFile={handleOpenFile}
              onStartWithAI={handleStartWithAI}
            />
          </div>
        )}
      </div>

      <CreateFeatureDialog
        isOpen={createFeatureOpen}
        onClose={() => setCreateFeatureOpen(false)}
        onCreate={handleCreateFeature}
        initialStatus={createFeatureStatus}
      />

      {pendingDeletes.map((entry, i) => (
        <UndoToast
          key={entry.id}
          message={t('app.deleted', { title: entry.issue ? entry.issue.title : getTitleFromContent(entry.feature.content) })}
          onUndo={() => undoDelete(entry.id)}
          onExpire={() => commitDelete(entry.id)}
          duration={5000}
          index={i}
        />
      ))}
    </div>
  )
}

export default App

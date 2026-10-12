import { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { vscode } from '../vscodeApi'
import { t } from '../lib/i18n'
import { cn } from '../lib/utils'
import type { Issue, IssueStatus } from '../../shared/types'

const ISSUE_COLUMNS: { id: IssueStatus; nameKey: string }[] = [
  { id: 'todo', nameKey: 'status.todo' },
  { id: 'doing', nameKey: 'issue.status.doing' },
  { id: 'done', nameKey: 'status.done' }
]

const ISSUE_COLUMN_DOTS: Record<IssueStatus, string> = {
  todo: 'bg-blue-400',
  doing: 'bg-amber-400',
  done: 'bg-emerald-400'
}

interface MiniIssueBoardProps {
  featureId: string
}

export function MiniIssueBoard({ featureId }: MiniIssueBoardProps) {
  const features = useStore((s) => s.features)
  const getIssuesByStatus = useStore((s) => s.getIssuesByStatus)
  const [draggedIssueId, setDraggedIssueId] = useState<string | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, issue: Issue) => {
    setDraggedIssueId(issue.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', issue.id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, status: IssueStatus) => {
      e.preventDefault()
      const issueId = e.dataTransfer.getData('text/plain') || draggedIssueId
      setDraggedIssueId(null)
      if (!issueId) return
      const issue = features
        .find((f) => f.id === featureId)
        ?.issues?.find((i) => i.id === issueId)
      if (!issue || issue.status === status) return
      useStore.getState().moveIssue(featureId, issueId, status)
      vscode.postMessage({
        type: 'moveIssue',
        featureId,
        issueId,
        newStatus: status
      })
    },
    [draggedIssueId, features, featureId]
  )

  return (
    <div className="grid grid-cols-3 gap-2">
      {ISSUE_COLUMNS.map((column) => {
        const issues = getIssuesByStatus(featureId, column.id)
        return (
          <div
            key={column.id}
            data-testid={`mini-column-${column.id}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
            className="flex flex-col bg-zinc-100 dark:bg-zinc-800/50 rounded-lg p-1.5 gap-1"
          >
            <div className="flex items-center gap-1.5 px-1">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', ISSUE_COLUMN_DOTS[column.id])} />
              <span
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: 'var(--vscode-descriptionForeground)' }}
              >
                {t(column.nameKey)}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--vscode-descriptionForeground)' }}>
                {issues.length}
              </span>
            </div>
            {issues.map((issue) => (
              <div
                key={issue.id}
                draggable
                onDragStart={(e) => handleDragStart(e, issue)}
                className={cn(
                  'group/mini-issue flex items-center gap-1 text-xs rounded px-1.5 py-1 vscode-hover-bg transition-colors cursor-pointer',
                  draggedIssueId === issue.id && 'opacity-40'
                )}
                title={issue.title}
              >
                <button
                  onClick={() =>
                    vscode.postMessage({ type: 'openIssue', featureId, issueId: issue.id })
                  }
                  className="flex-1 min-w-0 text-left truncate"
                  style={{ color: 'var(--vscode-foreground)' }}
                >
                  <span className={cn(issue.status === 'done' && 'line-through opacity-60')}>
                    {issue.title}
                  </span>
                </button>
                <button
                  onClick={() =>
                    vscode.postMessage({ type: 'deleteIssue', featureId, issueId: issue.id })
                  }
                  title={t('editor.deleteIssue')}
                  aria-label={t('editor.deleteIssue')}
                  className="opacity-0 group-hover/mini-issue:opacity-100 shrink-0 transition-opacity cursor-pointer"
                  style={{ color: 'var(--vscode-descriptionForeground)' }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <input
              type="text"
              placeholder={t('editor.addIssue')}
              aria-label={t('editor.addIssue')}
              className="w-full text-xs bg-transparent border-none outline-none py-0.5 px-1 mt-auto"
              style={{ color: 'var(--vscode-foreground)' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = (e.target as HTMLInputElement).value.trim()
                  if (!value) return
                  vscode.postMessage({ type: 'addIssue', featureId, title: value })
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

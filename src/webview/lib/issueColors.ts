import type { IssueStatus } from '../../shared/types'

/**
 * The dot color for each issue status, shared by the feature card's issue
 * list, the editor's issue dropdown and the mini-board columns.
 */
export const ISSUE_STATUS_DOTS: Record<IssueStatus, string> = {
  todo: 'bg-blue-400',
  doing: 'bg-amber-400',
  done: 'bg-emerald-400'
}

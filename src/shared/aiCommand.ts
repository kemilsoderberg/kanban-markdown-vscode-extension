import type { AIAgent, AIPermissionMode } from './types'

export const AGENT_NAMES: Record<AIAgent, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  copilot: 'GitHub Copilot',
  opencode: 'OpenCode'
}

/**
 * The CLI arguments for one agent dispatch: the permission-mode plumbing,
 * unchanged from the original inline switch, followed by the prompt.
 */
export function buildAgentCommand(
  agent: AIAgent,
  permissionMode: AIPermissionMode,
  prompt: string
): string[] {
  switch (agent) {
    case 'claude': {
      const args: string[] = []
      if (permissionMode !== 'default') {
        args.push('--permission-mode', permissionMode)
      }
      args.push(prompt)
      return args
    }
    case 'codex': {
      const approvalMap: Record<string, string> = {
        'default': 'ask',
        'plan': 'ask',
        'acceptEdits': 'auto',
        'bypassPermissions': 'full-auto'
      }
      const approvalMode = approvalMap[permissionMode] || 'suggest'
      return ['--ask-for-approval', approvalMode, prompt]
    }
    case 'copilot':
    case 'opencode':
      return [prompt]
    default:
      return [prompt]
  }
}

/** POSIX single-quote shell escaping, shared by both dispatch sites. */
export function shellQuote(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

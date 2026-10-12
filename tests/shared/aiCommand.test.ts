import { describe, it, expect, vi } from 'vitest'

vi.mock('vscode', () => ({}))

import { buildAgentCommand, AGENT_NAMES } from '../../src/shared/aiCommand'

describe('buildAgentCommand', () => {
  it('claude default sends only the prompt', () => {
    expect(buildAgentCommand('claude', 'default', 'PROMPT')).toEqual(['PROMPT'])
  })

  it('claude non-default passes --permission-mode before the prompt', () => {
    expect(buildAgentCommand('claude', 'plan', 'PROMPT')).toEqual(['--permission-mode', 'plan', 'PROMPT'])
  })

  it('codex maps permission modes to approval modes', () => {
    expect(buildAgentCommand('codex', 'default', 'PROMPT')).toEqual(['--ask-for-approval', 'ask', 'PROMPT'])
    expect(buildAgentCommand('codex', 'plan', 'PROMPT')).toEqual(['--ask-for-approval', 'ask', 'PROMPT'])
    expect(buildAgentCommand('codex', 'acceptEdits', 'PROMPT')).toEqual(['--ask-for-approval', 'auto', 'PROMPT'])
    expect(buildAgentCommand('codex', 'bypassPermissions', 'PROMPT')).toEqual(['--ask-for-approval', 'full-auto', 'PROMPT'])
  })

  it('copilot and opencode send only the prompt', () => {
    expect(buildAgentCommand('copilot', 'plan', 'PROMPT')).toEqual(['PROMPT'])
    expect(buildAgentCommand('opencode', 'bypassPermissions', 'PROMPT')).toEqual(['PROMPT'])
  })
})

describe('AGENT_NAMES', () => {
  it('maps each agent to its terminal display name', () => {
    expect(AGENT_NAMES).toEqual({
      claude: 'Claude Code',
      codex: 'Codex',
      copilot: 'GitHub Copilot',
      opencode: 'OpenCode'
    })
  })
})

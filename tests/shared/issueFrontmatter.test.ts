import { describe, it, expect } from 'vitest'
import { parseIssueFile, serializeIssue } from '../../src/shared/featureFrontmatter'
import type { Issue } from '../../src/shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: '001-setup-db',
    status: 'todo',
    created: '2026-02-23T10:00:00.000Z',
    modified: '2026-02-23T10:00:00.000Z',
    title: 'Set up database',
    content: '# Set up database\n\nDetails here.',
    filePath: '/workspace/features/my-feature/issues/001-setup-db.md',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe('parseIssueFile', () => {
  it('parses a well-formed issue file', () => {
    const content = [
      '---',
      'id: "001-setup-db"',
      'status: "todo"',
      'created: "2026-02-23T10:00:00.000Z"',
      'modified: "2026-02-23T11:00:00.000Z"',
      '---',
      '# Set up database',
      '',
      'Details here.'
    ].join('\n')
    const issue = parseIssueFile(content, '/workspace/features/my-feature/issues/001-setup-db.md')
    expect(issue).not.toBeNull()
    expect(issue!.id).toBe('001-setup-db')
    expect(issue!.status).toBe('todo')
    expect(issue!.created).toBe('2026-02-23T10:00:00.000Z')
    expect(issue!.modified).toBe('2026-02-23T11:00:00.000Z')
    expect(issue!.title).toBe('Set up database')
    expect(issue!.content).toBe('# Set up database\n\nDetails here.')
    expect(issue!.filePath).toBe('/workspace/features/my-feature/issues/001-setup-db.md')
  })

  it('returns null when there is no frontmatter', () => {
    expect(parseIssueFile('# Just a heading\n', '/x/001-a.md')).toBeNull()
  })

  it('normalizes CRLF line endings', () => {
    const content = '---\r\nid: "001-a"\r\nstatus: "doing"\r\ncreated: "2026-02-23T10:00:00.000Z"\r\nmodified: "2026-02-23T10:00:00.000Z"\r\n---\r\n# A\r\n'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue).not.toBeNull()
    expect(issue!.status).toBe('doing')
    expect(issue!.content).toBe('# A')
  })

  it('falls back the id to the filename base', () => {
    const content = '---\nstatus: "todo"\ncreated: "2026-02-23T10:00:00.000Z"\nmodified: "2026-02-23T10:00:00.000Z"\n---\n# A\n'
    const issue = parseIssueFile(content, '/x/issues/002-write-tests.md')
    expect(issue!.id).toBe('002-write-tests')
  })

  it('defaults status to todo when missing', () => {
    const content = '---\nid: "001-a"\ncreated: "2026-02-23T10:00:00.000Z"\nmodified: "2026-02-23T10:00:00.000Z"\n---\n# A\n'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue!.status).toBe('todo')
  })

  it('accepts the doing status', () => {
    const content = '---\nid: "001-a"\nstatus: "doing"\ncreated: "2026-02-23T10:00:00.000Z"\nmodified: "2026-02-23T10:00:00.000Z"\n---\n# A\n'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue!.status).toBe('doing')
  })

  it('accepts the done status', () => {
    const content = '---\nid: "001-a"\nstatus: "done"\ncreated: "2026-02-23T10:00:00.000Z"\nmodified: "2026-02-23T10:00:00.000Z"\n---\n# A\n'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue!.status).toBe('done')
  })

  it('defaults created and modified to now when missing', () => {
    const before = new Date().toISOString()
    const content = '---\nid: "001-a"\nstatus: "todo"\n---\n# A\n'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue!.created >= before).toBe(true)
    expect(issue!.modified >= before).toBe(true)
  })

  it('parses the title from the first # heading in the body', () => {
    const content = '---\nid: "001-a"\nstatus: "todo"\n---\nIntro line\n\n# The Real Title\n\nmore'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue!.title).toBe('The Real Title')
  })

  it('falls back to the first non-empty line for the title when there is no # heading', () => {
    const content = '---\nid: "001-a"\nstatus: "todo"\n---\n\nA plain first line\n'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue!.title).toBe('A plain first line')
  })

  it('trims the body content', () => {
    const content = '---\nid: "001-a"\nstatus: "todo"\n---\n\n# A\n\nbody\n\n'
    const issue = parseIssueFile(content, '/x/001-a.md')
    expect(issue!.content).toBe('# A\n\nbody')
  })
})

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe('serializeIssue', () => {
  it('writes the minimal frontmatter in fixed order followed by content', () => {
    const out = serializeIssue(makeIssue())
    const lines = out.split('\n')
    expect(lines[0]).toBe('---')
    expect(lines[1]).toBe('id: "001-setup-db"')
    expect(lines[2]).toBe('status: "todo"')
    expect(lines[3]).toBe('created: "2026-02-23T10:00:00.000Z"')
    expect(lines[4]).toBe('modified: "2026-02-23T10:00:00.000Z"')
    expect(lines[5]).toBe('---')
    expect(out.endsWith('# Set up database\n\nDetails here.')).toBe(true)
  })

  it('quotes the id and status values', () => {
    const out = serializeIssue(makeIssue({ id: '002-write-tests', status: 'doing' }))
    expect(out).toContain('id: "002-write-tests"')
    expect(out).toContain('status: "doing"')
  })
})

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('issue round-trip', () => {
  it('serialize → parse recovers the original issue', () => {
    const original = makeIssue({ status: 'doing', content: '# Set up database\n\nNew body.' })
    const roundTripped = parseIssueFile(serializeIssue(original), original.filePath)
    expect(roundTripped).toEqual(original)
  })

  it('round-trips the done status', () => {
    const original = makeIssue({ status: 'done' })
    const roundTripped = parseIssueFile(serializeIssue(original), original.filePath)
    expect(roundTripped!.status).toBe('done')
  })

  it('round-trips a multi-line body', () => {
    const original = makeIssue({ title: 'Title', content: '# Title\n\n- one\n- two\n\n```sql\nSELECT 1\n```' })
    const roundTripped = parseIssueFile(serializeIssue(original), original.filePath)
    expect(roundTripped!.content).toBe(original.content)
    expect(roundTripped!.title).toBe(original.title)
  })
})

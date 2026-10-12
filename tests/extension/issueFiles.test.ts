import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import type { FsAdapter } from '../../src/extension/featureFileUtils'

// ---------------------------------------------------------------------------
// vscode stub — only Uri.file is needed by featureFileUtils
// ---------------------------------------------------------------------------

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` })
  }
}))

import {
  getIssueFilePath,
  listIssueFiles,
  getNextIssueNumber
} from '../../src/extension/featureFileUtils'

// ---------------------------------------------------------------------------
// In-memory FsAdapter factory
// ---------------------------------------------------------------------------

const FEATURES_DIR = '/workspace/.devtool/features'
const FEATURE_DIR = path.join(FEATURES_DIR, 'my-feature')
const ISSUES_DIR = path.join(FEATURE_DIR, 'issues')

function makeReadFs(dirs: Record<string, [string, number][]>): FsAdapter & {
  readDirectory: ReturnType<typeof vi.fn>
  rename: ReturnType<typeof vi.fn>
  createDirectory: ReturnType<typeof vi.fn>
} {
  return {
    stat: vi.fn((uri: { fsPath: string }) => {
      if (dirs[uri.fsPath]) return Promise.resolve({ type: 2 } as never)
      return Promise.reject(new Error('ENOENT'))
    }),
    rename: vi.fn(() => Promise.resolve()),
    createDirectory: vi.fn(() => Promise.resolve()),
    readDirectory: vi.fn(async (uri: { fsPath: string }) => {
      const entry = dirs[uri.fsPath]
      if (!entry) throw new Error('ENOENT')
      return entry
    })
  }
}

// ---------------------------------------------------------------------------
// getIssueFilePath
// ---------------------------------------------------------------------------

describe('getIssueFilePath', () => {
  it('joins the feature directory, issues/ and the issue filename', () => {
    expect(getIssueFilePath(FEATURE_DIR, '001-setup-db')).toBe(
      path.join(ISSUES_DIR, '001-setup-db.md')
    )
  })
})

// ---------------------------------------------------------------------------
// listIssueFiles
// ---------------------------------------------------------------------------

describe('listIssueFiles', () => {
  const file = 1
  const dir = 2

  it('lists all .md files in the issues/ directory alphabetically by filename', async () => {
    const fs = makeReadFs({
      [ISSUES_DIR]: [
        ['010-second.md', file],
        ['001-first.md', file],
        ['005-middle.md', file]
      ]
    })
    const files = await listIssueFiles(FEATURE_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([
      path.join(ISSUES_DIR, '001-first.md'),
      path.join(ISSUES_DIR, '005-middle.md'),
      path.join(ISSUES_DIR, '010-second.md')
    ])
  })

  it('filters out non-markdown files and subdirectories', async () => {
    const fs = makeReadFs({
      [ISSUES_DIR]: [
        ['001-a.md', file],
        ['notes.txt', file],
        ['nested', dir]
      ]
    })
    const files = await listIssueFiles(FEATURE_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([path.join(ISSUES_DIR, '001-a.md')])
  })

  it('returns an empty list when the issues/ directory does not exist', async () => {
    const fs = makeReadFs({})
    const files = await listIssueFiles(FEATURE_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getNextIssueNumber
// ---------------------------------------------------------------------------

describe('getNextIssueNumber', () => {
  const file = 1

  it('returns 1 when the issues directory does not exist or is empty', async () => {
    const fs = makeReadFs({})
    expect(await getNextIssueNumber(FEATURE_DIR, fs)).toBe(1)

    const emptyFs = makeReadFs({ [ISSUES_DIR]: [] })
    expect(await getNextIssueNumber(FEATURE_DIR, emptyFs)).toBe(1)
  })

  it('returns 2 when only 001-*.md exists', async () => {
    const fs = makeReadFs({ [ISSUES_DIR]: [['001-setup-db.md', file]] })
    expect(await getNextIssueNumber(FEATURE_DIR, fs)).toBe(2)
  })

  it('returns 5 for existing 001..004', async () => {
    const fs = makeReadFs({
      [ISSUES_DIR]: [
        ['001-a.md', file],
        ['002-b.md', file],
        ['003-c.md', file],
        ['004-d.md', file]
      ]
    })
    expect(await getNextIssueNumber(FEATURE_DIR, fs)).toBe(5)
  })

  it('finds the next free number after a deleted middle file (no collision)', async () => {
    const fs = makeReadFs({
      [ISSUES_DIR]: [
        ['001-a.md', file],
        ['003-c.md', file]
      ]
    })
    expect(await getNextIssueNumber(FEATURE_DIR, fs)).toBe(4)
  })

  it('counts non-standard numbers so numbering never collides', async () => {
    const fs = makeReadFs({
      [ISSUES_DIR]: [
        ['001-a.md', file],
        ['007-hand-made.md', file]
      ]
    })
    expect(await getNextIssueNumber(FEATURE_DIR, fs)).toBe(8)
  })
})

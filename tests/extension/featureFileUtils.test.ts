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
  getFeatureFilePath,
  getStatusFromPath,
  fileExists,
  ensureStatusSubfolders,
  moveFeatureFile,
  getFeaturesDirectory,
  isFeatureFilePath,
  ensureFeaturesDirectory,
  listFeatureFiles,
  getUniqueFeatureFilePath,
  moveFeatureToDirectory,
  listStatusSubfolderFiles,
  toWorkspaceRelativePath,
  removeStatusSubfolderIfEmpty,
  getUniqueFeatureDirectory,
  ensureFeatureDirectory
} from '../../src/extension/featureFileUtils'

// ---------------------------------------------------------------------------
// In-memory FsAdapter factory
// ---------------------------------------------------------------------------

const FEATURES_DIR = '/workspace/.devtool/features'

/**
 * Builds a FsAdapter stub whose behaviour is controlled by the `existing`
 * set: stat resolves for paths in the set and rejects for all others.
 * rename and createDirectory are spies that always resolve.
 */
function makeFs(existing: Set<string> = new Set()): FsAdapter & {
  rename: ReturnType<typeof vi.fn>
  createDirectory: ReturnType<typeof vi.fn>
} {
  return {
    stat: vi.fn((uri: { fsPath: string }) => {
      if (existing.has(uri.fsPath)) return Promise.resolve({} as never)
      return Promise.reject(new Error('ENOENT'))
    }),
    rename: vi.fn(() => Promise.resolve()),
    createDirectory: vi.fn(() => Promise.resolve())
  }
}

// ---------------------------------------------------------------------------
// getFeatureFilePath
// ---------------------------------------------------------------------------

describe('getFeatureFilePath', () => {
  it('returns path under done/ when status is "done"', () => {
    expect(getFeatureFilePath(FEATURES_DIR, 'done', 'my-feature-2026-02-23'))
      .toBe(path.join(FEATURES_DIR, 'done', 'my-feature-2026-02-23.md'))
  })

  it('returns path at root for any non-done status', () => {
    for (const status of ['backlog', 'todo', 'in-progress', 'review']) {
      expect(getFeatureFilePath(FEATURES_DIR, status, 'my-feature'))
        .toBe(path.join(FEATURES_DIR, 'my-feature.md'))
    }
  })
})

// ---------------------------------------------------------------------------
// getStatusFromPath
// ---------------------------------------------------------------------------

describe('getStatusFromPath', () => {
  it('returns "done" for a file inside the done/ subdirectory', () => {
    const filePath = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    expect(getStatusFromPath(filePath, FEATURES_DIR)).toBe('done')
  })

  it('returns null for a file at the features root', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature.md')
    expect(getStatusFromPath(filePath, FEATURES_DIR)).toBeNull()
  })

  it('returns null for a file nested deeper than done/', () => {
    const filePath = path.join(FEATURES_DIR, 'done', 'archive', 'old.md')
    expect(getStatusFromPath(filePath, FEATURES_DIR)).toBeNull()
  })

  it('returns null for a file in a non-done subdirectory', () => {
    const filePath = path.join(FEATURES_DIR, 'review', 'my-feature.md')
    expect(getStatusFromPath(filePath, FEATURES_DIR)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fileExists
// ---------------------------------------------------------------------------

describe('fileExists', () => {
  it('returns true when stat resolves', async () => {
    const existing = path.join(FEATURES_DIR, 'present.md')
    const fs = makeFs(new Set([existing]))
    expect(await fileExists(existing, fs)).toBe(true)
  })

  it('returns false when stat rejects', async () => {
    const fs = makeFs(new Set())
    expect(await fileExists(path.join(FEATURES_DIR, 'absent.md'), fs)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ensureStatusSubfolders
// ---------------------------------------------------------------------------

describe('ensureStatusSubfolders', () => {
  it('calls createDirectory with the done/ path', async () => {
    const fs = makeFs()
    await ensureStatusSubfolders(FEATURES_DIR, fs)
    expect(fs.createDirectory).toHaveBeenCalledOnce()
    const uri = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(uri.fsPath).toBe(path.join(FEATURES_DIR, 'done'))
  })
})

// ---------------------------------------------------------------------------
// moveFeatureFile
// ---------------------------------------------------------------------------

describe('moveFeatureFile', () => {
  const currentPath = path.join(FEATURES_DIR, 'my-feature.md')

  it('returns currentPath unchanged when target equals current (no-op)', async () => {
    // Moving a done file to done — currentPath is already in done/
    const donePath = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    const fs = makeFs()
    const result = await moveFeatureFile(donePath, FEATURES_DIR, 'done', fs)
    expect(result).toBe(donePath)
    expect(fs.rename).not.toHaveBeenCalled()
  })

  it('moves to root dir for non-done status', async () => {
    const fs = makeFs()
    // currentPath is already at root, so move a file from done/ back to root instead
    const fromDone = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    const result2 = await moveFeatureFile(fromDone, FEATURES_DIR, 'in-progress', fs)
    expect(result2).toBe(path.join(FEATURES_DIR, 'my-feature.md'))
    expect(fs.rename).toHaveBeenCalledOnce()
  })

  it('moves to done/ subdir when newStatus is "done"', async () => {
    const fs = makeFs()
    const result = await moveFeatureFile(currentPath, FEATURES_DIR, 'done', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'done', 'my-feature.md'))
    expect(fs.rename).toHaveBeenCalledOnce()
  })

  it('calls createDirectory on the target directory before renaming', async () => {
    const fs = makeFs()
    await moveFeatureFile(currentPath, FEATURES_DIR, 'done', fs)
    expect(fs.createDirectory).toHaveBeenCalledOnce()
    const uri = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(uri.fsPath).toBe(path.join(FEATURES_DIR, 'done'))
  })

  it('applies a -1 suffix when the target path is already taken', async () => {
    const target = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    const fs = makeFs(new Set([target]))
    const result = await moveFeatureFile(currentPath, FEATURES_DIR, 'done', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'done', 'my-feature-1.md'))
  })

  it('increments counter until a free path is found', async () => {
    const target0 = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    const target1 = path.join(FEATURES_DIR, 'done', 'my-feature-1.md')
    const target2 = path.join(FEATURES_DIR, 'done', 'my-feature-2.md')
    const fs = makeFs(new Set([target0, target1, target2]))
    const result = await moveFeatureFile(currentPath, FEATURES_DIR, 'done', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'done', 'my-feature-3.md'))
  })

  it('passes the correct source and target URIs to rename', async () => {
    const fs = makeFs()
    await moveFeatureFile(currentPath, FEATURES_DIR, 'done', fs)
    const [from, to] = (fs.rename as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(from.fsPath).toBe(currentPath)
    expect(to.fsPath).toBe(path.join(FEATURES_DIR, 'done', 'my-feature.md'))
  })

  it('is a no-op for a spec.md inside a feature directory regardless of status', async () => {
    const specPath = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    for (const status of ['backlog', 'todo', 'in-progress', 'review', 'done']) {
      const fs = makeFs()
      const result = await moveFeatureFile(specPath, FEATURES_DIR, status, fs)
      expect(result).toBe(specPath)
      expect(fs.rename).not.toHaveBeenCalled()
      expect(fs.createDirectory).not.toHaveBeenCalled()
    }
  })
})

// ---------------------------------------------------------------------------
// getUniqueFeatureDirectory
// ---------------------------------------------------------------------------

describe('getUniqueFeatureDirectory', () => {
  it('returns the slug-only directory name when no feature directory exists', async () => {
    const fs = makeFs()
    expect(await getUniqueFeatureDirectory(FEATURES_DIR, 'structure-costs', fs)).toBe('structure-costs')
  })

  it('appends -2 when the plain slug directory is taken', async () => {
    const fs = makeFs(new Set([path.join(FEATURES_DIR, 'structure-costs')]))
    expect(await getUniqueFeatureDirectory(FEATURES_DIR, 'structure-costs', fs)).toBe('structure-costs-2')
  })

  it('increments -2, -3, … without overwriting existing directories', async () => {
    const fs = makeFs(new Set([
      path.join(FEATURES_DIR, 'structure-costs'),
      path.join(FEATURES_DIR, 'structure-costs-2')
    ]))
    expect(await getUniqueFeatureDirectory(FEATURES_DIR, 'structure-costs', fs)).toBe('structure-costs-3')
  })

  it('counts a flat .md file with the same base as a collision', async () => {
    const fs = makeFs(new Set([path.join(FEATURES_DIR, 'structure-costs.md')]))
    expect(await getUniqueFeatureDirectory(FEATURES_DIR, 'structure-costs', fs)).toBe('structure-costs-2')
  })

  it('does not collide with a differently-named directory', async () => {
    const fs = makeFs(new Set([path.join(FEATURES_DIR, 'other-feature')]))
    expect(await getUniqueFeatureDirectory(FEATURES_DIR, 'structure-costs', fs)).toBe('structure-costs')
  })
})

// ---------------------------------------------------------------------------
// ensureFeatureDirectory
// ---------------------------------------------------------------------------

describe('ensureFeatureDirectory', () => {
  it('creates the feature directory and the issues/ subdirectory', async () => {
    const fs = makeFs()
    await ensureFeatureDirectory(path.join(FEATURES_DIR, 'structure-costs'), fs)
    const calls = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].fsPath)
    expect(calls).toContain(path.join(FEATURES_DIR, 'structure-costs'))
    expect(calls).toContain(path.join(FEATURES_DIR, 'structure-costs', 'issues'))
  })

  it('creates the feature directory before its issues/ subdirectory', async () => {
    const fs = makeFs()
    await ensureFeatureDirectory(path.join(FEATURES_DIR, 'structure-costs'), fs)
    const calls = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].fsPath)
    expect(calls.indexOf(path.join(FEATURES_DIR, 'structure-costs'))).toBeLessThan(
      calls.indexOf(path.join(FEATURES_DIR, 'structure-costs', 'issues'))
    )
  })

  it('makes no rename calls', async () => {
    const fs = makeFs()
    await ensureFeatureDirectory(path.join(FEATURES_DIR, 'structure-costs'), fs)
    expect(fs.rename).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getFeaturesDirectory / isFeatureFilePath
// ---------------------------------------------------------------------------

describe('getFeaturesDirectory', () => {
  it('resolves the configured relative directory against the workspace root', () => {
    expect(getFeaturesDirectory('/workspace', '.scratch/features')).toBe(
      path.join('/workspace', '.scratch/features')
    )
  })

  it('falls back to .devtool/features when the setting is empty', () => {
    expect(getFeaturesDirectory('/workspace', '')).toBe(
      path.join('/workspace', '.devtool/features')
    )
  })

  it('returns null when there is no workspace', () => {
    expect(getFeaturesDirectory(null, '.devtool/features')).toBeNull()
  })
})

describe('isFeatureFilePath', () => {
  it('accepts a .md file directly in the features directory', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(true)
  })

  it('accepts a .md file inside the done/ subfolder', () => {
    const filePath = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(true)
  })

  it('rejects non-markdown files', () => {
    const filePath = path.join(FEATURES_DIR, 'notes.txt')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(false)
  })

  it('rejects paths outside the features directory', () => {
    const filePath = path.join('/workspace/other', 'my-feature.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(false)
  })

  it('rejects a path that merely shares a prefix with the features directory', () => {
    const filePath = path.join(FEATURES_DIR + '-other', 'my-feature.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(false)
  })

  it('rejects the features directory itself', () => {
    expect(isFeatureFilePath(FEATURES_DIR, FEATURES_DIR)).toBe(false)
  })

  it('accepts spec.md inside a feature directory', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(true)
  })

  it('accepts done/spec.md inside a feature directory in done/', () => {
    const filePath = path.join(FEATURES_DIR, 'done', 'my-feature', 'spec.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(true)
  })

  it('rejects issue files inside a feature directory', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature', 'issues', '001-setup.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(false)
  })

  it('rejects other files inside a feature directory', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature', 'notes.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ensureFeaturesDirectory
// ---------------------------------------------------------------------------

describe('ensureFeaturesDirectory', () => {
  it('creates the features directory and the done/ subfolder', async () => {
    const fs = makeFs()
    await ensureFeaturesDirectory(FEATURES_DIR, fs)
    const calls = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].fsPath)
    expect(calls).toContain(FEATURES_DIR)
    expect(calls).toContain(path.join(FEATURES_DIR, 'done'))
  })

  it('calls createDirectory twice: features dir first, then done/', async () => {
    const fs = makeFs()
    await ensureFeaturesDirectory(FEATURES_DIR, fs)
    expect(fs.createDirectory).toHaveBeenCalledTimes(2)
    const calls = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].fsPath)
    expect(calls[0]).toBe(FEATURES_DIR)
    expect(calls[1]).toBe(path.join(FEATURES_DIR, 'done'))
  })
})

// ---------------------------------------------------------------------------
// listFeatureFiles
// ---------------------------------------------------------------------------

describe('listFeatureFiles', () => {
  const md = { type: 1 }  // vscode.FileType.File === 1
  const dir = { type: 2 } // vscode.FileType.Directory === 2

  it('lists root-level .md files and done/ subfolder .md files', async () => {
    const fs = {
      stat: vi.fn(async (_uri: { fsPath: string }) => { throw new Error('ENOENT') }),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === FEATURES_DIR) {
          return [['root.md', md.type], ['notes.txt', md.type], ['sub', dir.type], ['done', dir.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'done')) {
          return [['finished.md', md.type], ['draft.txt', md.type]]
        }
        throw new Error('ENOENT')
      })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([
      path.join(FEATURES_DIR, 'root.md'),
      path.join(FEATURES_DIR, 'done', 'finished.md')
    ])
  })

  it('returns an empty array when the features directory cannot be read', async () => {
    const fs = {
      stat: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async () => { throw new Error('ENOENT') })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([])
  })
  it('lists spec.md from feature directories alongside flat .md files', async () => {
    const fs = {
      stat: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === path.join(FEATURES_DIR, 'dir-feature', 'spec.md')) return {}
        throw new Error('ENOENT')
      }),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === FEATURES_DIR) {
          return [['flat-feature.md', md.type], ['dir-feature', dir.type], ['done', dir.type], ['notes.txt', md.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'dir-feature')) {
          return [['spec.md', md.type], ['issues', dir.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'done')) {
          return [['finished.md', md.type]]
        }
        throw new Error('ENOENT')
      })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([
      path.join(FEATURES_DIR, 'flat-feature.md'),
      path.join(FEATURES_DIR, 'dir-feature', 'spec.md'),
      path.join(FEATURES_DIR, 'done', 'finished.md')
    ])
  })

  it('skips directories without a spec.md (malformed)', async () => {
    const fs = {
      stat: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === path.join(FEATURES_DIR, 'real-feature', 'spec.md')) return {}
        throw new Error('ENOENT')
      }),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === FEATURES_DIR) {
          return [['empty-dir', dir.type], ['real-feature', dir.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'real-feature')) {
          return [['spec.md', md.type]]
        }
        throw new Error('ENOENT')
      })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([path.join(FEATURES_DIR, 'real-feature', 'spec.md')])
  })

  it('skips the done/ and archived/ subfolders when scanning for feature directories', async () => {
    const fs = {
      stat: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === path.join(FEATURES_DIR, 'real-feature', 'spec.md')) return {}
        throw new Error('ENOENT')
      }),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === FEATURES_DIR) {
          return [['done', dir.type], ['archived', dir.type], ['real-feature', dir.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'real-feature')) {
          return [['spec.md', md.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'done')) {
          return [['finished.md', md.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'archived')) {
          return [['old-feature.md', md.type]]
        }
        throw new Error('ENOENT')
      })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([
      path.join(FEATURES_DIR, 'real-feature', 'spec.md'),
      path.join(FEATURES_DIR, 'done', 'finished.md')
    ])
  })

  it('does not include issue files from a feature directory', async () => {
    const fs = {
      stat: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === path.join(FEATURES_DIR, 'dir-feature', 'spec.md')) return {}
        throw new Error('ENOENT')
      }),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === FEATURES_DIR) {
          return [['dir-feature', dir.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'dir-feature')) {
          return [['spec.md', md.type], ['issues', dir.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'dir-feature', 'issues')) {
          return [['001-setup-db.md', md.type]]
        }
        throw new Error('ENOENT')
      })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([path.join(FEATURES_DIR, 'dir-feature', 'spec.md')])
  })
})


// ---------------------------------------------------------------------------
// getUniqueFeatureFilePath
// ---------------------------------------------------------------------------

describe('getUniqueFeatureFilePath', () => {
  it('returns the plain path when nothing collides', async () => {
    const fs = makeFs()
    const result = await getUniqueFeatureFilePath(FEATURES_DIR, 'todo', 'my-feature', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'my-feature.md'))
  })

  it('appends -1 then -2 when earlier names are taken', async () => {
    const fs = makeFs(new Set([
      path.join(FEATURES_DIR, 'my-feature.md'),
      path.join(FEATURES_DIR, 'my-feature-1.md')
    ]))
    const result = await getUniqueFeatureFilePath(FEATURES_DIR, 'todo', 'my-feature', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'my-feature-2.md'))
  })

  it('routes done features into done/ before checking collisions', async () => {
    const fs = makeFs(new Set([path.join(FEATURES_DIR, 'done', 'my-feature.md')]))
    const result = await getUniqueFeatureFilePath(FEATURES_DIR, 'done', 'my-feature', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'done', 'my-feature-1.md'))
  })

  it('returns the same location as getFeatureFilePath for a free name', async () => {
    const fs = makeFs()
    const result = await getUniqueFeatureFilePath(FEATURES_DIR, 'done', 'archived-feature', fs)
    expect(result).toBe(getFeatureFilePath(FEATURES_DIR, 'done', 'archived-feature'))
  })
})

// ---------------------------------------------------------------------------
// moveFeatureToDirectory
// ---------------------------------------------------------------------------

describe('moveFeatureToDirectory', () => {
  it('renames a file into the target subfolder with no collision suffix', async () => {
    const fs = makeFs()
    const source = path.join(FEATURES_DIR, 'archived', 'my-feature.md')
    const result = await moveFeatureToDirectory(source, FEATURES_DIR, 'archived', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'archived', 'my-feature.md'))
    const [from, to] = (fs.rename as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(from.fsPath).toBe(source)
    expect(to.fsPath).toBe(path.join(FEATURES_DIR, 'archived', 'my-feature.md'))
  })

  it('creates the target directory before renaming', async () => {
    const fs = makeFs()
    const source = path.join(FEATURES_DIR, 'my-feature.md')
    await moveFeatureToDirectory(source, FEATURES_DIR, 'archived', fs)
    const uri = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(uri.fsPath).toBe(path.join(FEATURES_DIR, 'archived'))
    expect(fs.rename).toHaveBeenCalledOnce()
  })

  it('applies -1 suffix when the target name already exists', async () => {
    const source = path.join(FEATURES_DIR, 'my-feature.md')
    const taken = path.join(FEATURES_DIR, 'archived', 'my-feature.md')
    const fs = makeFs(new Set([taken]))
    const result = await moveFeatureToDirectory(source, FEATURES_DIR, 'archived', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'archived', 'my-feature-1.md'))
  })

  it('is a no-op for a spec.md inside a feature directory', async () => {
    const specPath = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    const fs = makeFs()
    const result = await moveFeatureToDirectory(specPath, FEATURES_DIR, 'archived', fs)
    expect(result).toBe(specPath)
    expect(fs.rename).not.toHaveBeenCalled()
    expect(fs.createDirectory).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// listStatusSubfolderFiles (legacy migration support)
// ---------------------------------------------------------------------------

describe('listStatusSubfolderFiles', () => {
  const md = { type: 1 }
  const dir = { type: 2 }

  it('lists only .md files directly in the given subfolder', async () => {
    const subdir = path.join(FEATURES_DIR, 'todo')
    const fs = {
      stat: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async () => [
        ['a.md', md.type],
        ['b.txt', md.type],
        ['nested', dir.type]
      ])
    }
    const files = await listStatusSubfolderFiles(FEATURES_DIR, 'todo', fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([path.join(subdir, 'a.md')])
  })

  it('returns an empty array when the subfolder does not exist', async () => {
    const fs = {
      stat: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async () => { throw new Error('ENOENT') })
    }
    const files = await listStatusSubfolderFiles(FEATURES_DIR, 'review', fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// toWorkspaceRelativePath
// ---------------------------------------------------------------------------

describe('toWorkspaceRelativePath', () => {
  it('returns the path relative to the workspace root', () => {
    const filePath = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    expect(toWorkspaceRelativePath(filePath, '/workspace')).toBe(
      path.join('.devtool/features', 'done', 'my-feature.md')
    )
  })

  it('returns the absolute path when there is no workspace root', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature.md')
    expect(toWorkspaceRelativePath(filePath, null)).toBe(filePath)
  })

  it('returns the absolute path when the file is outside the workspace', () => {
    const filePath = path.join('/elsewhere', 'my-feature.md')
    expect(toWorkspaceRelativePath(filePath, '/workspace')).toBe(filePath)
  })
})

// ---------------------------------------------------------------------------
// removeStatusSubfolderIfEmpty
// ---------------------------------------------------------------------------

describe('removeStatusSubfolderIfEmpty', () => {
  it('deletes the subfolder when reading it returns no entries', async () => {
    const fs = {
      stat: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async () => []),
      delete: vi.fn(async () => {})
    }
    await removeStatusSubfolderIfEmpty(FEATURES_DIR, 'review', fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]>; delete: (uri: unknown) => Promise<void> })
    expect(fs.delete).toHaveBeenCalledTimes(1)
    const uri = (fs.delete as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(uri.fsPath).toBe(path.join(FEATURES_DIR, 'review'))
  })

  it('does not delete when the subfolder still contains entries', async () => {
    const fs = {
      stat: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async () => [['leftover.md', 1]]),
      delete: vi.fn(async () => {})
    }
    await removeStatusSubfolderIfEmpty(FEATURES_DIR, 'todo', fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]>; delete: (uri: unknown) => Promise<void> })
    expect(fs.delete).not.toHaveBeenCalled()
  })

  it('swallows errors when the subfolder does not exist', async () => {
    const fs = {
      stat: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async () => { throw new Error('ENOENT') }),
      delete: vi.fn(async () => {})
    }
    await expect(removeStatusSubfolderIfEmpty(FEATURES_DIR, 'todo', fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]>; delete: (uri: unknown) => Promise<void> })).resolves.toBeUndefined()
    expect(fs.delete).not.toHaveBeenCalled()
  })
})

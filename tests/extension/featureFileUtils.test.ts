import { describe, it, expect, vi, afterEach } from 'vitest'
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
  fileExists,
  getFeaturesDirectory,
  isFeatureFilePath,
  ensureFeaturesDirectory,
  listFeatureFiles,
  moveFeatureToDirectory,
  toWorkspaceRelativePath,
  getUniqueFeatureDirectory,
  ensureFeatureDirectory,
  detectLegacyFeatureFiles,
  migrateLegacyFeatureFiles,
  maybeRunLegacyMigration,
  resetMigrationDeclined,
  isMigrationDeclined,
  loadFeatureDirectory,
  isDirectoryFeaturePath
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
// In-memory filesystem FsAdapter (for migration tests)
// ---------------------------------------------------------------------------

/**
 * A real in-memory filesystem behind the FsAdapter shape: files hold
 * content, directories are tracked explicitly, and readDirectory /
 * readFile / writeFile / delete / rename operate on the tree.
 */
function makeMemFs(initialFiles: Record<string, string> = {}, initialDirs: string[] = []) {
  const files = new Map<string, string>(Object.entries(initialFiles))
  const dirs = new Set<string>(initialDirs)

  const isDir = (p: string): boolean => {
    if (dirs.has(p)) return true
    if (files.has(p)) return false
    for (const f of files.keys()) {
      if (f.startsWith(p + '/')) return true
    }
    for (const d of dirs) {
      if (d.startsWith(p + '/')) return true
    }
    return false
  }

  const removeTree = (p: string) => {
    files.delete(p)
    dirs.delete(p)
    for (const f of [...files.keys()]) {
      if (f.startsWith(p + '/')) files.delete(f)
    }
    for (const d of [...dirs]) {
      if (d.startsWith(p + '/')) dirs.delete(d)
    }
  }

  const fs = {
    stat: vi.fn(async (uri: { fsPath: string }) => {
      const p = uri.fsPath
      if (files.has(p)) return { type: 1, ctime: 0, mtime: 0, size: (files.get(p) || '').length }
      if (isDir(p)) return { type: 2, ctime: 0, mtime: 0, size: 0 }
      throw new Error('ENOENT')
    }),
    readDirectory: vi.fn(async (uri: { fsPath: string }) => {
      const p = uri.fsPath
      if (!isDir(p)) throw new Error('ENOENT')
      const children = new Map<string, number>()
      for (const f of files.keys()) {
        if (!f.startsWith(p + '/')) continue
        const rest = f.slice(p.length + 1)
        const slash = rest.indexOf('/')
        if (slash === -1) children.set(rest, 1)
        else children.set(rest.slice(0, slash), 2)
      }
      for (const d of dirs) {
        if (!d.startsWith(p + '/')) continue
        const rest = d.slice(p.length + 1)
        const slash = rest.indexOf('/')
        if (slash === -1) children.set(rest, 2)
        else children.set(rest.slice(0, slash), 2)
      }
      return [...children.entries()]
    }),
    readFile: vi.fn(async (uri: { fsPath: string }) => {
      const content = files.get(uri.fsPath)
      if (content === undefined) throw new Error('ENOENT')
      return new TextEncoder().encode(content)
    }),
    writeFile: vi.fn(async (uri: { fsPath: string }, content: Uint8Array) => {
      files.set(uri.fsPath, new TextDecoder().decode(content))
    }),
    createDirectory: vi.fn(async (uri: { fsPath: string }) => {
      dirs.add(uri.fsPath)
    }),
    rename: vi.fn(async (source: { fsPath: string }, target: { fsPath: string }) => {
      const content = files.get(source.fsPath)
      if (content === undefined) throw new Error('ENOENT')
      files.delete(source.fsPath)
      files.set(target.fsPath, content)
    }),
    delete: vi.fn(async (uri: { fsPath: string }) => {
      removeTree(uri.fsPath)
    })
  }
  return { fs, files, dirs }
}

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
// moveFeatureToDirectory
// ---------------------------------------------------------------------------

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
  it('rejects a flat .md file in the features directory (legacy layout)', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(false)
  })

  it('rejects a .md file inside the done/ subfolder (legacy layout)', () => {
    const filePath = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    expect(isFeatureFilePath(filePath, FEATURES_DIR)).toBe(false)
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
  it('creates only the features directory', async () => {
    const fs = makeFs()
    await ensureFeaturesDirectory(FEATURES_DIR, fs)
    expect(fs.createDirectory).toHaveBeenCalledOnce()
    const uri = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(uri.fsPath).toBe(FEATURES_DIR)
  })
})

// ---------------------------------------------------------------------------
// listFeatureFiles
// ---------------------------------------------------------------------------

describe('listFeatureFiles', () => {
  const md = { type: 1 }  // vscode.FileType.File === 1
  const dir = { type: 2 } // vscode.FileType.Directory === 2

  it('reads only <slug>/spec.md directories — flat files are not features', async () => {
    const fs = {
      stat: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === path.join(FEATURES_DIR, 'dir-feature', 'spec.md')) return {}
        throw new Error('ENOENT')
      }),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      readDirectory: vi.fn(async (uri: { fsPath: string }) => {
        if (uri.fsPath === FEATURES_DIR) {
          return [['flat-feature.md', md.type], ['dir-feature', dir.type], ['notes.txt', md.type]]
        }
        if (uri.fsPath === path.join(FEATURES_DIR, 'dir-feature')) {
          return [['spec.md', md.type], ['issues', dir.type]]
        }
        throw new Error('ENOENT')
      })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([path.join(FEATURES_DIR, 'dir-feature', 'spec.md')])
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
          return [['old-feature', dir.type]]
        }
        throw new Error('ENOENT')
      })
    }
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([path.join(FEATURES_DIR, 'real-feature', 'spec.md')])
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
// moveFeatureToDirectory
// ---------------------------------------------------------------------------

describe('moveFeatureToDirectory', () => {
  it('renames a feature directory into the target subfolder with no collision suffix', async () => {
    const fs = makeFs()
    const source = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    const result = await moveFeatureToDirectory(source, FEATURES_DIR, 'archived', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'archived', 'my-feature', 'spec.md'))
    const [from, to] = (fs.rename as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(from.fsPath).toBe(path.join(FEATURES_DIR, 'my-feature'))
    expect(to.fsPath).toBe(path.join(FEATURES_DIR, 'archived', 'my-feature'))
  })

  it('creates the target directory before renaming', async () => {
    const fs = makeFs()
    const source = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    await moveFeatureToDirectory(source, FEATURES_DIR, 'archived', fs)
    const uri = (fs.createDirectory as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(uri.fsPath).toBe(path.join(FEATURES_DIR, 'archived'))
    expect(fs.rename).toHaveBeenCalledOnce()
  })

  it('applies -1 suffix when the target name already exists', async () => {
    const source = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    const taken = path.join(FEATURES_DIR, 'archived', 'my-feature')
    const fs = makeFs(new Set([taken]))
    const result = await moveFeatureToDirectory(source, FEATURES_DIR, 'archived', fs)
    expect(result).toBe(path.join(FEATURES_DIR, 'archived', 'my-feature-1', 'spec.md'))
  })

  it('never renames a feature directory already inside the target subfolder', async () => {
    const specPath = path.join(FEATURES_DIR, 'archived', 'my-feature', 'spec.md')
    const fs = makeFs()
    const result = await moveFeatureToDirectory(specPath, FEATURES_DIR, 'archived', fs)
    expect(result).toBe(specPath)
    expect(fs.rename).not.toHaveBeenCalled()
    expect(fs.createDirectory).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// toWorkspaceRelativePath
// ---------------------------------------------------------------------------

describe('toWorkspaceRelativePath', () => {
  it('returns the path relative to the workspace root', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    expect(toWorkspaceRelativePath(filePath, '/workspace')).toBe(
      path.join('.devtool/features', 'my-feature', 'spec.md')
    )
  })

  it('returns the absolute path when there is no workspace root', () => {
    const filePath = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    expect(toWorkspaceRelativePath(filePath, null)).toBe(filePath)
  })

  it('returns the absolute path when the file is outside the workspace', () => {
    const filePath = path.join('/elsewhere', 'my-feature.md')
    expect(toWorkspaceRelativePath(filePath, '/workspace')).toBe(filePath)
  })
})

// ---------------------------------------------------------------------------
// detectLegacyFeatureFiles (migration)
// ---------------------------------------------------------------------------

describe('detectLegacyFeatureFiles', () => {
  it('lists flat root .md files and done/ .md files as legacy', async () => {
    const { fs } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: '---\nid: "alpha"\n---\n# Alpha',
      [path.join(FEATURES_DIR, 'done', 'finished.md')]: '---\nid: "finished"\n---\n# Finished'
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'done')])
    const files = await detectLegacyFeatureFiles(FEATURES_DIR, fs as never)
    expect(files).toEqual([
      path.join(FEATURES_DIR, 'alpha.md'),
      path.join(FEATURES_DIR, 'done', 'finished.md')
    ])
  })

  it('ignores feature directories (spec.md) and non-markdown files', async () => {
    const { fs } = makeMemFs({
      [path.join(FEATURES_DIR, 'dir-feature', 'spec.md')]: '---\nid: "dir-feature"\n---\n# Dir',
      [path.join(FEATURES_DIR, 'notes.txt')]: 'not a feature'
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'dir-feature', 'issues')])
    const files = await detectLegacyFeatureFiles(FEATURES_DIR, fs as never)
    expect(files).toEqual([])
  })

  it('returns an empty list when the features directory does not exist', async () => {
    const { fs } = makeMemFs()
    const files = await detectLegacyFeatureFiles(FEATURES_DIR, fs as never)
    expect(files).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// migrateLegacyFeatureFiles (migration)
// ---------------------------------------------------------------------------

describe('migrateLegacyFeatureFiles', () => {
  it('converts a flat file into <slug>/spec.md preserving content byte-for-byte', async () => {
    const content = [
      '---',
      'id: "my-feature-2026-02-23"',
      'status: "todo"',
      'priority: "high"',
      'assignee: null',
      'epic: null',
      'dueDate: null',
      'created: "2026-02-23T10:00:00.000Z"',
      'modified: "2026-02-23T11:00:00.000Z"',
      'completedAt: null',
      'labels: ["api"]',
      'order: "a0"',
      '---',
      '# My Feature',
      '',
      'Body text here.'
    ].join('\n')
    const { fs, files, dirs } = makeMemFs({
      [path.join(FEATURES_DIR, 'my-feature-2026-02-23.md')]: content
    }, [FEATURES_DIR])

    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(0)
    const specPath = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    expect(files.get(specPath)).toBe(content)
    expect(files.has(path.join(FEATURES_DIR, 'my-feature-2026-02-23.md'))).toBe(false)
    expect(dirs.has(path.join(FEATURES_DIR, 'my-feature', 'issues'))).toBe(true)
  })

  it('migrates a done/ file into done/<slug>/ with status: done, keeping the done/ folder', async () => {
    const content = [
      '---',
      'id: "finished-2026-01-01"',
      'status: "todo"',
      'created: "2026-01-01T10:00:00.000Z"',
      'modified: "2026-01-02T10:00:00.000Z"',
      'order: "a1"',
      '---',
      '# Finished'
    ].join('\n')
    const { fs, files, dirs } = makeMemFs({
      [path.join(FEATURES_DIR, 'done', 'finished-2026-01-01.md')]: content
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'done')])

    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(result.migrated).toBe(1)
    const specPath = path.join(FEATURES_DIR, 'done', 'finished', 'spec.md')
    const migrated = files.get(specPath) || ''
    expect(migrated).toContain('status: "done"')
    // every other frontmatter value is preserved exactly
    expect(migrated).toContain('id: "finished-2026-01-01"')
    expect(migrated).toContain('created: "2026-01-01T10:00:00.000Z"')
    expect(migrated).toContain('modified: "2026-01-02T10:00:00.000Z"')
    expect(migrated).toContain('order: "a1"')
    expect(migrated).toContain('# Finished')
    expect(files.has(path.join(FEATURES_DIR, 'done', 'finished-2026-01-01.md'))).toBe(false)
    // done/ stays as the home of done features; done/<slug>/issues/ exists
    expect(dirs.has(path.join(FEATURES_DIR, 'done', 'finished', 'issues'))).toBe(true)
  })

  it('skips files whose frontmatter cannot be parsed', async () => {
    const raw = 'no frontmatter here, just text'
    const { fs, files, dirs } = makeMemFs({
      [path.join(FEATURES_DIR, 'broken.md')]: raw
    }, [FEATURES_DIR])

    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)
    expect(files.get(path.join(FEATURES_DIR, 'broken.md'))).toBe(raw)
    expect(dirs.has(path.join(FEATURES_DIR, 'feature'))).toBe(false)
  })

  it('appends -2 when two flat files slugify to the same directory name', async () => {
    const make = (id: string) => `---\nid: "${id}"\nstatus: "todo"\n---\n# Same Title\n`
    const { fs, files } = makeMemFs({
      [path.join(FEATURES_DIR, 'first.md')]: make('first'),
      [path.join(FEATURES_DIR, 'second.md')]: make('second')
    }, [FEATURES_DIR])

    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(result.migrated).toBe(2)
    expect(files.has(path.join(FEATURES_DIR, 'same-title', 'spec.md'))).toBe(true)
    expect(files.has(path.join(FEATURES_DIR, 'same-title-2', 'spec.md'))).toBe(true)
  })

  it('does not collide with the migrating file itself', async () => {
    const content = '---\nid: "alpha"\nstatus: "todo"\n---\n# Alpha\n'
    const { fs, files } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: content
    }, [FEATURES_DIR])

    await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(files.has(path.join(FEATURES_DIR, 'alpha', 'spec.md'))).toBe(true)
    expect(files.has(path.join(FEATURES_DIR, 'alpha-2', 'spec.md'))).toBe(false)
  })

  it('collides with an existing feature directory of the same slug', async () => {
    const existingSpec = '---\nid: "existing"\nstatus: "todo"\n---\n# Existing\n'
    const incoming = '---\nid: "incoming"\nstatus: "todo"\n---\n# Existing\n'
    const { fs, files } = makeMemFs({
      [path.join(FEATURES_DIR, 'existing', 'spec.md')]: existingSpec,
      [path.join(FEATURES_DIR, 'incoming.md')]: incoming
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'existing', 'issues')])

    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(result.migrated).toBe(1)
    expect(files.has(path.join(FEATURES_DIR, 'existing-2', 'spec.md'))).toBe(true)
    expect(files.get(path.join(FEATURES_DIR, 'existing', 'spec.md'))).toBe(existingSpec)
  })

  it('removes other empty legacy status folders during migration', async () => {
    const content = '---\nid: "alpha"\nstatus: "todo"\n---\n# Alpha\n'
    const { fs, dirs } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: content
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'review')])

    await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(dirs.has(path.join(FEATURES_DIR, 'review'))).toBe(false)
  })

  it('keeps done/ when a legacy file inside it failed to migrate', async () => {
    const parseable = '---\nid: "alpha"\nstatus: "todo"\n---\n# Alpha\n'
    const { fs, dirs } = makeMemFs({
      [path.join(FEATURES_DIR, 'done', 'broken.md')]: 'no frontmatter',
      [path.join(FEATURES_DIR, 'alpha.md')]: parseable
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'done')])

    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)

    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(1)
    expect(dirs.has(path.join(FEATURES_DIR, 'done'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// migrateLegacyFeatureFiles — dialog gate
// ---------------------------------------------------------------------------

describe('migrateLegacyFeatureFiles dialog gate', () => {
  const content = '---\nid: "alpha"\nstatus: "todo"\n---\n# Alpha\n'

  it('is called once with the legacy count before any file moves, and declining leaves disk untouched', async () => {
    const { fs, files } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: content,
      [path.join(FEATURES_DIR, 'beta.md')]: '---\nid: "beta"\nstatus: "todo"\n---\n# Beta\n'
    }, [FEATURES_DIR])

    const confirm = vi.fn(async (_count: number) => false)
    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never, confirm)

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledWith(2)
    expect(result.cancelled).toBe(true)
    expect(result.migrated).toBe(0)
    // disk untouched
    expect(files.get(path.join(FEATURES_DIR, 'alpha.md'))).toBe(content)
    expect(files.has(path.join(FEATURES_DIR, 'beta.md'))).toBe(true)
  })

  it('accepting the dialog performs the migration', async () => {
    const { fs, files } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: content
    }, [FEATURES_DIR])

    const confirm = vi.fn(async () => true)
    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never, confirm)

    expect(confirm).toHaveBeenCalledOnce()
    expect(result.cancelled).toBe(false)
    expect(result.migrated).toBe(1)
    expect(files.has(path.join(FEATURES_DIR, 'alpha', 'spec.md'))).toBe(true)
    expect(files.has(path.join(FEATURES_DIR, 'alpha.md'))).toBe(false)
  })

  it('does not prompt when there is nothing to migrate', async () => {
    const { fs } = makeMemFs({}, [FEATURES_DIR])
    const confirm = vi.fn(async () => true)
    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never, confirm)
    expect(confirm).not.toHaveBeenCalled()
    expect(result.cancelled).toBe(false)
  })

  it('migrates without prompting when no confirm callback is provided', async () => {
    const { fs, files } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: content
    }, [FEATURES_DIR])
    const result = await migrateLegacyFeatureFiles(FEATURES_DIR, fs as never)
    expect(result.migrated).toBe(1)
    expect(files.has(path.join(FEATURES_DIR, 'alpha', 'spec.md'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Declined migration: session-scoped persistence (review finding 2)
// ---------------------------------------------------------------------------

describe('migration decline persistence', () => {
  const legacyContent = '---\nid: "alpha"\nstatus: "todo"\n---\n# Alpha\n'

  afterEach(() => resetMigrationDeclined())

  it('a declined migration is not re-offered within the same session', async () => {
    const { fs } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: legacyContent
    }, [FEATURES_DIR])

    const confirm = vi.fn(async () => false)
    const first = await maybeRunLegacyMigration(FEATURES_DIR, fs as never, confirm)
    expect(first.cancelled).toBe(true)
    expect(confirm).toHaveBeenCalledOnce()

    const second = await maybeRunLegacyMigration(FEATURES_DIR, fs as never, confirm)
    expect(second.skippedOffer).toBe(true)
    // Confirm dialog was NOT shown a second time
    expect(confirm).toHaveBeenCalledOnce()
    // Files untouched
    expect(isMigrationDeclined()).toBe(true)
  })

  it('an accepted migration is not marked declined and files are gone afterwards', async () => {
    const { fs } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: legacyContent
    }, [FEATURES_DIR])

    const confirm = vi.fn(async () => true)
    const result = await maybeRunLegacyMigration(FEATURES_DIR, fs as never, confirm)
    expect(result.cancelled).toBe(false)
    expect(result.migrated).toBe(1)
    expect(isMigrationDeclined()).toBe(false)
  })

  it('decline resets when the legacy files are gone, so a later re-added legacy file prompts again', async () => {
    const { fs, files } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: legacyContent
    }, [FEATURES_DIR])

    const confirm = vi.fn(async () => false)
    await maybeRunLegacyMigration(FEATURES_DIR, fs as never, confirm)
    expect(confirm).toHaveBeenCalledOnce()

    // Legacy file disappears (user migrated by hand or deleted it)
    files.delete(path.join(FEATURES_DIR, 'alpha.md'))
    await maybeRunLegacyMigration(FEATURES_DIR, fs as never, confirm)
    expect(isMigrationDeclined()).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()

    // Re-add a legacy file: the dialog is offered again
    files.set(path.join(FEATURES_DIR, 'beta.md'), legacyContent)
    await maybeRunLegacyMigration(FEATURES_DIR, fs as never, confirm)
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// Declined migration: flat features stay visible on the board (finding 3)
// ---------------------------------------------------------------------------

describe('loadFeatureDirectory with a declined migration', () => {
  const legacyContent = '---\nid: "alpha"\nstatus: "todo"\n---\n# Alpha\n'

  afterEach(() => resetMigrationDeclined())

  it('returns legacy flat features read-only alongside directory features after a decline', async () => {
    const { fs } = makeMemFs({
      [path.join(FEATURES_DIR, 'alpha.md')]: legacyContent,
      [path.join(FEATURES_DIR, 'dir-feature', 'spec.md')]: '---\nid: "dir-feature"\nstatus: "todo"\n---\n# Dir\n'
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'dir-feature', 'issues')])

    const confirm = vi.fn(async () => false)
    await maybeRunLegacyMigration(FEATURES_DIR, fs as never, confirm)

    const features = await loadFeatureDirectory(FEATURES_DIR, fs as never)
    const ids = features.map(f => f.id)
    expect(ids).toContain('alpha')
    expect(ids).toContain('dir-feature')
    // The flat feature is marked as legacy (read-only on disk, in-memory only)
    const alpha = features.find(f => f.id === 'alpha')!
    expect(alpha.filePath).toBe(path.join(FEATURES_DIR, 'alpha.md'))
  })

  it('returns only directory features when there is nothing legacy', async () => {
    const { fs } = makeMemFs({
      [path.join(FEATURES_DIR, 'dir-feature', 'spec.md')]: '---\nid: "dir-feature"\nstatus: "todo"\n---\n# Dir\n'
    }, [FEATURES_DIR, path.join(FEATURES_DIR, 'dir-feature', 'issues')])

    const features = await loadFeatureDirectory(FEATURES_DIR, fs as never)
    expect(features.map(f => f.id)).toEqual(['dir-feature'])
  })
})

// ---------------------------------------------------------------------------
// isDirectoryFeaturePath (finding 8: the "is this spec.md" knowledge lives
// in the file layer, not in prompt-building)
// ---------------------------------------------------------------------------

describe('isDirectoryFeaturePath', () => {
  it('is true for a <slug>/spec.md path and false for a flat file or issue file', () => {
    expect(isDirectoryFeaturePath(path.join(FEATURES_DIR, 'my-feature', 'spec.md'))).toBe(true)
    expect(isDirectoryFeaturePath(path.join(FEATURES_DIR, 'my-feature.md'))).toBe(false)
    expect(isDirectoryFeaturePath(path.join(FEATURES_DIR, 'my-feature', 'issues', '001-a.md'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// done/ subfolder for directory features — Done features live in done/<slug>/
// ---------------------------------------------------------------------------

describe('listFeatureFiles with done/ directory features', () => {
  it('lists done/<slug>/spec.md as a feature file', async () => {
    const { fs } = makeMemFs(
      {
        [path.join(FEATURES_DIR, 'done', 'old-feature', 'spec.md')]: '---\nid: "old-feature"\nstatus: "done"\n---\n# Old\n'
      },
      [FEATURES_DIR, path.join(FEATURES_DIR, 'done', 'old-feature', 'issues')]
    )
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([path.join(FEATURES_DIR, 'done', 'old-feature', 'spec.md')])
  })

  it('still skips legacy flat files inside done/', async () => {
    const { fs } = makeMemFs(
      {
        [path.join(FEATURES_DIR, 'done', 'flat-done.md')]: '---\nid: "flat-done"\n---\n# Flat\n'
      },
      [FEATURES_DIR]
    )
    const files = await listFeatureFiles(FEATURES_DIR, fs as unknown as FsAdapter & { readDirectory: (uri: unknown) => Promise<[string, number][]> })
    expect(files).toEqual([])
  })
})

describe('isFeatureFilePath with done/ directory features', () => {
  it('accepts done/<slug>/spec.md', () => {
    const specPath = path.join(FEATURES_DIR, 'done', 'my-feature', 'spec.md')
    expect(isFeatureFilePath(specPath, FEATURES_DIR)).toBe(true)
  })

  it('still rejects flat files in done/', () => {
    const flatPath = path.join(FEATURES_DIR, 'done', 'my-feature.md')
    expect(isFeatureFilePath(flatPath, FEATURES_DIR)).toBe(false)
  })
})

describe('moving a directory feature in or out of done/', () => {
  it('moveFeatureToDirectory target done moves the whole feature directory into done/', async () => {
    const fs = makeFs(new Set([path.join(FEATURES_DIR, 'my-feature')]))
    const currentPath = path.join(FEATURES_DIR, 'my-feature', 'spec.md')
    const newPath = await moveFeatureToDirectory(currentPath, FEATURES_DIR, 'done', fs as unknown as FsAdapter)
    expect(newPath).toBe(path.join(FEATURES_DIR, 'done', 'my-feature', 'spec.md'))
    expect(fs.rename).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: path.join(FEATURES_DIR, 'my-feature') }),
      expect.objectContaining({ fsPath: path.join(FEATURES_DIR, 'done', 'my-feature') })
    )
  })

  it('moveFeatureToDirectory target root moves the feature directory out of done/', async () => {
    const fs = makeFs(new Set([path.join(FEATURES_DIR, 'done', 'my-feature')]))
    const currentPath = path.join(FEATURES_DIR, 'done', 'my-feature', 'spec.md')
    const newPath = await moveFeatureToDirectory(currentPath, FEATURES_DIR, '.', fs as unknown as FsAdapter)
    expect(newPath).toBe(path.join(FEATURES_DIR, 'my-feature', 'spec.md'))
    expect(fs.rename).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: path.join(FEATURES_DIR, 'done', 'my-feature') }),
      expect.objectContaining({ fsPath: path.join(FEATURES_DIR, 'my-feature') })
    )
  })
})

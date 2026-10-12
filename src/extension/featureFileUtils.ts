import * as path from 'path'
import * as vscode from 'vscode'
import { parseFeatureFile, serializeFeature } from '../shared/featureFrontmatter'
import { getTitleFromContent, generateFeatureSlug } from '../shared/types'

export interface FsAdapter {
  stat(uri: vscode.Uri): Thenable<vscode.FileStat>
  rename(source: vscode.Uri, target: vscode.Uri): Thenable<void>
  createDirectory(uri: vscode.Uri): Thenable<void>
}

export function getFeatureFilePath(featuresDir: string, status: string, filename: string): string {
  if (status === 'done') {
    return path.join(featuresDir, 'done', `${filename}.md`)
  }
  return path.join(featuresDir, `${filename}.md`)
}

export async function ensureStatusSubfolders(featuresDir: string, fs: FsAdapter = vscode.workspace.fs): Promise<void> {
  await fs.createDirectory(vscode.Uri.file(path.join(featuresDir, 'done')))
}

export async function moveFeatureFile(
  currentPath: string,
  featuresDir: string,
  newStatus: string,
  fs: FsAdapter = vscode.workspace.fs
): Promise<string> {
  const filename = path.basename(currentPath)
  const targetDir = newStatus === 'done'
    ? path.join(featuresDir, 'done')
    : featuresDir
  let targetPath = path.join(targetDir, filename)

  if (currentPath === targetPath) return currentPath

  // Directory features never move on status change: the status lives in
  // spec.md frontmatter only. A spec.md in a feature directory (or in a
  // feature directory inside done/) is a directory feature.
  if (filename === 'spec.md') {
    const featureDir = path.dirname(currentPath)
    const parent = path.dirname(featureDir)
    if (parent === featuresDir || parent === path.join(featuresDir, 'done')) {
      return currentPath
    }
  }

  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let counter = 1
  while (await fileExists(targetPath, fs)) {
    targetPath = path.join(targetDir, `${base}-${counter}${ext}`)
    counter++
  }

  await fs.createDirectory(vscode.Uri.file(targetDir))
  await fs.rename(vscode.Uri.file(currentPath), vscode.Uri.file(targetPath))

  return targetPath
}

export function getStatusFromPath(filePath: string, featuresDir: string): string | null {
  const relative = path.relative(featuresDir, filePath)
  const parts = relative.split(path.sep)
  if (parts.length === 2 && parts[0] === 'done') {
    return 'done'
  }
  return null
}

export async function fileExists(filePath: string, fs: FsAdapter = vscode.workspace.fs): Promise<boolean> {
  try {
    await fs.stat(vscode.Uri.file(filePath))
    return true
  } catch {
    return false
  }
}

const DEFAULT_FEATURES_DIRECTORY = '.devtool/features'

// vscode.FileType.File / FileType.Directory — referenced numerically so
// FsAdapter stubs don't need the full vscode module mocked
const FILE_TYPE_FILE = 1
const FILE_TYPE_DIRECTORY = 2

/**
 * Resolves the features directory from the workspace root and the
 * `featuresDirectory` setting value. Central decision: where features live.
 */
export function getFeaturesDirectory(workspaceRoot: string | null | undefined, configured: string | undefined): string | null {
  if (!workspaceRoot) return null
  return path.join(workspaceRoot, configured || DEFAULT_FEATURES_DIRECTORY)
}

/**
 * Decides whether a file path is a trackable feature file inside the
 * features directory. Central decision: what counts as a feature file.
 * A feature file is a flat `<slug>.md` or a `<slug>/spec.md`; issue files
 * and other files inside feature directories are not feature files.
 */
export function isFeatureFilePath(filePath: string, featuresDir: string): boolean {
  if (!filePath.endsWith('.md')) return false
  const relative = path.relative(featuresDir, filePath)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false
  const parts = relative.split(path.sep)
  if (parts.length === 1) return true
  if (parts.length === 2 && parts[0] === 'done') return true
  if (parts.length === 2 && parts[1] === 'spec.md') return true
  if (parts.length === 3 && parts[0] === 'done' && parts[2] === 'spec.md') return true
  return false
}

/**
 * Creates the features directory and its `done/` subfolder.
 * Central decision: what directory structure must exist before use.
 */
export async function ensureFeaturesDirectory(featuresDir: string, fs: FsAdapter = vscode.workspace.fs): Promise<void> {
  await fs.createDirectory(vscode.Uri.file(featuresDir))
  await fs.createDirectory(vscode.Uri.file(path.join(featuresDir, 'done')))
}

/**
 * Reads the layout: lists every existing feature file path (root + `done/`
 * subfolder). Central decision: where features are read from.
 * Requires a `readDirectory` capability in addition to the base FsAdapter.
 */
export async function listFeatureFiles(
  featuresDir: string,
  fs: FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> } = vscode.workspace.fs as FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> }
): Promise<string[]> {
  const files: string[] = []
  try {
    const entries = await fs.readDirectory(vscode.Uri.file(featuresDir))
    for (const [name, type] of entries) {
      if (type === FILE_TYPE_FILE && name.endsWith('.md')) {
        files.push(path.join(featuresDir, name))
        continue
      }
      if (type === FILE_TYPE_DIRECTORY && name !== 'done' && name !== 'archived') {
        // Directory feature: <slug>/spec.md. Directories without a spec.md
        // are malformed and skipped, just like unparseable files.
        const specPath = path.join(featuresDir, name, 'spec.md')
        if (await fileExists(specPath, fs)) {
          files.push(specPath)
        }
      }
    }
  } catch {
    return []
  }

  const doneDir = path.join(featuresDir, 'done')
  try {
    const doneEntries = await fs.readDirectory(vscode.Uri.file(doneDir))
    for (const [name, type] of doneEntries) {
      if (type !== FILE_TYPE_FILE || !name.endsWith('.md')) continue
      files.push(path.join(doneDir, name))
    }
  } catch {
    // done/ subfolder may not exist yet; skip
  }

  return files
}

/**
 * Legacy migration support: lists the `.md` files directly inside a named
 * subfolder of the features directory (e.g. `todo/`). Returns an empty list
 * when the subfolder does not exist.
 */
export async function listStatusSubfolderFiles(
  featuresDir: string,
  folder: string,
  fs: FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> } = vscode.workspace.fs as FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> }
): Promise<string[]> {
  const subdir = path.join(featuresDir, folder)
  try {
    const entries = await fs.readDirectory(vscode.Uri.file(subdir))
    return entries
      .filter(([name, type]) => type === FILE_TYPE_FILE && name.endsWith('.md'))
      .map(([name]) => path.join(subdir, name))
  } catch {
    return []
  }
}

/**
 * Presents a feature file path relative to the workspace root (for webview
 * display). Central decision: how feature paths are shown outside the
 * extension process. Falls back to the absolute path when the file is not
 * inside the workspace or there is no workspace root.
 */
export function toWorkspaceRelativePath(filePath: string, workspaceRoot: string | null | undefined): string {
  if (!workspaceRoot) return filePath
  const relative = path.relative(workspaceRoot, filePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return filePath
  return relative
}

/**
 * Legacy migration support: removes a named subfolder of the features
 * directory when it has become empty (e.g. an old `todo/` status folder).
 * Swallows errors when the subfolder does not exist or cannot be read.
 */
export async function removeStatusSubfolderIfEmpty(
  featuresDir: string,
  folder: string,
  fs: FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]>; delete(uri: vscode.Uri, options?: { recursive?: boolean }): Thenable<void> } = vscode.workspace.fs as FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]>; delete(uri: vscode.Uri, options?: { recursive?: boolean }): Thenable<void> }
): Promise<void> {
  const subdir = path.join(featuresDir, folder)
  try {
    const entries = await fs.readDirectory(vscode.Uri.file(subdir))
    if (entries.length === 0) {
      await fs.delete(vscode.Uri.file(subdir))
    }
  } catch {
    // Folder doesn't exist or can't be read; skip
  }
}

/**
 * Computes the path a new feature file should take, adding `-1`, `-2`, …
 * suffixes on collision. Central decision: where a new feature file goes.
 */
export async function getUniqueFeatureFilePath(
  featuresDir: string,
  status: string,
  filename: string,
  fs: FsAdapter = vscode.workspace.fs
): Promise<string> {
  let filePath = getFeatureFilePath(featuresDir, status, filename)
  let uniqueFilename = filename
  let counter = 1
  while (await fileExists(filePath, fs)) {
    uniqueFilename = `${filename}-${counter}`
    filePath = getFeatureFilePath(featuresDir, status, uniqueFilename)
    counter++
  }
  return filePath
}

/**
 * Computes a unique feature directory name from a slug, appending `-2`,
 * `-3`, … on collision. A directory or flat file with the same base name
 * counts as a collision so directory and legacy flat features never clash.
 * Central decision: what a new feature directory is called.
 */
export async function getUniqueFeatureDirectory(
  featuresDir: string,
  slug: string,
  fs: FsAdapter = vscode.workspace.fs
): Promise<string> {
  let name = slug
  let counter = 2
  while (await fileExists(path.join(featuresDir, name), fs) || await fileExists(path.join(featuresDir, `${name}.md`), fs)) {
    name = `${slug}-${counter}`
    counter++
  }
  return name
}

/**
 * Creates a feature directory and its `issues/` subdirectory.
 * Central decision: what structure a new feature directory contains.
 */
export async function ensureFeatureDirectory(
  featureDir: string,
  fs: FsAdapter = vscode.workspace.fs
): Promise<void> {
  await fs.createDirectory(vscode.Uri.file(featureDir))
  await fs.createDirectory(vscode.Uri.file(path.join(featureDir, 'issues')))
}

/**
 * Moves a feature file into a named subfolder of the features directory
 * (e.g. `archived/`), applying `-1`, `-2`, … suffixes on collision.
 * Central decision: what happens to the file when it leaves the board.
 */
export async function moveFeatureToDirectory(
  currentPath: string,
  featuresDir: string,
  directory: string,
  fs: FsAdapter = vscode.workspace.fs
): Promise<string> {
  const filename = path.basename(currentPath)

  // Directory features are not moved out of their directory: archiving a
  // directory feature is out of scope for the flat-file layout move.
  if (filename === 'spec.md') {
    return currentPath
  }

  const targetDir = path.join(featuresDir, directory)
  let targetPath = path.join(targetDir, filename)

  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let counter = 1
  while (await fileExists(targetPath, fs)) {
    targetPath = path.join(targetDir, `${base}-${counter}${ext}`)
    counter++
  }

  await fs.createDirectory(vscode.Uri.file(targetDir))
  await fs.rename(vscode.Uri.file(currentPath), vscode.Uri.file(targetPath))

  return targetPath
}

/**
 * Decides where an issue file lives: `<featureDir>/issues/<id>.md`.
 * Central decision: the location of an issue file inside a feature.
 */
export function getIssueFilePath(featureDir: string, issueId: string): string {
  return path.join(featureDir, 'issues', `${issueId}.md`)
}

/**
 * Lists every `.md` file in a feature's `issues/` directory, ordered
 * alphabetically by filename. Central decision: which files are issues.
 * Membership is by location only. Returns an empty list when the
 * issues/ directory does not exist.
 */
export async function listIssueFiles(
  featureDir: string,
  fs: FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> } = vscode.workspace.fs as FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> }
): Promise<string[]> {
  const issuesDir = path.join(featureDir, 'issues')
  try {
    const entries = await fs.readDirectory(vscode.Uri.file(issuesDir))
    return entries
      .filter(([name, type]) => type === FILE_TYPE_FILE && name.endsWith('.md'))
      .map(([name]) => path.join(issuesDir, name))
      .sort()
  } catch {
    return []
  }
}

/**
 * Finds the next free zero-padded issue counter in a feature's `issues/`
 * directory by scanning every existing filename for its leading number.
 * Hand-created files with any numeric prefix count, so numbering never
 * collides. Central decision: what number a new issue gets.
 */
export async function getNextIssueNumber(
  featureDir: string,
  fs: FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> } = vscode.workspace.fs as FsAdapter & { readDirectory(uri: vscode.Uri): Thenable<[string, number][]> }
): Promise<number> {
  const issuesDir = path.join(featureDir, 'issues')
  let max = 0
  try {
    const entries = await fs.readDirectory(vscode.Uri.file(issuesDir))
    for (const [name, type] of entries) {
      if (type !== FILE_TYPE_FILE || !name.endsWith('.md')) continue
      const match = name.match(/^(\d+)-/)
      if (match) {
        const n = parseInt(match[1], 10)
        if (n > max) max = n
      }
    }
  } catch {
    // issues/ directory doesn't exist yet — start at 1
  }
  return max + 1
}

// vscode.FileType.File / FileType.Directory — referenced numerically so
// FsAdapter stubs don't need the full vscode module mocked
const LEGACY_FILE_TYPE_FILE = 1

/**
 * A read/write filesystem view used by migration, extending FsAdapter with
 * the capabilities the one-time conversion needs.
 */
export interface MigrationFs extends FsAdapter {
  readDirectory(uri: vscode.Uri): Thenable<[string, number][]>
  readFile(uri: vscode.Uri): Thenable<Uint8Array>
  writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>
  delete(uri: vscode.Uri, options?: { recursive?: boolean }): Thenable<void>
}

export interface LegacyMigrationResult {
  migrated: number
  skipped: number
  cancelled: boolean
}

/**
 * Detects legacy layout files that would be converted by the directory
 * migration: flat `.md` files at the features root and `.md` files inside
 * the `done/` subfolder. Directory features (spec.md) are not legacy.
 */
export async function detectLegacyFeatureFiles(
  featuresDir: string,
  fs: Pick<MigrationFs, 'readDirectory' | 'stat'> = vscode.workspace.fs as MigrationFs
): Promise<string[]> {
  const legacy: string[] = []
  try {
    const entries = await fs.readDirectory(vscode.Uri.file(featuresDir))
    for (const [name, type] of entries) {
      if (type === LEGACY_FILE_TYPE_FILE && name.endsWith('.md')) {
        legacy.push(path.join(featuresDir, name))
      }
    }
  } catch {
    return []
  }

  const doneDir = path.join(featuresDir, 'done')
  try {
    const doneEntries = await fs.readDirectory(vscode.Uri.file(doneDir))
    for (const [name, type] of doneEntries) {
      if (type === LEGACY_FILE_TYPE_FILE && name.endsWith('.md')) {
        legacy.push(path.join(doneDir, name))
      }
    }
  } catch {
    // done/ may not exist; nothing legacy there
  }

  return legacy
}

/**
 * One-time migration from the flat layout to feature directories. Shows the
 * confirm dialog (via the injected `confirm` callback, when provided) with
 * the number of legacy features before touching any file; declining aborts
 * cleanly. Each flat file becomes `<slug>/spec.md` with its content
 * preserved byte-for-byte; files in `done/` get `status: done` written into
 * their frontmatter. Unparseable files are skipped. The `done/` folder and
 * any other empty legacy status subfolder are removed afterwards when empty.
 */
export async function migrateLegacyFeatureFiles(
  featuresDir: string,
  fs: MigrationFs = vscode.workspace.fs as MigrationFs,
  confirm?: (count: number) => Thenable<boolean>
): Promise<LegacyMigrationResult> {
  const legacyFiles = await detectLegacyFeatureFiles(featuresDir, fs)

  if (legacyFiles.length === 0) {
    return { migrated: 0, skipped: 0, cancelled: false }
  }

  if (confirm) {
    const accepted = await confirm(legacyFiles.length)
    if (!accepted) {
      return { migrated: 0, skipped: 0, cancelled: true }
    }
  }

  let migrated = 0
  let skipped = 0

  for (const filePath of legacyFiles) {
    let content = ''
    let deleted = false
    try {
      content = new TextDecoder().decode(await fs.readFile(vscode.Uri.file(filePath)))
      const feature = parseFeatureFile(content, filePath)
      if (!feature) {
        skipped++
        continue
      }

      const title = getTitleFromContent(feature.content)
      const slug = generateFeatureSlug(title)

      // Remove the source file first so it does not collide with its own
      // target directory name. On failure below, restore it.
      await fs.delete(vscode.Uri.file(filePath))
      deleted = true

      const dirName = await getUniqueFeatureDirectory(featuresDir, slug, fs)
      const featureDir = path.join(featuresDir, dirName)
      await fs.createDirectory(vscode.Uri.file(path.join(featureDir, 'issues')))

      let specContent = content
      if (path.dirname(filePath) === path.join(featuresDir, 'done') && feature.status !== 'done') {
        feature.status = 'done'
        feature.filePath = filePath
        specContent = serializeFeature(feature)
      }

      await fs.writeFile(vscode.Uri.file(path.join(featureDir, 'spec.md')), new TextEncoder().encode(specContent))
      migrated++
    } catch {
      skipped++
      if (deleted) {
        try {
          await fs.writeFile(vscode.Uri.file(filePath), new TextEncoder().encode(content))
        } catch {
          // restoration failed; nothing more we can do here
        }
      }
    }
  }

  // Clean up legacy status folders that are now empty
  const legacyFolders = ['done', 'backlog', 'todo', 'in-progress', 'review']
  for (const folder of legacyFolders) {
    try {
      const entries = await fs.readDirectory(vscode.Uri.file(path.join(featuresDir, folder)))
      if (entries.length === 0) {
        await fs.delete(vscode.Uri.file(path.join(featuresDir, folder)))
      }
    } catch {
      // folder doesn't exist; skip
    }
  }

  return { migrated, skipped, cancelled: false }
}

import { describe, it, expect } from 'vitest'
import { generateFeatureSlug, getTitleFromContent } from '../../src/shared/types'

// ---------------------------------------------------------------------------
// generateFeatureSlug
// ---------------------------------------------------------------------------

describe('generateFeatureSlug', () => {
  it('lowercases the title', () => {
    expect(generateFeatureSlug('UPPER CASE')).toBe('upper-case')
  })

  it('replaces spaces with hyphens', () => {
    expect(generateFeatureSlug('one two three')).toBe('one-two-three')
  })

  it('strips special characters', () => {
    expect(generateFeatureSlug('Hello! @World#')).toBe('hello-world')
  })

  it('collapses multiple consecutive hyphens to one', () => {
    expect(generateFeatureSlug('a  --  b')).toBe('a-b')
  })

  it('trims leading and trailing hyphens from slug', () => {
    expect(generateFeatureSlug('!leading and trailing!')).toBe('leading-and-trailing')
  })

  it('limits the slug to 50 characters', () => {
    const long = 'a'.repeat(60)
    expect(generateFeatureSlug(long).length).toBe(50)
  })

  it('falls back to "feature" for an empty title', () => {
    expect(generateFeatureSlug('')).toBe('feature')
  })

  it('falls back to "feature" when title contains only special chars', () => {
    expect(generateFeatureSlug('!@#$%')).toBe('feature')
  })

  it('preserves hyphens already in title', () => {
    expect(generateFeatureSlug('my-existing-slug')).toBe('my-existing-slug')
  })
})

// ---------------------------------------------------------------------------
// getTitleFromContent
// ---------------------------------------------------------------------------

describe('getTitleFromContent', () => {
  it('extracts text from a top-level # heading', () => {
    expect(getTitleFromContent('# My Feature\n\nSome body.')).toBe('My Feature')
  })

  it('extracts # heading that appears mid-content', () => {
    expect(getTitleFromContent('Some intro\n# The Title\nMore text')).toBe('The Title')
  })

  it('trims whitespace from the heading text', () => {
    expect(getTitleFromContent('#   Spaces Around   ')).toBe('Spaces Around')
  })

  it('does not match ## or deeper headings — falls back to raw first line', () => {
    // No H1 present, so the fallback returns the first non-empty line verbatim
    expect(getTitleFromContent('## Secondary\nNext')).toBe('## Secondary')
    expect(getTitleFromContent('### Tertiary')).toBe('### Tertiary')
  })

  it('falls back to first non-empty line when there is no # heading', () => {
    expect(getTitleFromContent('Plain first line\nSecond line')).toBe('Plain first line')
  })

  it('skips blank lines when falling back to first non-empty line', () => {
    expect(getTitleFromContent('\n\nActual first line')).toBe('Actual first line')
  })

  it('returns "Untitled" for empty string', () => {
    expect(getTitleFromContent('')).toBe('Untitled')
  })

  it('returns "Untitled" for whitespace-only content', () => {
    expect(getTitleFromContent('   \n\n  ')).toBe('Untitled')
  })
})

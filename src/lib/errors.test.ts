// Unit tests for describeError — the helper every mutation uses to turn a
// Supabase/unknown error into a message safe to show in a toast.

import { describe, it, expect } from 'vitest'
import { describeError } from './errors'

describe('describeError', () => {
  it('returns a string error as-is', () => {
    expect(describeError('nope')).toBe('nope')
  })

  it('uses the message from an Error instance', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })

  it('prefers message, then details, then hint on Postgrest-shaped errors', () => {
    expect(describeError({ message: 'row violates RLS', details: 'd', hint: 'h' }))
      .toBe('row violates RLS')
    expect(describeError({ message: '', details: 'duplicate key', hint: 'h' }))
      .toBe('duplicate key')
    expect(describeError({ message: '  ', details: '', hint: 'try again' }))
      .toBe('try again')
  })

  it('falls back to the default message for null, empty objects, and blanks', () => {
    const fallback = 'Something went wrong. Please try again.'
    expect(describeError(null)).toBe(fallback)
    expect(describeError(undefined)).toBe(fallback)
    expect(describeError({})).toBe(fallback)
    expect(describeError({ message: 42 })).toBe(fallback)
    expect(describeError(7, 'custom fallback')).toBe('custom fallback')
  })
})

import { describe, expect, it } from 'vitest'

import { percentOf, syncJobStatus, syncTitle, toJobRows, type SyncJob } from '@features/jobs/types/job.types'

const sync: SyncJob = {
  job_id: 'sync-1',
  scope: 'all',
  course_id: '',
  status: 'completed',
  started_at: '2026-01-01',
  finished_at: '',
  total_courses: 5,
  processed: 5,
  stats: { saved: 3, skipped: 0, empty: 0, failed: 0 },
  error: '',
}

const completedWithFailures: SyncJob = { ...sync, stats: { ...sync.stats, failed: 2 } }

describe('percentOf', () => {
  it('clamps to 100', () => {
    expect(percentOf({ ...sync, processed: 7, total_courses: 5 })).toBe(100)
  })

  it('computes a plain percentage', () => {
    expect(percentOf({ ...sync, processed: 1, total_courses: 2 })).toBe(50)
  })

  it('returns 0 when there are no courses', () => {
    expect(percentOf({ ...sync, processed: 0, total_courses: 0 })).toBe(0)
  })
})

describe('syncJobStatus', () => {
  it('flags completed jobs with failures', () => {
    expect(syncJobStatus(completedWithFailures)).toBe('needs-attention')
  })

  it('keeps clean completed jobs done', () => {
    expect(syncJobStatus(sync)).toBe('done')
  })

  it('keeps failed and pending', () => {
    expect(syncJobStatus({ ...sync, status: 'failed' })).toBe('failed')
    expect(syncJobStatus({ ...sync, status: 'pending' })).toBe('running')
  })

  it('feeds job rows', () => {
    expect(toJobRows([], [completedWithFailures])[0].status).toBe('needs-attention')
  })
})

describe('sync job text', () => {
  it('titles all-course jobs', () => {
    expect(syncTitle(sync)).toBe('All courses')
  })

  it('titles course jobs by id', () => {
    expect(syncTitle({ ...sync, scope: 'course', course_id: 'c-9' })).toBe('c-9')
  })

  it('builds a localized subtitle with grouped numbers', () => {
    const job = { ...sync, stats: { saved: 1234, skipped: 5, empty: 2, failed: 3 } }
    expect(toJobRows([], [job])[0].subtitle).toBe('3 courses failed · 1,234 saved · 2 empty skipped · 5 skipped')
  })

  it('omits zero counts', () => {
    expect(toJobRows([], [sync])[0].subtitle).toBe('3 saved')
  })
})

import { describe, expect, it } from 'vitest'

import type { CallLog } from '@features/analytics/types/analytics.types'
import { callLogsToCsv } from '@features/analytics/utils/analyticsCsv'

const log: CallLog = {
  phone_number: '+911234567890',
  duration: 42,
  created_at: new Date('2026-01-02T03:04:05.000Z'),
  user_actions: [],
  content_id: 'c1',
  audio_id: 'a1',
  content_name: 'Say "hello", world',
  audio_name: 'Intro',
}

describe('callLogsToCsv', () => {
  it('writes only the header row for no logs', () => {
    expect(callLogsToCsv([])).toBe(
      '"phone_number","duration","created_at","content_id","content_name","audio_id","audio_name"',
    )
  })

  it('writes one quoted row per log and doubles embedded quotes', () => {
    const lines = callLogsToCsv([log]).split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe(
      '"\'+911234567890","42","2026-01-02T03:04:05.000Z","c1","Say ""hello"", world","a1","Intro"',
    )
  })

  it.each(['=HYPERLINK("http://x")', '+91123', '-1', '@SUM(A1)'])('prefixes a quote on formula-like cell %s', (value) => {
    const row = callLogsToCsv([{ ...log, content_name: value }]).split('\r\n')[1]
    expect(row).toContain(`"'${value.replaceAll('"', '""')}"`)
  })
})

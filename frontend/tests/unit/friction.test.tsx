import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { FrictionTable } from '@/features/analytics/components/FrictionTable'
import {
  frictionMetric,
  projectAnalytics,
  templateMetric,
} from '@/features/analytics/schemas/analyticsSchema'
const metric = {
  itemKey: 'intro',
  templateVersionId: 'version-one',
  eligibleStarts: 11,
  completedObservationWindows: 9,
  startsWithoutSubmission: 4,
  rate: null,
  insufficientData: true,
  medianFirstSubmissionSeconds: null,
  completedSubmissions: 0,
}
afterEach(cleanup)
it('labels open windows without showing a percentage or inventing completion time', () => {
  render(<FrictionTable rows={[metric]} />)
  expect(screen.getByText('2 still observing')).toBeInTheDocument()
  expect(screen.getByText('Insufficient data')).toBeInTheDocument()
  expect(screen.getByText('No completed observations (0)')).toBeInTheDocument()
  expect(screen.queryByText(/%/)).not.toBeInTheDocument()
})
it('shows a closed-window rate and the number of completed duration observations', () => {
  render(
    <FrictionTable
      rows={[
        {
          ...metric,
          completedObservationWindows: 10,
          startsWithoutSubmission: 3,
          rate: 0.3,
          insufficientData: false,
          medianFirstSubmissionSeconds: 120,
          completedSubmissions: 2,
        },
      ]}
    />,
  )
  expect(screen.getByText('30%')).toBeInTheDocument()
  expect(screen.getByText('1 still observing')).toBeInTheDocument()
  expect(
    screen.getByText('2 min (2 completed observations)'),
  ).toBeInTheDocument()
})
it('rejects false percentages, invalid counts and invented duration samples at the API boundary', () => {
  expect(frictionMetric.safeParse(metric).success).toBe(true)
  for (const invalid of [
    { ...metric, rate: 0.4, insufficientData: false },
    { ...metric, completedObservationWindows: 12 },
    { ...metric, startsWithoutSubmission: 10 },
    { ...metric, medianFirstSubmissionSeconds: 20 },
    { ...metric, completedSubmissions: 2 },
  ])
    expect(frictionMetric.safeParse(invalid).success).toBe(false)
})
it('validates zero-required progress and version-separated template contracts', () => {
  expect(
    projectAnalytics.parse({
      progress: {
        requiredTotal: 0,
        submittedRequired: 0,
        approvedRequired: 0,
        clientActionRequired: 0,
        optionalApproved: 0,
      },
      friction: [],
      generatedAt: '2026-11-03T00:00:00Z',
    }).progress.requiredTotal,
  ).toBe(0)
  expect(
    templateMetric.parse({
      ...metric,
      templateTitle: 'Website',
      projectType: 'WEBSITE',
    }).templateVersionId,
  ).toBe('version-one')
  render(<FrictionTable rows={[]} />)
  expect(
    screen.getByText('No eligible item starts in this observation period.'),
  ).toBeInTheDocument()
})

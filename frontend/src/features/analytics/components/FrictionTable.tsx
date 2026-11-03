import type { FrictionMetric } from '../types/analytics.types'
export function FrictionTable({ rows }: { rows: FrictionMetric[] }) {
  return (
    <div className="table-scroll">
      <table>
        <caption>Observed item friction · starts in the last 90 days</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Eligible starts</th>
            <th scope="col">Completed windows</th>
            <th scope="col">Without submission in 7 days</th>
            <th scope="col">Rate</th>
            <th scope="col">Open windows</th>
            <th scope="col">Median first submission</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={`${m.templateVersionId}-${m.itemKey}-${i}`}>
              <th scope="row">{m.itemKey}</th>
              <td>{m.eligibleStarts}</td>
              <td>{m.completedObservationWindows}</td>
              <td>{m.startsWithoutSubmission}</td>
              <td>
                {m.insufficientData ||
                m.completedObservationWindows < 10 ||
                m.eligibleStarts < 10 ||
                m.rate === null
                  ? 'Insufficient data'
                  : `${Math.round(m.rate * 100)}%`}
              </td>
              <td>
                {m.eligibleStarts - m.completedObservationWindows} still
                observing
              </td>
              <td>
                {m.medianFirstSubmissionSeconds === null
                  ? `No completed observations (${m.completedSubmissions})`
                  : `${Math.round(m.medianFirstSubmissionSeconds / 60)} min (${m.completedSubmissions} completed observations)`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p>No eligible item starts in this observation period.</p>
      )}
    </div>
  )
}

import { Panel } from '@/shared/components/ProductUI'
import { Check } from 'lucide-react'
import { Link } from 'react-router'

export function PricingPage() {
  return (
    <>
      <div className="reference-pricing-top">
        <header className="pricing-heading">
          <p className="eyebrow">SIMPLE, TRANSPARENT PRICING</p>
          <h1>
            Choose the plan
            <br />
            that fits your team.
          </h1>
          <p>
            Proposed pricing for the upcoming MVP. Start with a 14-day trial.
          </p>
        </header>
        <div className="pricing-grid">
          {[
            [
              'Solo',
              '19',
              'For independent makers.',
              '1 workspace seat',
              '100 AI drafts / month',
              '25 US SMS segments / month',
            ],
            [
              'Agency',
              '49',
              'For teams making things happen.',
              '5 workspace seats',
              '300 AI drafts / month',
              '100 US SMS segments / month',
            ],
          ].map(([name, price, description, ...features]) => (
            <Panel key={name} title={name}>
              <p>{description}</p>
              <p className="price">
                ${price}
                <small> / month</small>
              </p>
              <ul className="pricing-features">
                {[
                  ...features,
                  '50 GB private storage',
                  'Unlimited active projects within resource limits',
                  'All three project types',
                  'Approved ZIP, JSON and Markdown exports',
                ].map((f) => (
                  <li key={f}>
                    <Check size={17} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link className="primary-button" to="/sign-up">
                Start with {name}
              </Link>
            </Panel>
          ))}
        </div>
      </div>
      <div className="reference-pricing-bottom">
        <Panel title="Compare plans">
          <div className="reference-table-wrap">
            <table className="reference-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Solo</th>
                  <th>Agency</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Seats', '1', '5'],
                  ['Active projects', 'Unlimited*', 'Unlimited*'],
                  ['Storage', '50GB', '50GB'],
                  ['AI drafts / month', '100', '300'],
                  ['US SMS segments / month', '25', '100'],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td key={index}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>* Within resource limits. Proposed pilot pricing.</small>
        </Panel>
        <section className="pricing-faq">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>What happens after the trial?</summary>
            <p>
              Select a plan to continue editing. Payment collection is a mock
              preview until production billing is integrated.
            </p>
          </details>
          <details>
            <summary>How do reminders work?</summary>
            <p>
              Email reminders only chase outstanding client action. Optional US
              SMS requires verified client consent. Message and data rates may
              apply.
            </p>
          </details>
          <details>
            <summary>What if a payment is late?</summary>
            <p>
              There is a 7-day grace period, followed by 30 days of read-only
              access. Owners can read and export approved content during
              read-only access.
            </p>
          </details>
        </section>
      </div>
    </>
  )
}

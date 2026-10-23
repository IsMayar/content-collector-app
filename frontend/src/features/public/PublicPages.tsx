import { Link } from 'react-router'
import {
  ArrowUpRight,
  Check,
  Layers,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'
import { Panel } from '@/components/ProductUI'
export function LandingPage() {
  return (
    <>
      <section className="landing-hero">
        <div>
          <p className="eyebrow">FOR AGENCIES, TEAMS AND FREELANCERS</p>
          <h1>
            Get client content.
            <br />
            Keep projects moving.
          </h1>
          <p className="hero-description">
            Collect copy, requirements and files for websites, web apps and
            mobile apps in one clear project space.
          </p>
          <div className="actions">
            <Link to="/sign-up" className="primary-button">
              Create workspace <ArrowUpRight size={18} />
            </Link>
            <Link to="/client/access" className="secondary-button">
              View client experience
            </Link>
          </div>
          <p className="subtle">
            <span>
              <Check size={14} /> Invite clients in minutes
            </span>
            <span>
              <Check size={14} /> Keep everything in one place
            </span>
            <span>
              <Check size={14} /> Clearer handoffs
            </span>
          </p>
        </div>
        <div className="hero-preview" aria-label="Example collection workspace">
          <div className="preview-browser">
            <i />
            <i />
            <i />
            <span>Website redesign · Client workspace</span>
          </div>
          <div className="preview-product-layout">
            <aside>
              <strong>▣ Content Collector</strong>
              <span className="selected">▣ Projects</span>
              <span>▤ Requests</span>
              <span>♙ Clients</span>
              <span>♧ Team</span>
              <span>⚙ Settings</span>
            </aside>
            <div className="hero-preview-body">
              <p className="eyebrow">LAMAR DENTAL WEBSITE</p>
              <h2>Project content</h2>
              <p>Keep your client and team aligned from brief to handoff.</p>
              <div className="preview-progress">
                <span>
                  Client progress <strong>8 / 12 complete</strong>
                </span>
                <progress
                  value={8}
                  max={12}
                  aria-label="Example submitted progress"
                />
              </div>
              {[
                ['Project overview', 'Brief and project details', true],
                ['Brand information', 'Your voice and identity', true],
                ['Images & assets', 'Photos and supporting files', false],
              ].map(([title, desc, done]) => (
                <div className="hero-task" key={String(title)}>
                  <span className={done ? 'done' : ''}>
                    {done ? <Check size={17} /> : <Layers size={17} />}
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="floating-note">
            <ShieldCheck size={22} />
            <div>
              <strong>Reviewed. Approved. Ready.</strong>
              <p>Approved content, ready for your next stage.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-section">
        <div className="feature-grid">
          {[
            [
              Layers,
              'Collect',
              'Give every client a guided checklist for copy, requirements and files.',
            ],
            [
              MessageSquare,
              'Review',
              'Keep submissions, feedback and approvals beside the right project item.',
            ],
            [
              ShieldCheck,
              'Export',
              'Prepare approved content and files for your next project stage.',
            ],
          ].map(([Icon, title, description]) => {
            const Symbol = Icon as typeof Layers
            return (
              <article key={String(title)}>
                <Symbol size={24} />
                <h3>{String(title)}</h3>
                <p>{String(description)}</p>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}
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

import { Check, Layers, MessageSquare, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'

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
              Create workspace
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

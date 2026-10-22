import { Link } from 'react-router'
import {
  ArrowUpRight,
  Check,
  Layers,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Panel } from '@/components/ProductUI'
export function LandingPage() {
  return (
    <>
      <section className="landing-hero">
        <div>
          <p className="eyebrow">FROM FIRST BRIEF TO FINAL HANDOFF</p>
          <h1>
            Great projects
            <br />
            start with
            <br />
            <em>clear content.</em>
          </h1>
          <p className="hero-description">
            A calmer way to collect the words, files and requirements your next
            project needs. One thoughtful space for you and your clients.
          </p>
          <div className="actions">
            <Link to="/sign-up" className="primary-button">
              Start your workspace <ArrowUpRight size={18} />
            </Link>
            <Link to="/pricing" className="secondary-button">
              Explore plans
            </Link>
          </div>
          <p className="subtle">
            Websites · Web applications · Mobile applications
          </p>
        </div>
        <div className="hero-preview" aria-label="Example collection workspace">
          <div className="preview-browser">
            <i />
            <i />
            <i />
            <span>your next great project</span>
          </div>
          <div className="hero-preview-body">
            <p className="eyebrow">NORTHSTAR STUDIO / CLIENT SPACE</p>
            <h2>A brand new beginning.</h2>
            <p>Let’s bring your website to life.</p>
            <div className="preview-progress">
              <span>
                Submitted <strong>8 / 12</strong>
              </span>
              <progress
                value={8}
                max={12}
                aria-label="Example submitted progress"
              />
            </div>
            {[
              ['Brand & identity', 'A clear picture of who you are', true],
              ['Your story', 'The words that make it yours', true],
              ['Images & assets', 'A little personality, in pixels', false],
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
          <div className="floating-note">
            <ShieldCheck size={22} />
            <div>
              <strong>Reviewed. Approved. Ready.</strong>
              <p>A handoff you can feel good about.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-section">
        <p className="eyebrow">LESS CHASING. MORE CREATING.</p>
        <h2>Make room for the work you love.</h2>
        <div className="feature-grid">
          {[
            [
              Layers,
              'Start with better questions',
              'Thoughtful templates for websites, web apps and mobile apps. Adapt every checklist to your project.',
            ],
            [
              MessageSquare,
              'Keep the conversation close',
              'Drafts, files and feedback live beside the right question. Your client always knows what comes next.',
            ],
            [
              ShieldCheck,
              'Finish with confidence',
              'Review exact revisions and export approved content. Clear progress, from the first answer to the final handoff.',
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
      <section className="landing-cta">
        <Sparkles size={30} />
        <h2>Your next project deserves a clearer start.</h2>
        <p>Bring your questions. We’ll help you bring it all together.</p>
        <Link to="/sign-up" className="primary-button">
          Create your workspace →
        </Link>
      </section>
    </>
  )
}
export function PricingPage() {
  return (
    <>
      <header className="pricing-heading">
        <p className="eyebrow">SPACE TO DO YOUR BEST WORK</p>
        <h1>
          Small team. Big ideas.
          <br />A plan that fits.
        </h1>
        <p>Proposed pricing for the upcoming MVP. Start with a 14-day trial.</p>
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
      <section className="landing-section">
        <h2>A few useful details</h2>
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
            access. Owners can read and export approved content during read-only
            access.
          </p>
        </details>
      </section>
    </>
  )
}

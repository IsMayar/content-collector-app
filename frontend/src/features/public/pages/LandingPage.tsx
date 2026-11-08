import { useAppSelector } from '@/shared/hooks/useAppStore'
import {
  Check,
  ClipboardCheck,
  Download,
  FileText,
  House,
  Image,
  Play,
  Send,
  Settings,
  Tag,
  User,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import { publicPlans } from '../publicPlans'

const previewNav = [
  { Icon: House, label: 'Projects' },
  { Icon: FileText, label: 'Requests' },
  { Icon: User, label: 'Clients' },
  { Icon: Users, label: 'Team' },
  { Icon: Settings, label: 'Settings' },
]
const previewItems = [
  {
    Icon: User,
    title: 'Project overview',
    description: 'Brief, goals and key details',
    complete: true,
  },
  {
    Icon: Tag,
    title: 'Brand information',
    description: 'Logo, colors and identity',
    complete: true,
  },
  {
    Icon: Image,
    title: 'Images & assets',
    description: 'Photos, graphics and files',
    complete: false,
  },
]
const steps = [
  {
    Icon: Send,
    title: 'Request',
    description: 'Create a project and invite your clients.',
  },
  {
    Icon: ClipboardCheck,
    title: 'Review',
    description: 'Collect, check and approve submissions.',
  },
  {
    Icon: Download,
    title: 'Export',
    description: 'Download your organized content and files.',
  },
]

export function LandingPage() {
  const authenticated = useAppSelector((s) => s.auth.status === 'authenticated')
  return (
    <>
      <section className="marketing-hero">
        <div className="marketing-width marketing-hero-grid">
          <div className="marketing-intro">
            <p className="marketing-audience">
              <Users size={18} aria-hidden="true" /> For agencies, teams and
              freelancers
            </p>
            <h1>
              Get client content
              <br />
              without the back-and-forth.
            </h1>
            <p className="marketing-description">
              A simple, organized way to request, collect, review and export all
              the content you need for websites, web apps and mobile apps.
            </p>
            <div className="actions">
              <Link
                to={authenticated ? '/app' : '/sign-up'}
                className="primary-button"
              >
                {authenticated ? 'Open workspace' : 'Get started free'}
              </Link>
              <a href="#how-it-works" className="secondary-button">
                <Play size={18} aria-hidden="true" /> See how it works
              </a>
            </div>
            <ul className="marketing-benefits">
              {[
                'Invite clients in minutes',
                'Keep everything in one place',
                'Faster delivery',
              ].map((benefit) => (
                <li key={benefit}>
                  <Check size={18} aria-hidden="true" /> {benefit}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="marketing-preview"
            role="img"
            aria-label="Example project with eight of twelve items complete, including project overview and brand information"
          >
            <div className="marketing-preview-nav" aria-hidden="true">
              <strong>
                <span className="brand-mark">C</span> Content Collector
              </strong>
              {previewNav.map(({ Icon, label }) => (
                <span key={label}>
                  <Icon size={15} /> {label}
                </span>
              ))}
            </div>
            <div className="marketing-preview-body" aria-hidden="true">
              <div className="marketing-preview-header">
                <div>
                  <strong>Project content</strong>
                  <p>Website · Acme Co.</p>
                </div>
                <div>
                  <span>8 of 12 complete (67%)</span>
                  <progress value={8} max={12} />
                </div>
              </div>
              {previewItems.map(({ Icon, title, description, complete }) => (
                <div className="marketing-preview-item" key={title}>
                  <span
                    className={
                      complete ? 'preview-complete' : 'preview-pending'
                    }
                  >
                    {complete && <Check size={15} />}
                  </span>
                  <span className="marketing-icon">
                    <Icon size={22} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section
        className="marketing-width marketing-steps"
        aria-labelledby="how-it-works"
      >
        <h2 id="how-it-works" tabIndex={-1}>
          How it works
        </h2>
        <p>From request to delivery in three simple steps.</p>
        <ol>
          {steps.map(({ Icon, title, description }, index) => (
            <li key={title}>
              <span className="marketing-icon">
                <Icon size={34} aria-hidden="true" />
              </span>
              <div>
                <h3>
                  {index + 1}. {title}
                </h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section
        className="marketing-width marketing-pricing"
        aria-labelledby="marketing-pricing-title"
      >
        <div>
          <p className="eyebrow">Simple, transparent pricing</p>
          <h2 id="marketing-pricing-title">
            Choose the plan that fits your team.
          </h2>
          <p>Start with a 14-day free trial.</p>
        </div>
        <div className="marketing-plans">
          {publicPlans.map(([name, price, description]) => {
            const agency = name === 'Agency'
            const Icon = agency ? Users : User
            return (
              <article
                key={name}
                className={
                  agency ? 'marketing-plan featured' : 'marketing-plan'
                }
              >
                <div className="marketing-plan-heading">
                  <Icon size={24} aria-hidden="true" />
                  <div>
                    <h3>{name}</h3>
                    <p>{description}</p>
                  </div>
                  {agency && <span>Popular</span>}
                </div>
                <p className="marketing-price">
                  <strong>${price}</strong> / month
                </p>
              </article>
            )
          })}
        </div>
        <Link className="secondary-button" to="/pricing">
          View all plans
        </Link>
      </section>
    </>
  )
}

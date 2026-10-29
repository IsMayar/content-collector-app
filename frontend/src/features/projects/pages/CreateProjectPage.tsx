import { Steps } from '@/features/projects/components/ProjectSteps'
import type { Client, Project } from '@/features/projects/types/project.types'
import { projectTypes } from '@/features/projects/types/projectOptions'
import { TemplatePreview } from '@/features/templates/components/TemplatePreview'
import { TemplateSymbol } from '@/features/templates/components/TemplateSymbol'
import { TemplateTiles } from '@/features/templates/components/TemplateTiles'
import type {
  TemplateCardData,
  TemplateDefinition,
} from '@/features/templates/types/template.types'
import { useData } from '@/services/api/resourceApi'
import {
  Empty,
  ErrorNotice,
  Field,
  Heading,
  Panel,
  QueryState,
} from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import type { Paged } from '@/shared/types/common.types'
import { Check, Mail } from 'lucide-react'
import type { FormEvent } from 'react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

export function CreateProjectPage() {
  const { id, base, owner } = useWorkspace()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [step, setStep] = useState(search.get('template') ? 2 : 1)
  const [type, setType] = useState(search.get('type') || 'WEBSITE')
  const [template, setTemplate] = useState(search.get('template') || '')
  const [preview, setPreview] = useState(false)
  const [industry, setIndustry] = useState('')
  const [newClient, setNewClient] = useState(false)
  const [invite, setInvite] = useState(false)
  const [values, setValues] = useState({
    title: '',
    clientId: '',
    businessName: '',
    contactName: '',
    email: '',
    dueDate: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  const [busy, setBusy] = useState(false)
  const [partial, setPartial] = useState('')
  const createdClient = useRef('')
  const createdProject = useRef<Project | null>(null)
  const clients = useData<Paged<Client>>(`workspaces/${id}/clients`)
  const templates = useData<{ data: TemplateCardData[] }>(
    `workspaces/${id}/templates`,
  )
  const cards = (templates.data?.data || []).filter(
    (t) => t.projectType === type,
  )
  const selected = cards.find((t) => t.versionId === template)
  const detail = useData<{ definition: TemplateDefinition }>(
    selected ? `workspaces/${id}/template-versions/${selected.versionId}` : '',
  )
  const command = useCommand()
  const customer = clients.data?.data.find((c) => c.id === values.clientId)
  const email = newClient ? values.email : customer?.email || ''
  function field(key: keyof typeof values) {
    return {
      value: values[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setValues({ ...values, [key]: e.target.value }),
    }
  }
  function details(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStep(3)
  }
  async function create(sendInvitation: boolean) {
    if (busy) return
    setBusy(true)
    try {
      let clientId = values.clientId
      if (newClient) {
        if (!createdClient.current) {
          const result = await command.run<{ client: Client }>(
            `workspaces/${id}/clients`,
            {
              businessName: values.businessName,
              contactName: values.contactName,
              email: values.email,
            },
          )
          if (!result) return
          createdClient.current = result.client.id
        }
        clientId = createdClient.current
      }
      if (!createdProject.current) {
        const result = await command.run<{ project: Project }>(
          `workspaces/${id}/projects`,
          {
            clientId,
            title: values.title,
            projectType: type,
            dueDate: values.dueDate,
            timezone: values.timezone,
            templateVersionId: selected?.versionId,
          },
        )
        if (!result) return
        createdProject.current = result.project
      }
      const project = createdProject.current
      if (sendInvitation) {
        const root = `workspaces/${id}/projects/${project.id}`
        const published = await command.run(`${root}/publish`, {
          expectedVersion: project.version,
        })
        if (!published) {
          setPartial(project.id)
          return
        }
        const contact = await command.run<{ contact: { id: string } }>(
          `${root}/contacts`,
          {
            name: newClient
              ? values.contactName || values.businessName
              : customer?.contactName || customer?.businessName,
            email,
            accessExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          },
        )
        if (!contact) {
          setPartial(project.id)
          return
        }
        if (
          !(await command.run(
            `${root}/contacts/${contact.contact.id}/invite`,
            {},
          ))
        ) {
          setPartial(project.id)
          return
        }
      }
      navigate(
        `${base}/projects/${project.id}${sendInvitation ? '?tab=access' : ''}`,
      )
    } finally {
      setBusy(false)
    }
  }
  if (!owner)
    return (
      <Empty
        title="Owner access required"
        description="Your owner can create projects and assign them to you."
      />
    )
  if (partial)
    return (
      <Panel title="Your project was created">
        <p>
          The invitation setup could not finish. Open project access to review
          its current state and finish inviting your client.
        </p>
        <ErrorNotice error={command.error} />
        <Link
          className="primary-button"
          to={`${base}/projects/${partial}?tab=access`}
        >
          Open project access
        </Link>
      </Panel>
    )
  if (step > 1 && !selected)
    return (
      <QueryState query={templates}>
        <Empty
          title="Template unavailable"
          description="This template could not be selected. Choose an available template to continue."
        />
        <button
          type="button"
          className="secondary-button"
          onClick={() => setStep(1)}
        >
          Choose a template
        </button>
      </QueryState>
    )
  return (
    <div className="project-wizard">
      <Heading
        eyebrow={`STEP ${step} OF 3`}
        title={
          step === 1
            ? preview
              ? selected?.title || 'Template preview'
              : 'Choose a template to get started.'
            : step === 2
              ? 'Project details'
              : 'Review and create your project'
        }
        description={
          step === 1
            ? 'Pick a pre-built template and customise it for your client. You can change anything later.'
            : step === 2
              ? 'Add the key details for your new project. You can always update these later.'
              : 'Check the details below, choose how to proceed, and invite your client.'
        }
      >
        <Steps step={step} />
      </Heading>
      {step === 1 && (
        <>
          {preview && selected ? (
            <>
              <button
                type="button"
                className="back-link"
                onClick={() => setPreview(false)}
              >
                All templates
              </button>
              <QueryState query={detail}>
                {detail.data && (
                  <TemplatePreview definition={detail.data.definition} />
                )}
              </QueryState>
            </>
          ) : (
            <>
              <div className="template-toolbar">
                <nav className="segmented-control" aria-label="Project type">
                  {projectTypes.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      aria-pressed={type === t.value}
                      className={type === t.value ? 'selected' : ''}
                      onClick={() => {
                        setType(t.value)
                        setTemplate('')
                        setIndustry('')
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>
                <Field label="Industry">
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  >
                    <option value="">All industries</option>
                    {[...new Set(cards.map((t) => t.industry))].map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <QueryState query={templates}>
                <TemplateTiles
                  templates={cards.filter(
                    (t) => !industry || t.industry === industry,
                  )}
                  selected={template}
                  onSelect={(t) => setTemplate(t.versionId)}
                />
              </QueryState>
            </>
          )}
          <div className="wizard-footer">
            <Link className="secondary-button" to={`${base}/projects`}>
              Cancel
            </Link>
            <div className="actions">
              {!preview && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!selected}
                  onClick={() => setPreview(true)}
                >
                  Preview template
                </button>
              )}
              <button
                type="button"
                className="primary-button"
                disabled={!selected}
                onClick={() => setStep(2)}
              >
                Use this template
              </button>
            </div>
          </div>
        </>
      )}
      {step === 2 && (
        <Panel>
          <div className="wizard-template-summary">
            <TemplateSymbol industry={selected?.industry || ''} />
            <div>
              <span className="eyebrow">Selected template</span>
              <strong>{selected?.title}</strong>
              <small>
                {projectTypes.find((t) => t.value === type)?.label} · Version{' '}
                {selected?.version}
              </small>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStep(1)}
            >
              Change template
            </button>
          </div>
          <form onSubmit={details} className="stack-form">
            <div className="form-grid wizard-details">
              <Field
                label="Project name"
                hint="A clear name helps you and your client stay organised."
              >
                <input
                  required
                  maxLength={160}
                  {...field('title')}
                  placeholder="e.g. Lamar Dental Website"
                />
              </Field>
              <Field
                label="Due date"
                hint="Set a target date for content collection."
              >
                <input required type="date" {...field('dueDate')} />
              </Field>
              <Field label="Project type">
                <input
                  readOnly
                  value={projectTypes.find((t) => t.value === type)?.label}
                />
              </Field>
              <Field
                label="Timezone"
                hint="Used for deadlines and scheduled reminders."
              >
                <input required {...field('timezone')} />
              </Field>
            </div>
            <fieldset className="customer-selection">
              <legend>Who is this project for?</legend>
              <div className="customer-options">
                <section
                  className={
                    newClient ? 'customer-option selected' : 'customer-option'
                  }
                >
                  <label className="customer-mode">
                    <input
                      type="radio"
                      name="customerMode"
                      value="new"
                      checked={newClient}
                      onChange={() => {
                        setNewClient(true)
                        createdClient.current = ''
                      }}
                    />
                    <span>
                      <strong>Add a new customer</strong>
                      <small>Create a customer for this project.</small>
                    </span>
                  </label>
                  <div className="customer-fields">
                    <Field label="Business name">
                      <input
                        required={newClient}
                        disabled={!newClient}
                        placeholder="Customer or business name"
                        {...field('businessName')}
                      />
                    </Field>
                    <Field label="Contact name">
                      <input
                        disabled={!newClient}
                        placeholder="Main contact"
                        {...field('contactName')}
                      />
                    </Field>
                    <Field label="Customer email">
                      <input
                        required={newClient}
                        disabled={!newClient}
                        type="email"
                        placeholder="name@company.com"
                        {...field('email')}
                      />
                    </Field>
                  </div>
                </section>
                <section
                  className={
                    !newClient ? 'customer-option selected' : 'customer-option'
                  }
                >
                  <label className="customer-mode">
                    <input
                      type="radio"
                      name="customerMode"
                      value="existing"
                      checked={!newClient}
                      onChange={() => {
                        setNewClient(false)
                        createdClient.current = ''
                      }}
                    />
                    <span>
                      <strong>Select an existing customer</strong>
                      <small>Use a customer already in your workspace.</small>
                    </span>
                  </label>
                  <div className="customer-fields">
                    <Field label="Customer">
                      <select
                        required={!newClient}
                        disabled={newClient}
                        {...field('clientId')}
                      >
                        <option value="">Choose a customer</option>
                        {clients.data?.data.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.businessName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {customer && !newClient && (
                      <div className="customer-contact">
                        <strong>{customer.businessName}</strong>
                        <p>{customer.contactName || 'No contact name added'}</p>
                        <small>{customer.email || 'No email added'}</small>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </fieldset>
            <div className="wizard-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button type="submit" className="primary-button">
                Continue to review
              </button>
            </div>
          </form>
        </Panel>
      )}
      {step === 3 && (
        <>
          <div className="wizard-review">
            <Panel
              title="Project summary"
              action={
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setStep(2)}
                >
                  Edit
                </button>
              }
            >
              <dl className="summary-list">
                {[
                  ['Project name', values.title],
                  ['Template', selected?.title],
                  [
                    'Project type',
                    projectTypes.find((t) => t.value === type)?.label,
                  ],
                  [
                    'Client name',
                    newClient ? values.businessName : customer?.businessName,
                  ],
                  ['Client email', email || 'Not provided'],
                  ['Due date', values.dueDate],
                  ['Timezone', values.timezone],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel title="Selected template">
              <div className="selected-template">
                <TemplateSymbol industry={selected?.industry || ''} />
                <strong>{selected?.title}</strong>
              </div>
              <ul className="template-section-list">
                {detail.data?.definition.sections.map((s) => (
                  <li key={s.key}>
                    <Check size={16} />
                    {s.title}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Client invitation">
              <p>
                Invite your client to their secure portal to submit content and
                track progress.
              </p>
              <div className="invitation-email">
                <Mail size={18} />
                {email || 'Add an email in project access'}
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={invite}
                  disabled={!email}
                  onChange={(e) => setInvite(e.target.checked)}
                />
                Send client invitation after creating project
              </label>
              <p className="subtle">
                Sending an invitation publishes the project. Client access
                expires after 30 days and can be managed in project access.
              </p>
            </Panel>
          </div>
          <ErrorNotice error={command.error} />
          <div className="wizard-footer">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <div className="actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void create(false)}
              >
                Save as draft
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void create(invite)}
              >
                {busy
                  ? 'Creating…'
                  : invite
                    ? 'Create project and send invitation'
                    : 'Create project'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

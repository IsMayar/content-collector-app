import { bootstrapSession } from '@/features/auth/store/session'
import { useNotify } from '@/shared/components/Feedback'
import {
  ErrorNotice,
  Field,
  Heading,
  Panel,
} from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import { ImagePlus, UserRound, Users } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

export function OnboardingPage() {
  const [logo, setLogo] = useState('')
  const [logoError, setLogoError] = useState('')
  const [saving, setSaving] = useState(false)
  const notify = useNotify()
  const command = useCommand()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const values = Object.fromEntries(new FormData(e.currentTarget))
    const result = await command.run<{
      workspace: { id: string; version: number }
    }>('workspaces', values)
    if (result) {
      if (
        logo &&
        !(await command.run(
          `workspaces/${result.workspace.id}`,
          {
            name: values.name,
            timezone: values.timezone,
            logo,
            expectedVersion: result.workspace.version,
          },
          'PATCH',
        ))
      )
        notify(
          'Workspace created. The logo could not be saved; add it in Settings.',
        )
      await dispatch(bootstrapSession())
      navigate(`/app/w/${result.workspace.id}/overview`)
    }
    setSaving(false)
  }
  return (
    <div className="narrow-product">
      <Heading
        eyebrow="WELCOME TO CONTENT COLLECTOR"
        title="Let’s set up your workspace."
        description="Create your workspace and tell us a bit about how you work so we can tailor your experience."
      />
      <Panel>
        <form className="stack-form onboarding-form" onSubmit={submit}>
          <Field label="Workspace name">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="e.g. Northstar Studio"
            />
          </Field>
          <div className="onboarding-logo">
            <strong>
              Workspace logo <span>(optional)</span>
            </strong>
            <div>
              {logo ? (
                <img src={logo} alt="Workspace logo preview" />
              ) : (
                <span className="logo-placeholder">A</span>
              )}
              <label className="logo-upload">
                <ImagePlus size={24} />
                <span>Upload logo</span>
                <small>PNG, JPG or WebP · Max 1 MB</small>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Upload workspace logo"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (
                      file.size > 1048576 ||
                      !['image/png', 'image/jpeg', 'image/webp'].includes(
                        file.type,
                      )
                    ) {
                      setLogoError(
                        'Choose a PNG, JPEG or WebP image smaller than 1 MB.',
                      )
                      return
                    }
                    setLogoError('')
                    const reader = new FileReader()
                    reader.onload = () => setLogo(String(reader.result))
                    reader.onerror = () =>
                      setLogoError(
                        'Could not read this image. Try another file.',
                      )
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            </div>
            {logo && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLogo('')}
              >
                Remove logo
              </button>
            )}
            <ErrorNotice error={logoError} />
          </div>
          <fieldset className="work-style">
            <legend>How do you work?</legend>
            <label>
              <input
                type="radio"
                name="planKey"
                value="AGENCY"
                defaultChecked
              />
              <Users size={28} />
              <span>
                <strong>Agency</strong>
                <small>Manage multiple clients and team members</small>
              </span>
            </label>
            <label>
              <input type="radio" name="planKey" value="SOLO" />
              <UserRound size={28} />
              <span>
                <strong>Freelancer</strong>
                <small>Work independently with your clients</small>
              </span>
            </label>
          </fieldset>
          <Field label="Workspace timezone">
            <input
              name="timezone"
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              required
            />
          </Field>
          <ErrorNotice error={command.error} />
          <button className="primary-button" disabled={saving}>
            {saving ? 'Creating…' : 'Create workspace'}
          </button>
          <p className="subtle">
            14-day trial. Plans and prices are proposed for this preview.
          </p>
        </form>
      </Panel>
    </div>
  )
}

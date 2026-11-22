import { bootstrapSession } from '@/features/auth/store/session'
import {
  ErrorNotice,
  Field,
  Heading,
  Panel,
} from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

export function OnboardingPage() {
  const [saving, setSaving] = useState(false)
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
          <input type="hidden" name="planKey" value="FREE" />
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
            Free forever. No credit card required. Includes 2 active projects, 1
            seat and 500 MB storage. Upgrade whenever you need more.
          </p>
        </form>
      </Panel>
    </div>
  )
}

import { authApi } from '@/features/auth/api/authApi'
import { identityReceived } from '@/features/auth/store/authSlice'
import type { Member } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { ConfirmDialog } from '@/shared/components/Feedback'
import { ErrorNotice } from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'

const fieldClass =
  'mt-1.5 block h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'

export function OwnershipPanel() {
  const { id, user } = useWorkspace()
  const q = useData<{ data: Member[] }>(`workspaces/${id}/members`)
  const command = useCommand()
  const dispatch = useAppDispatch()

  const [requestKey] = useState(() => crypto.randomUUID())
  const [member, setMember] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState(false)

  const currentOwner = q.data?.data.find((m) => m.role === 'OWNER')

  const activeMembers =
    q.data?.data.filter((m) => m.role === 'MEMBER' && m.state === 'ACTIVE') ??
    []

  return (
    <section aria-label="Workspace ownership" className="min-w-0">
      <form
        className="settings-ownership-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (member && password) setConfirm(true)
        }}
      >
        <label className="settings-ownership-field text-sm font-medium text-slate-800">
          Current owner
          <input
            readOnly
            value={currentOwner?.user.displayName || user?.displayName || ''}
            className={`${fieldClass} cursor-default bg-slate-50 text-slate-700`}
          />
        </label>

        <label className="settings-ownership-field text-sm font-medium text-slate-800">
          New owner
          <select
            required
            value={member}
            onChange={(event) => setMember(event.target.value)}
            className={fieldClass}
          >
            <option value="">Choose an active member</option>

            {activeMembers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.user.displayName} ({candidate.user.email})
              </option>
            ))}
          </select>
        </label>

        <label className="settings-ownership-field text-sm font-medium text-slate-800">
          Confirm your password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldClass}
          />
        </label>

        <p className="settings-ownership-note text-xs leading-5 text-slate-500">
          The new owner will manage members, client access, projects, and
          settings. You will become a workspace member after the transfer.
        </p>

        <div className="settings-ownership-feedback">
          <ErrorNotice error={command.error} />
        </div>

        <div className="settings-ownership-actions">
        <button
          type="submit"
          disabled={command.pending || !member || !password}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Transfer workspace ownership
        </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirm}
        title="Transfer workspace ownership?"
        description={
          <>
            <p>
              You will become a member and lose owner-only access. The selected
              member will become the workspace owner.
            </p>
            <ErrorNotice error={command.error} />
          </>
        }
        confirmLabel="Transfer ownership"
        pending={command.pending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          void (async () => {
            if (
              await command.run(
                `workspaces/${id}/ownership-transfer`,
                {
                  targetMemberId: member,
                  currentPassword: password,
                },
                'POST',
                { 'Idempotency-Key': requestKey },
              )
            ) {
              setPassword('')
              setConfirm(false)

              const result = await dispatch(
                authApi.endpoints.me.initiate(undefined, {
                  forceRefetch: true,
                  subscribe: false,
                }),
              ).unwrap()

              dispatch(identityReceived(result))
            }
          })()
        }
      />
    </section>
  )
}

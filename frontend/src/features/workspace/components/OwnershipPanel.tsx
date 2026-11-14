import { authApi } from '@/features/auth/api/authApi'
import { identityReceived } from '@/features/auth/store/authSlice'
import type { Member } from '@/features/workspace/types/workspace.types'
import { useData } from '@/services/api/resourceApi'
import { ConfirmDialog } from '@/shared/components/Feedback'
import { ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useAppDispatch } from '@/shared/hooks/useAppStore'
import { useCommand } from '@/shared/hooks/useCommand'
import { useWorkspace } from '@/shared/hooks/useWorkspace'
import { useState } from 'react'

export function OwnershipPanel() {
  const { id } = useWorkspace(),
    q = useData<{ data: Member[] }>(`workspaces/${id}/members`),
    command = useCommand(),
    dispatch = useAppDispatch()
  const [requestKey] = useState(() => crypto.randomUUID())
  const [member, setMember] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(false)
  return (
    <Panel title="Workspace ownership">
      <p>
        Transfer ownership of this workspace. The new owner will manage members,
        client access, projects and settings.
      </p>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault()
          setConfirm(true)
        }}
      >
        <div className="form-grid">
          <Field label="Current owner">
            <input
              readOnly
              value={
                q.data?.data.find((m) => m.role === 'OWNER')?.user
                  .displayName || ''
              }
            />
          </Field>
          <Field label="New owner">
            <select
              required
              value={member}
              onChange={(e) => setMember(e.target.value)}
            >
              <option value="">Choose an active member</option>
              {q.data?.data
                .filter((m) => m.role === 'MEMBER' && m.state === 'ACTIVE')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user.displayName} ({m.user.email})
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Confirm your password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <button className="primary-button" disabled={command.pending}>
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
    </Panel>
  )
}

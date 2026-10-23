import { useState } from 'react'
import { useData } from '@/api/productApi'
import type { Member } from '@/api/contracts'
import {
  ErrorNotice,
  Field,
  Panel,
  useCommand,
  useWorkspace,
} from '@/components/ProductUI'
import { ConfirmDialog } from '@/components/Feedback'
import { useAppDispatch } from '@/app/hooks'
import { authApi } from '@/features/auth/authApi'
import { identityReceived } from '@/features/auth/authSlice'
export function OwnershipPanel() {
  const { id } = useWorkspace(),
    q = useData<{ data: Member[] }>(`workspaces/${id}/members`),
    command = useCommand(),
    dispatch = useAppDispatch()
  const [member, setMember] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(false)
  return (
    <Panel title="Transfer workspace ownership">
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
              await command.run(`workspaces/${id}/ownership-transfer`, {
                targetMemberId: member,
                currentPassword: password,
              })
            ) {
              setPassword('')
              setConfirm(false)
              const result = await dispatch(
                authApi.endpoints.me.initiate(undefined, {
                  forceRefetch: true,
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

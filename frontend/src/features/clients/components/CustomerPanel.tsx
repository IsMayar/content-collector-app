import { Building2, Pencil } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useEffect, useState } from 'react'
import { useCustomers, useClientCommands } from '../api/clientsApi'
import { customerRenameSchema } from '../schemas/clientSchema'
import type { Client } from '../types/client.types'
import { ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import { Modal } from '@/shared/components/Modal'
import { Notice } from '@/shared/components/Feedback'
import { z } from 'zod'
import {
  AccessCard,
  Button,
  CardBody,
  IconTile,
  Field,
  Skeleton,
  TextInput,
} from '@/shared/components/AccessUI'

export function CustomerPanel({
  workspaceId,
  clientId,
  canManage = true,
}: {
  workspaceId: string
  clientId: string
  canManage?: boolean
}) {
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<Client | null>(null)
  const [message, setMessage] = useState('')

  const query = useCustomers(workspaceId, page)
  const command = useClientCommands()
  const rename = useForm<z.infer<typeof customerRenameSchema>>({
    resolver: zodResolver(customerRenameSchema),
  })
  const [assigned, setAssigned] = useState<Client | null>(null)

  useEffect(() => {
    const customer = query.data?.data.find((c) => c.id === clientId)
    if (customer) {
      setAssigned(customer)
    } else if (
      !assigned &&
      query.data &&
      (page + 1) * 12 < query.data.page.totalElements
    ) {
      setPage(page + 1)
    }
  }, [query.data, assigned, page, clientId])

  const startEdit = () => {
    if (!assigned || !canManage) return
    command.clear()
    setEditing(assigned)
    rename.reset({ businessName: assigned.businessName })
  }

  const onSubmit = rename.handleSubmit(async (values) => {
    if (!editing || !canManage || command.pending) return
    const ok = await command.renameCustomer(workspaceId, editing.id, {
      ...values,
      expectedVersion: editing.version,
    })
    if (!ok) return
    if (editing.id === clientId) {
      setAssigned({
        ...editing,
        businessName: values.businessName,
        version: editing.version + 1,
      })
    }
    setEditing(null)
    setMessage('Customer updated.')
  })

  const businessNameError = rename.formState.errors.businessName?.message

  return (
    <AccessCard aria-label="Customer" className="project-customer-card">
      <div className="project-customer-row">
        <IconTile icon={Building2} large />
        <div className="project-customer-title">
          <h2>Customer</h2>
          {assigned ? (
            <p>{assigned.businessName}</p>
          ) : (
            <QueryState query={query}>
              <Skeleton className="au-skeleton--line" />
            </QueryState>
          )}
        </div>
        {assigned && canManage && (
          <Button variant="secondary" icon={Pencil} onClick={startEdit}>
            Rename
          </Button>
        )}
      </div>
      {editing && canManage && (
        <Modal
          title="Rename customer"
          className="project-access-modal"
          onClose={() => setEditing(null)}
          pending={command.pending}
        >
          <form onSubmit={onSubmit} className="au-form" noValidate>
            <Field label="Business name" error={businessNameError}>
              <TextInput
                aria-label="Business name"
                autoComplete="organization"
                invalid={!!businessNameError}
                {...rename.register('businessName')}
              />
            </Field>
            <p className="au-field-hint">
              This updates the customer name across its projects.
            </p>
            <ErrorNotice error={command.error} />
            <div className="au-actions au-actions--end">
              <Button
                variant="secondary"
                disabled={command.pending}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={command.pending}
              >
                Save changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {message && (
        <CardBody>
          <Notice>{message}</Notice>
        </CardBody>
      )}
    </AccessCard>
  )
}

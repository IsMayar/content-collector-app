import { Building2, Mail, Pencil, UserRound } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useEffect, useState } from 'react'
import { useCustomers, useClientCommands } from '../api/clientsApi'
import { customerRenameSchema } from '../schemas/clientSchema'
import type { Client } from '../types/client.types'
import { ErrorNotice, QueryState } from '@/shared/components/ProductUI'
import { Notice } from '@/shared/components/Feedback'
import { z } from 'zod'
import {
  AccessCard,
  Button,
  CardBody,
  CardHeader,
  Field,
  Skeleton,
  TextInput,
} from '@/shared/components/AccessUI'

export function CustomerPanel({
  workspaceId,
  clientId,
}: {
  workspaceId: string
  clientId: string
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
    if (!assigned) return
    setEditing(assigned)
    rename.reset({ businessName: assigned.businessName })
  }

  const onSubmit = rename.handleSubmit(async (values) => {
    if (!editing) return
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
    <AccessCard aria-label="Customer">
      <CardHeader
        icon={Building2}
        title="Customer"
        subtitle="The organization this project belongs to."
        action={
          assigned && !editing ? (
            <Button variant="secondary" icon={Pencil} onClick={startEdit}>
              Edit
            </Button>
          ) : undefined
        }
      />

      <CardBody>
        {assigned ? (
          <form onSubmit={onSubmit} noValidate>
            <div className="au-customer">
              <span className="au-customer-emblem" aria-hidden="true">
                <Building2 size={24} />
              </span>

              <div className="au-customer-fields">
                <Field
                  label="Business name"
                  error={editing ? businessNameError : undefined}
                >
                  {editing ? (
                    <TextInput
                      aria-label="Business name"
                      autoComplete="organization"
                      invalid={!!businessNameError}
                      {...rename.register('businessName')}
                    />
                  ) : (
                    <p className="au-value-strong">{assigned.businessName}</p>
                  )}
                </Field>

                <div className="au-grid au-grid--2">
                  <Field label="Contact person">
                    <p className="au-value">
                      <UserRound size={15} aria-hidden="true" />
                      {assigned.contactName || 'Not provided'}
                    </p>
                  </Field>

                  <Field label="Email address">
                    <p className="au-value au-value-break">
                      <Mail size={15} aria-hidden="true" />
                      {assigned.email || 'Not provided'}
                    </p>
                  </Field>
                </div>
              </div>
            </div>

            {editing && (
              <div className="au-actions au-actions--end au-actions--divided">
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
            )}
          </form>
        ) : (
          <QueryState query={query}>
            <div className="au-customer au-customer--loading">
              <Skeleton className="au-skeleton--emblem" />
              <div className="au-customer-fields">
                <Skeleton className="au-skeleton--line" />
                <Skeleton className="au-skeleton--line au-skeleton--short" />
              </div>
            </div>
          </QueryState>
        )}

        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
      </CardBody>
    </AccessCard>
  )
}

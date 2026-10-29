import { FormField } from '@/shared/components/FormFields'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { useCustomers, useClientCommands } from '../api/clientsApi'
import {
  customerCreateSchema,
  customerRenameSchema,
} from '../schemas/clientSchema'
import type { Client } from '../types/client.types'
import { ErrorNotice, Panel, QueryState } from '@/shared/components/ProductUI'
import { Notice } from '@/shared/components/Feedback'
import { z } from 'zod'

export function CustomerPanel({
  workspaceId,
  clientId,
}: {
  workspaceId: string
  clientId: string
}) {
  const [page, setPage] = useState(0),
    [editing, setEditing] = useState<Client | null>(null),
    [message, setMessage] = useState('')
  const query = useCustomers(workspaceId, page),
    command = useClientCommands()
  const form = useForm<z.infer<typeof customerCreateSchema>>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: { businessName: '', contactName: '', email: '' },
  })
  const rename = useForm<z.infer<typeof customerRenameSchema>>({
    resolver: zodResolver(customerRenameSchema),
  })
  return (
    <Panel title="Customers">
      <p>
        Projects use these workspace customer records. Editing a business name
        preserves its projects and collected content.
      </p>
      <QueryState query={query}>
        {query.data?.data.length === 0 && <p>No customers yet.</p>}
        <ul className="option-list">
          {query.data?.data.map((c) => (
            <li key={c.id} className="board-toolbar">
              <span>
                <strong>{c.businessName}</strong>
                {c.id === clientId ? ' · This project’s customer' : ''}
                <br />
                {c.contactName} {c.email}
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(c)
                  rename.reset({ businessName: c.businessName })
                }}
              >
                Edit {c.businessName}
              </button>
            </li>
          ))}
        </ul>
        {query.data && (
          <nav className="actions" aria-label="Customer pages">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous customers
            </button>
            <span>Page {page + 1}</span>
            <button
              type="button"
              disabled={(page + 1) * 12 >= query.data.page.totalElements}
              onClick={() => setPage(page + 1)}
            >
              Next customers
            </button>
          </nav>
        )}
      </QueryState>
      {editing && (
        <form
          className="stack-form"
          onSubmit={rename.handleSubmit(async (values) => {
            if (
              await command.renameCustomer(workspaceId, editing.id, {
                ...values,
                expectedVersion: editing.version,
              })
            ) {
              setEditing(null)
              setMessage('Customer updated.')
            }
          })}
        >
          <FormField
            field={{
              name: 'renameBusinessName',
              label: 'Business name',
              type: 'text',
            }}
            registration={rename.register('businessName')}
            error={rename.formState.errors.businessName?.message}
          />
          <div className="actions">
            <button
              type="submit"
              className="primary-button"
              disabled={command.pending}
            >
              Save customer name
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditing(null)}
            >
              Cancel customer edit
            </button>
          </div>
        </form>
      )}
      <details>
        <summary>Add a customer</summary>
        <form
          className="stack-form"
          onSubmit={form.handleSubmit(async (values) => {
            if (
              await command.createCustomer(workspaceId, {
                ...values,
                contactName: values.contactName || null,
                email: values.email || null,
              })
            ) {
              form.reset()
              setPage(0)
              setMessage('Customer created. Select it when creating a project.')
            }
          })}
        >
          <FormField
            field={{
              name: 'businessName',
              label: 'New business name',
              type: 'text',
            }}
            registration={form.register('businessName')}
            error={form.formState.errors.businessName?.message}
          />
          <FormField
            field={{ name: 'contactName', label: 'Contact name', type: 'text' }}
            registration={form.register('contactName')}
            error={form.formState.errors.contactName?.message}
          />
          <FormField
            field={{ name: 'email', label: 'Customer email', type: 'email' }}
            registration={form.register('email')}
            error={form.formState.errors.email?.message}
          />
          <button
            type="submit"
            className="primary-button"
            disabled={command.pending}
          >
            Create customer
          </button>
        </form>
      </details>
      <ErrorNotice error={command.error} />
      {message && <Notice>{message}</Notice>}
    </Panel>
  )
}

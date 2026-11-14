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
  const rename = useForm<z.infer<typeof customerRenameSchema>>({
    resolver: zodResolver(customerRenameSchema),
  })
  const [assigned, setAssigned] = useState<Client | null>(null)
  useEffect(() => {
    const customer = query.data?.data.find((c) => c.id === clientId)
    if (customer) setAssigned(customer)
    else if (
      !assigned &&
      query.data &&
      (page + 1) * 12 < query.data.page.totalElements
    )
      setPage(page + 1)
  }, [query.data, assigned, page, clientId])
  return (
    <section className="product-panel client-access-customer">
      <div className="space-y-5">
        {/* Customer information and inline editing */}
        {assigned ? (
          <form
            onSubmit={rename.handleSubmit(async (values) => {
              if (!editing) return

              if (
                await command.renameCustomer(workspaceId, editing.id, {
                  ...values,
                  expectedVersion: editing.version,
                })
              ) {
                if (editing.id === clientId) {
                  setAssigned({
                    ...editing,
                    businessName: values.businessName,
                    version: editing.version + 1,
                  })
                }

                setEditing(null)
                setMessage('Customer updated.')
              }
            })}
          >
            <dl className="client-access-customer-row">
              <div className="client-access-customer-icon" aria-hidden="true">
                <Building2 size={30} />
              </div>
              {/* Customer */}
              <div className="min-w-0">
                <dt className="mb-2 text-sm font-medium text-slate-500">
                  Customer
                </dt>

                <dd className="m-0">
                  {editing ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        aria-label="Business name"
                        {...rename.register('businessName')}
                        className="!box-border !h-10 !w-full !rounded-lg !border !border-slate-300 !bg-white !px-3 text-sm font-medium text-slate-900 focus:!border-blue-500 focus:!outline-none focus:!ring-2 focus:!ring-blue-500/20"
                      />

                      {rename.formState.errors.businessName?.message && (
                        <p role="alert" className="text-xs text-red-600">
                          {rename.formState.errors.businessName.message}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="break-words text-sm font-semibold text-slate-900">
                      {assigned.businessName}
                    </span>
                  )}
                </dd>
              </div>

              {/* Contact person */}
              <div className="min-w-0">
                <dt className="mb-2 text-sm font-medium text-slate-500">
                  <span className="sr-only">Contact person</span>
                  <UserRound size={20} aria-hidden="true" />
                </dt>
                <dd className="m-0 break-words text-sm font-medium text-slate-900">
                  {assigned.contactName || 'Not provided'}
                </dd>
              </div>

              {/* Email */}
              <div className="min-w-0">
                <dt className="mb-2 text-sm font-medium text-slate-500">
                  <span className="sr-only">Email address</span>
                  <Mail size={20} aria-hidden="true" />
                </dt>
                <dd className="m-0 break-all text-sm font-medium text-slate-900">
                  {assigned.email || 'Not provided'}
                </dd>
              </div>
              {!editing && (
                <div className="client-access-edit">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditing(assigned)
                      rename.reset({ businessName: assigned.businessName })
                    }}
                  >
                    <Pencil size={17} aria-hidden="true" />
                    Edit
                  </button>
                </div>
              )}
            </dl>

            {/* Inline edit actions */}
            {editing && (
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={command.pending}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={command.pending}
                >
                  Save changes
                </button>
              </div>
            )}
          </form>
        ) : (
          <QueryState query={query}>
            <p className="py-4 text-sm text-slate-500">
              Loading the assigned customer…
            </p>
          </QueryState>
        )}

        <ErrorNotice error={command.error} />
        {message && <Notice>{message}</Notice>}
      </div>
    </section>
  )
}

import { useCommand } from '@/shared/hooks/useCommand'
import type { ContactCreate } from '../types/client.types'
import { useData } from '@/services/api/resourceApi'
import type { Paged } from '@/shared/types/common.types'
import type { Client, ProjectContact } from '../types/client.types'
export function useCustomers(workspaceId: string, page = 0) {
  return useData<Paged<Client>>(
    `workspaces/${workspaceId}/clients?page=${page}&size=12`,
  )
}
export function useProjectContacts(root: string) {
  return useData<{ data: ProjectContact[] }>(root ? `${root}/contacts` : '')
}

export function useClientCommands() {
  const command = useCommand()
  return {
    ...command,
    createCustomer: (
      workspaceId: string,
      input: {
        businessName: string
        contactName: string | null
        email: string | null
      },
    ) =>
      command.run<{ client: Client }>(
        `workspaces/${workspaceId}/clients`,
        input,
      ),
    renameCustomer: (
      workspaceId: string,
      id: string,
      input: { businessName: string; expectedVersion: number },
    ) =>
      command.run<{ client: Client }>(
        `workspaces/${workspaceId}/clients/${id}`,
        input,
        'PATCH',
      ),
    createContact: (root: string, input: ContactCreate) =>
      command.run<{ contact: ProjectContact }>(`${root}/contacts`, input),
  }
}

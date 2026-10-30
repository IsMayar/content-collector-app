import { z } from 'zod'

export const teamInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .email('Enter a valid teammate email.')
    .transform((value) => value.toLowerCase()),
})

const member = z.object({
  id: z.string().uuid(),
  user: z.looseObject({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string(),
    verified: z.boolean(),
  }),
  role: z.enum(['OWNER', 'MEMBER']),
  state: z.enum(['ACTIVE', 'DISABLED']),
})
export const teamSchema = z.object({
  data: z.array(member),
  pendingInvites: z.array(
    z.object({
      id: z.string().uuid(),
      email: z.string(),
      expiresAt: z.string(),
      state: z.enum(['PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED']),
    }),
  ),
})

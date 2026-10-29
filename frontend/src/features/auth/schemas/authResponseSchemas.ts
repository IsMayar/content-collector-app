import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  verified: z.boolean(),
})
export const membershipSchema = z.object({
  memberId: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  role: z.enum(['OWNER', 'MEMBER']),
})
export const meSchema = z.object({
  user: userSchema,
  memberships: z.array(membershipSchema),
})
export const tokenSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().positive(),
})
export const loginSchema = tokenSchema.extend({ user: userSchema })

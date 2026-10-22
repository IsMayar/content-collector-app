import { z } from 'zod'

export const userSchema = z.object({ id: z.string(), email: z.string(), displayName: z.string(), verified: z.boolean() })
export const membershipSchema = z.object({ memberId: z.string(), workspaceId: z.string(), workspaceName: z.string(), role: z.enum(['OWNER', 'MEMBER']) })
export const meSchema = z.object({ user: userSchema, memberships: z.array(membershipSchema) })
export const tokenSchema = z.object({ accessToken: z.string(), expiresIn: z.number().positive() })
export const loginSchema = tokenSchema.extend({ user: userSchema })
export type UserSummary = z.infer<typeof userSchema>
export type MembershipSummary = z.infer<typeof membershipSchema>
export type Me = z.infer<typeof meSchema>
export type TokenResponse = z.infer<typeof tokenSchema>
export type LoginCommand = { email: string; password: string }
export type Message = { message: string }
export interface Problem { type: string; title: string; status: number; code: string; detail: string; traceId: string; errors: { fieldPath: string; message: string }[] }

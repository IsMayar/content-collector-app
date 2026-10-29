import { z } from 'zod'
export const customerSchema = z.object({
  id: z.uuid(),
  businessName: z.string().min(1),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  version: z.number().int().nonnegative(),
})
export const customerCreateSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(150),
  email: z.union([z.email().max(254), z.literal('')]),
})
export const customerRenameSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
})
export const contactCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.email().max(254),
  expiry: z.string().min(1),
})
export const projectContactSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  state: z.enum(['ACTIVE', 'REVOKED']),
  timezone: z.string().nullable(),
  accessExpiresAt: z.iso.datetime(),
  emailRemindersEnabled: z.boolean(),
})

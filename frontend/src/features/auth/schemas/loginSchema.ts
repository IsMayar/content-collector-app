import { email } from '@/features/auth/schemas/accountSchemas'
import { z } from 'zod'
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
})

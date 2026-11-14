import { parseActionCode } from '@/features/auth/utils/actionToken'
import { z } from 'zod'

export const email = z
  .string()
  .trim()
  .email('Enter a valid email address.')
  .max(254)
export const password = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use no more than 128 characters.')
export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Enter your name.').max(100),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match.',
  })
export const emailSchema = z.object({ email })
export const tokenInputSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, 'Open the link from your email or enter its code.')
    .refine(
      (value) => !!parseActionCode(value, '/verify-email'),
      'Enter a valid verification code or link from this site.',
    )
    .transform((value) => parseActionCode(value, '/verify-email')!),
})
export const resetSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, 'Open your password reset link or enter its code.')
      .refine(
        (value) => !!parseActionCode(value, '/reset-password'),
        'Enter a valid password reset code or link from this site.',
      )
      .transform((value) => parseActionCode(value, '/reset-password')!),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match.',
  })

import { z } from 'zod'
const email = z.string().trim().email('Enter a valid email address.').max(254)
const password = z.string().min(12, 'Use at least 12 characters.').max(128, 'Use no more than 128 characters.')
export const signInSchema = z.object({ email, password: z.string().min(1, 'Enter your password.') })
export const signUpSchema = z.object({ displayName: z.string().trim().min(2, 'Enter your name.').max(100), email, password, confirmPassword: z.string() }).refine(data => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Passwords must match.' })
export const emailSchema = z.object({ email })
export const tokenInputSchema = z.object({ token: z.string().trim().min(1, 'Open the link from your email or enter its code.') })
export const resetSchema = z.object({ token: z.string().trim().min(1, 'Open your password reset link or enter its code.'), password, confirmPassword: z.string() }).refine(data => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Passwords must match.' })

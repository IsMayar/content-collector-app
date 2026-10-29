import type { FieldDefinition } from '@/shared/components/FormFields'

export const email: FieldDefinition = {
  name: 'email',
  label: 'Email address',
  type: 'email',
  autoComplete: 'email',
}
export const password: FieldDefinition = {
  name: 'password',
  label: 'Password',
  type: 'password',
  autoComplete: 'current-password',
}
export const newPassword: FieldDefinition = {
  ...password,
  label: 'New password',
  autoComplete: 'new-password',
  hint: 'Use 12–128 characters. No special character rules.',
}
export const confirmPassword: FieldDefinition = {
  name: 'confirmPassword',
  label: 'Confirm password',
  type: 'password',
  autoComplete: 'new-password',
}
export const tokenField: FieldDefinition = {
  name: 'token',
  label: 'Email link code',
  autoComplete: 'off',
}

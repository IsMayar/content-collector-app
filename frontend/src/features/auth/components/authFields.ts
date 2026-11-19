import type { FieldDefinition } from '@/shared/components/FormFields'

export const email: FieldDefinition = {
  name: 'email',
  label: 'Email address',
  type: 'email',
  autoComplete: 'email',
  placeholder: 'Enter your email address',
}

export const password: FieldDefinition = {
  name: 'password',
  label: 'Password',
  type: 'password',
  autoComplete: 'current-password',
  placeholder: 'Enter your password',
}

export const newPassword: FieldDefinition = {
  ...password,
  label: 'New password',
  autoComplete: 'new-password',
  placeholder: 'Create a strong password',
  hint: 'Use 12–128 characters. No special character rules.',
}

export const confirmPassword: FieldDefinition = {
  name: 'confirmPassword',
  label: 'Confirm password',
  type: 'password',
  autoComplete: 'new-password',
  placeholder: 'Re-enter your password',
}

export const tokenField: FieldDefinition = {
  name: 'token',
  label: 'Email link code',
  autoComplete: 'off',
  placeholder: 'Paste the code from your email',
}

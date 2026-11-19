import { Notice } from '@/shared/components/Feedback'
import type { FieldDefinition } from '@/shared/components/FormFields'
import { apiProblem, errorMessage } from '@/shared/utils/apiError'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { UseFormRegisterReturn } from 'react-hook-form'
import type { z } from 'zod'

function AuthInput({
  field,
  registration,
  error,
}: {
  field: FieldDefinition
  registration: UseFormRegisterReturn
  error?: string
}) {
  const id = useId()
  const [showPassword, setShowPassword] = useState(false)

  const password = field.type === 'password'
  const mail = field.type === 'email'
  const token = field.name === 'token'
  const leftIcon = mail || token

  const inputType = password
    ? showPassword
      ? 'text'
      : 'password'
    : field.type || 'text'

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px]! leading-5 font-semibold text-[#0A1A2F]!"
      >
        {field.label}
      </label>

      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
            {mail ? (
              <Mail size={17} aria-hidden="true" />
            ) : (
              <KeyRound size={17} aria-hidden="true" />
            )}
          </span>
        )}

        <input
          {...registration}
          id={id}
          type={inputType}
          autoComplete={field.autoComplete}
          placeholder={field.placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${id}-error` : field.hint ? `${id}-hint` : undefined
          }
          spellCheck={false}
          className={`block h-11! w-full min-w-0 rounded-lg border bg-white! py-2.5 text-[14px]! leading-5 text-[#0A1A2F]! shadow-none! placeholder:text-slate-400 focus:border-blue-600! focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600/15 disabled:bg-slate-50! disabled:text-slate-500 ${
            error ? 'border-red-400!' : 'border-slate-300!'
          } ${leftIcon ? 'pl-10' : 'pl-3.5'} ${password ? 'pr-11' : 'pr-3.5'}`}
        />

        {password && (
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-1.5 flex w-10 items-center justify-center rounded-md text-slate-500 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-600"
            aria-label={
              showPassword
                ? `Hide ${field.label.toLowerCase()}`
                : `Show ${field.label.toLowerCase()}`
            }
            aria-controls={id}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {field.hint && !error && (
        <p
          id={`${id}-hint`}
          className="mt-1 text-[12px] leading-4 text-slate-500"
        >
          {field.hint}
        </p>
      )}

      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-[12px] leading-4 text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  )
}

export function AuthForm({
  schema,
  fields,
  initialValues = {},
  submitLabel,
  onSubmit,
}: {
  schema: z.ZodType<Record<string, string>, Record<string, string>>
  fields: FieldDefinition[]
  initialValues?: Record<string, string>
  submitLabel: string
  onSubmit: (values: Record<string, string>) => Promise<void>
}) {
  const [problem, setProblem] = useState('')

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    shouldFocusError: true,
  })

  return (
    <form
      className="w-full"
      noValidate
      aria-busy={isSubmitting}
      onSubmit={handleSubmit(async (values) => {
        setProblem('')

        try {
          await onSubmit(values)
          reset()
        } catch (error) {
          const detail = apiProblem(error)

          setProblem(
            detail.code?.startsWith('TOKEN_')
              ? {
                  TOKEN_EXPIRED:
                    'This link has expired. Request a new email to continue.',
                  TOKEN_CONSUMED:
                    'This link has already been used. Request a fresh link.',
                  TOKEN_INVALID:
                    'This link is invalid. Check the link in your email.',
                }[detail.code] || 'This link is no longer available.'
              : errorMessage(error),
          )

          detail.errors?.forEach((field) => {
            if (
              fields.some((candidate) => candidate.name === field.fieldPath)
            ) {
              setError(field.fieldPath, {
                type: 'server',
                message: field.message,
              })
            }
          })
        }
      })}
    >
      {problem && (
        <div className="mb-4">
          <Notice error>{problem}</Notice>
        </div>
      )}

      <fieldset disabled={isSubmitting} className="min-w-0 space-y-3.5">
        {fields.map((field) => (
          <AuthInput
            key={field.name}
            field={field}
            registration={register(field.name)}
            error={errors[field.name]?.message}
          />
        ))}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex h-11! w-full items-center justify-center rounded-lg border-0 bg-[#2563EB]! px-4 text-[14px]! font-semibold text-white! shadow-sm transition-colors hover:bg-[#1D4ED8]! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Please wait…' : submitLabel}
        </button>
      </fieldset>
    </form>
  )
}

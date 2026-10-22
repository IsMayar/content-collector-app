import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@heroui/react'
import type { z } from 'zod'
import { FormField, type FieldDefinition } from '@/components/FormFields'
import { Notice } from '@/components/Feedback'
import { apiProblem, errorMessage } from '@/lib/apiError'

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
      className="auth-form"
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
            if (fields.some((f) => f.name === field.fieldPath))
              setError(field.fieldPath, {
                type: 'server',
                message: field.message,
              })
          })
        }
      })}
    >
      {problem && <Notice error>{problem}</Notice>}
      <fieldset disabled={isSubmitting}>
        {fields.map((field) => (
          <FormField
            key={field.name}
            field={field}
            registration={register(field.name)}
            error={errors[field.name]?.message}
          />
        ))}
        <Button
          className="submit-button"
          type="submit"
          isDisabled={isSubmitting}
        >
          {isSubmitting ? 'Please wait…' : submitLabel}
          <span aria-hidden="true">{isSubmitting ? '…' : '→'}</span>
        </Button>
      </fieldset>
    </form>
  )
}

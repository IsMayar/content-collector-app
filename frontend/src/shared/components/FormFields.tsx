import { Eye, EyeOff, Mail } from 'lucide-react'
import { useId, useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

export interface FieldDefinition {
  name: string
  label: string
  type?: 'email' | 'password' | 'text'
  autoComplete?: string
  hint?: string
}
export function FormField({
  field,
  registration,
  error,
}: {
  field: FieldDefinition
  registration: UseFormRegisterReturn
  error?: string
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  const { label, type = 'text', hint } = field
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-wrap ${type === 'email' ? 'has-input-icon' : ''}`}>
        {type === 'email' && (
          <Mail className="input-icon" size={17} aria-hidden="true" />
        )}
        <input
          {...registration}
          id={id}
          type={type === 'password' && visible ? 'text' : type}
          autoComplete={field.autoComplete}
          aria-invalid={!!error}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        {type === 'password' && (
          <button
            type="button"
            className="password-toggle"
            aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-controls={id}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="form-field-error">
          {error}
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Eye, EyeOff, Mail } from 'lucide-react'
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
  const { name, label, type = 'text', hint } = field
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      <div className={`input-wrap ${type === 'email' ? 'has-input-icon' : ''}`}>
        {type === 'email' && (
          <Mail className="input-icon" size={17} aria-hidden="true" />
        )}
        <input
          {...registration}
          id={name}
          type={type === 'password' && visible ? 'text' : type}
          autoComplete={field.autoComplete}
          aria-invalid={!!error}
          aria-describedby={
            [hint && `${name}-hint`, error && `${name}-error`]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        {type === 'password' && (
          <button
            type="button"
            className="password-toggle"
            aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${name}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="form-field-error">
          {error}
        </p>
      )}
    </div>
  )
}

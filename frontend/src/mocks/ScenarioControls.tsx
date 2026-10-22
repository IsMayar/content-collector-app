import { useState } from 'react'
import { useCommand } from '@/components/ProductUI'
import { ErrorNotice, Field } from '@/components/ProductUI'
export function ScenarioControls() {
  const command = useCommand()
  const [scenario, setScenario] = useState('normal')
  return (
    <details className="scenario-controls">
      <summary>Demo scenarios</summary>
      <p>Development only. Synthetic state resets on full reload.</p>
      <Field label="Scenario">
        <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {[
            'normal',
            'empty',
            'list-failure',
            'quota',
            'read-only',
            'ai-failure',
            'export-failure',
            'conflict',
            'expired-client',
            'grace',
            'limit-reached',
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <button
        className="secondary-button"
        disabled={command.pending}
        onClick={() => void command.run('demo/scenario', { scenario })}
      >
        Apply scenario
      </button>
      <ErrorNotice error={command.error} />
    </details>
  )
}

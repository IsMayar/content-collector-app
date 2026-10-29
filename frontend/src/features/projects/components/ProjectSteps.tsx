export function Steps({ step }: { step: number }) {
  return (
    <ol className="wizard-steps" aria-label="Project creation progress">
      {['Choose a template', 'Project details', 'Review and create'].map(
        (name, index) => (
          <li
            key={name}
            aria-current={step === index + 1 ? 'step' : undefined}
            className={step >= index + 1 ? 'reached' : ''}
          >
            <span>{index + 1}</span>
            <span className="sr-only">{name}</span>
          </li>
        ),
      )}
    </ol>
  )
}

import {
  HeartPulse,
  House,
  Rocket,
  Scale,
  Scissors,
  Utensils,
  Wrench,
  Zap,
} from 'lucide-react'

export function TemplateSymbol({ industry }: { industry: string }) {
  const key = industry.toLowerCase()
  const Icon = key.includes('plumb')
    ? Wrench
    : key.includes('electric')
      ? Zap
      : key.includes('dent')
        ? HeartPulse
        : key.includes('restaurant')
          ? Utensils
          : key.includes('law')
            ? Scale
            : key.includes('estate')
              ? House
              : key.includes('salon')
                ? Scissors
                : Rocket
  return (
    <span className={`template-symbol symbol-${key}`}>
      <Icon size={27} />
    </span>
  )
}

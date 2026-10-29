import { AppWindow, Globe, Smartphone } from 'lucide-react'

export function ProjectSymbol({ type }: { type: string }) {
  const Icon =
    type === 'WEBSITE' ? Globe : type === 'WEB_APP' ? AppWindow : Smartphone
  return (
    <span className={`project-symbol type-${type}`}>
      <Icon size={20} />
    </span>
  )
}

import { FileText, Image, Link2, List, Type, Users } from 'lucide-react'

export function FieldSymbol({ type }: { type: string }) {
  const Icon =
    type === 'IMAGE'
      ? Image
      : type === 'URL'
        ? Link2
        : type === 'REPEATER'
          ? Users
          : type.includes('SELECT')
            ? List
            : type === 'SHORT_TEXT'
              ? Type
              : FileText
  return <Icon size={20} aria-hidden="true" />
}

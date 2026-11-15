import type { ReactNode } from 'react'

type AuthHeadingProps = {
  eyebrow?: string
  title: string
  description?: string
}

export function AuthHeading({ eyebrow, title, description }: AuthHeadingProps) {
  return (
    <header className="mb-5 w-full">
      {eyebrow && (
        <p className=" mb-1.5 text-[11px]! leading-4 font-semibold tracking-[0.08em] text-blue-600! uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="text-center m-0 text-[28px]! leading-[1.18]! font-bold! tracking-[-0.025em] text-[#0A1A2F]! sm:text-[30px]!">
        {title}
      </h1>
      {description && (
        <p className="text-center mb-0 mt-2 text-[14px]! leading-[1.5] text-slate-600!">
          {description}
        </p>
      )}
    </header>
  )
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[400px]">{children}</div>
}

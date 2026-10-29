import { ProjectSymbol } from '@/features/projects/components/ProjectSymbol'
import type { Project } from '@/features/projects/types/project.types'
import { Link } from 'react-router'

/** Compact project identity used by project tables, preserving existing navigation and markup. */
export function ProjectCard({
  project,
  base,
}: {
  project: Project
  base: string
}) {
  return (
    <Link className="table-project" to={`${base}/projects/${project.id}`}>
      <ProjectSymbol type={project.projectType} />
      <strong>{project.title}</strong>
    </Link>
  )
}

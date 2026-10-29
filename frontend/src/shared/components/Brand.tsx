import { Link } from 'react-router'

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Website Content Collector home">
      <span className="brand-mark" aria-hidden="true">
        C
      </span>
      <span className="brand-copy">
        <strong>Content Collector</strong>
        <small>BY AYAANTRIX</small>
      </span>
    </Link>
  )
}

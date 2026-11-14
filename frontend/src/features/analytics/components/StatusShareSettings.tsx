import { apiBaseUrl } from '@/services/api/baseQuery'
import { Notice } from '@/shared/components/Feedback'
import { ErrorNotice, Field, Panel } from '@/shared/components/ProductUI'
import { useCommand } from '@/shared/hooks/useCommand'
import { useState } from 'react'
import { Link } from 'react-router'

import type { Progress } from '@/features/projects/types/project.types'

export function StatusShareSettings({
  root,
  progress,
}: {
  root: string
  progress: Progress
}) {
  const [copied, setCopied] = useState('')
  const command = useCommand()
  const [share, setShare] = useState<{
    shareId: string
    url: string
    fragmentToken?: string | null
  }>()
  const embedUrl = share?.fragmentToken
    ? new URL(
        `status-shares/${share.shareId}/embed`,
        new URL(
          apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`,
          window.location.origin,
        ),
      ).href +
      '#token=' +
      encodeURIComponent(share.fragmentToken)
    : ''
  const embedCode =
    embedUrl && share
      ? `<iframe title="Project status" src="${embedUrl}" loading="lazy"></iframe>\n<a href="${new URL(share.url, window.location.origin).href}" target="_blank" rel="noopener noreferrer">Open status link</a>`
      : ''
  return (
    <Panel title="Counts-only status share">
      <div className="share-layout">
        <div>
          <p>
            Share counts only: no answers, contact details, files, internal
            notes or workspace identity. Use a public-safe alias.
          </p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault()
              const v = new FormData(e.currentTarget)
              const result = await command.run<{
                shareId: string
                url: string
                fragmentToken: string | null
              }>(`${root}/status-shares`, {
                alias: v.get('alias'),
                expiresAt: new Date(String(v.get('expires'))).toISOString(),
                allowedOrigins: String(v.get('origins') || '')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
              if (result) setShare(result)
            }}
          >
            <Field label="Public alias">
              <input
                required
                name="alias"
                maxLength={80}
                placeholder="Project Evergreen"
              />
            </Field>
            <Field label="Share expiry">
              <input
                required
                type="date"
                name="expires"
                defaultValue={new Date(Date.now() + 7 * 864e5)
                  .toISOString()
                  .slice(0, 10)}
              />
            </Field>
            <Field label="Allowed embed origins (one HTTPS origin per line)">
              <textarea
                name="origins"
                placeholder="https://example.com"
                aria-describedby="embed-origin-help"
              />
            </Field>
            <p id="embed-origin-help" className="subtle">
              Exact HTTPS origins only. Leave blank for an ordinary status link
              without iframe embedding. The capability is shown once; store the
              link securely.
            </p>
            <button className="secondary-button" disabled={command.pending}>
              Create counts-only share
            </button>
          </form>
          {share && (
            <div className="inset">
              {share.fragmentToken ? (
                <Link to={share.url}>Open counts-only status link</Link>
              ) : (
                <Notice>
                  This link was already issued. Its capability cannot be shown
                  again; revoke it and create another if needed.
                </Notice>
              )}
              <div className="actions">
                <button
                  className="primary-button"
                  disabled={!share.fragmentToken}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${new URL(share.url, window.location.origin).href}`,
                      )
                      setCopied('Link copied.')
                    } catch {
                      setCopied('Copy unavailable. Use the visible link.')
                    }
                  }}
                >
                  Copy public link
                </button>
                <button
                  className="secondary-button"
                  disabled={!embedUrl}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(embedCode)
                      setCopied('Embed code copied.')
                    } catch {
                      setCopied('Copy unavailable. Select the code below.')
                    }
                  }}
                >
                  Copy embed code
                </button>
              </div>
              <pre className="code-wrap">{embedCode}</pre>
              <button
                className="danger-link"
                onClick={async () => {
                  if (
                    await command.run(
                      `${root}/status-shares/${share.shareId}`,
                      undefined,
                      'DELETE',
                    )
                  )
                    setShare(undefined)
                }}
              >
                Revoke share
              </button>
            </div>
          )}
        </div>
        <section className="counts-preview">
          <h3>Preview (counts only)</h3>
          <div className="report-metrics">
            {[
              ['Total', progress.requiredTotal],
              ['Submitted', progress.submittedRequired],
              ['Approved', progress.approvedRequired],
            ].map(([label, value]) => (
              <article key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
          <Notice>
            This share contains counts only. No project name, client names,
            questions, answers or files are included.
          </Notice>
        </section>
      </div>
      {copied && <Notice>{copied}</Notice>}
      <ErrorNotice error={command.error} />
    </Panel>
  )
}

import { Brand } from '@/shared/components/Brand'
import { Outlet } from 'react-router'
export function ClientLayout() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <span className="subtle">Private project access</span>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="page-container client-container"
      >
        <Outlet />
      </main>
      <footer className="page-container footer">
        A dedicated space for your project materials.
      </footer>
    </>
  )
}

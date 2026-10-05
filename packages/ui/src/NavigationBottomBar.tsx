import { NavLink } from 'react-router'

const items = [
  { to: '/', label: 'Início', icon: HomeIcon },
  { to: '/favoritos', label: 'Favoritos', icon: StarIcon },
  { to: '/entregas', label: 'Entregas', icon: BoxIcon },
  { to: '/mais', label: 'Mais', icon: MoreIcon },
]

export function NavigationBottomBar() {
  return (
    <nav className="grid h-[4.5rem] grid-cols-4 border-t border-white/10 bg-[#12181f] pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 text-xs ${isActive ? 'text-[#f0b429]' : 'text-slate-400'}`
          }
        >
          <item.icon />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17.8 6.6 20.8l1-6.1L3.2 9.4l6.1-.9L12 3Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 8 12 3l9 5-9 5-9-5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 8v8l9 5 9-5V8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </svg>
  )
}

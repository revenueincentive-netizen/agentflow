import { NavLink, useNavigate } from 'react-router-dom'
import { Bot, Plug, Settings, LayoutDashboard, LogOut, Zap, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { clsx } from 'clsx'

const nav = [
  { to: '/dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/templates',  label: 'Agent Templates',  icon: Zap },
  { to: '/agents',     label: 'My Agents',        icon: Bot },
  { to: '/connectors', label: 'Data Connectors',  icon: Plug },
]
const bottom = [{ to: '/settings', label: 'Settings', icon: Settings }]

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <aside className="flex flex-col w-[220px] min-h-screen bg-sidebar text-white border-r border-white/[0.06] flex-shrink-0">

      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight leading-none">AgentFlow</p>
            <p className="text-[10px] text-white/40 mt-0.5 leading-none">Sales Intelligence</p>
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest px-2 mb-2">Workspace</p>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'group flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/90 hover:bg-white/[0.06]'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="flex items-center gap-2.5">
                  <Icon size={15} className={isActive ? 'text-brand-400' : ''} />
                  {label}
                </span>
                {isActive && <ChevronRight size={12} className="text-white/30" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-white/[0.06] pt-3">
        {bottom.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              clsx('flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/90 hover:bg-white/[0.06]')
            }
          >
            <Icon size={15} />{label}
          </NavLink>
        ))}

        {/* User */}
        <div className="mt-2 pt-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2.5 py-1.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <p className="text-[11px] text-white/40 truncate flex-1">{user?.email}</p>
            <button onClick={() => { logout(); navigate('/login') }}
              className="text-white/25 hover:text-white/70 transition-colors" title="Sign out">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

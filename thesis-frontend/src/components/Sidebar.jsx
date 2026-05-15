import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Map,
  Gamepad2,
  ScanSearch,
  Images,
  Waves,
  Battery,
  Activity,
  ScrollText,
} from 'lucide-react'

const NAV_LINKS = [
  { label: 'Dashboard',      path: '/',          icon: LayoutDashboard, end: true },
  { label: 'Map & Navigate', path: '/map',        icon: Map },
  { label: 'Manual Control', path: '/control',    icon: Gamepad2 },
  { label: 'Oil Detection',  path: '/detection',  icon: ScanSearch },
  { label: 'Batch Screening',path: '/screening',  icon: Images },
  { label: 'Cleaning',       path: '/cleaning',   icon: Waves },
  { label: 'Battery',        path: '/battery',    icon: Battery },
  { label: 'Sensors',        path: '/sensors',    icon: Activity },
  { label: 'Logs',           path: '/logs',       icon: ScrollText },
]

export default function Sidebar() {
  return (
    <div
      className={[
        'fixed left-0 top-0 z-50 flex h-screen flex-col',
        'w-56 overflow-hidden',
        'border-r bg-white border-gray-200',
        'dark:bg-gray-900 dark:border-gray-700',
      ].join(' ')}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex h-14 flex-shrink-0 items-center border-b border-gray-200 px-3 dark:border-gray-700">
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-blue-600">
          <img src="/web-icon.svg" alt="AquaDetect" className="h-full w-full" />
        </div>
        <span className="ml-3 text-lg font-bold whitespace-nowrap text-gray-900 dark:text-white">
          AquaDetect
        </span>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-hidden px-2 py-3">
        {NAV_LINKS.map(({ label, path, icon: Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              [
                'mb-1 flex items-center rounded-lg px-3 py-2.5 transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : [
                      'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                      'dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
                    ].join(' '),
              ].join(' ')
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            <span className="ml-3 text-sm font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  )
}

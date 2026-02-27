import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Map,
  Gamepad2,
  ScanSearch,
  Waves,
  Battery,
  Activity,
  ScrollText,
  Moon,
  Sun,
} from 'lucide-react'
import { useApp } from '../context/AppContext'

// ── Navigation link definitions ────────────────────────────────────────────────
const NAV_LINKS = [
  { label: 'Dashboard',     path: '/',          icon: LayoutDashboard, end: true },
  { label: 'Map & Navigate', path: '/map',       icon: Map },
  { label: 'Manual Control', path: '/control',   icon: Gamepad2 },
  { label: 'Oil Detection',  path: '/detection', icon: ScanSearch },
  { label: 'Cleaning',       path: '/cleaning',  icon: Waves },
  { label: 'Battery',        path: '/battery',   icon: Battery },
  { label: 'Sensors',        path: '/sensors',   icon: Activity },
  { label: 'Logs',           path: '/logs',      icon: ScrollText },
]

export default function Sidebar() {
  // Single piece of state: whether the sidebar is hovered / expanded
  const [isHovered, setIsHovered] = useState(false)
  const { theme, toggleTheme } = useApp()

  // Shared classes for the text label next to each icon
  const labelCls = [
    'ml-3 text-sm font-medium whitespace-nowrap transition-all duration-200',
    isHovered ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden',
  ].join(' ')

  return (
    <div
      className={[
        // Positioning & stacking
        'fixed left-0 top-0 z-50 flex h-screen flex-col',
        // Width transition — collapsed 64 px, expanded 224 px (w-56)
        'transition-all duration-300 ease-in-out overflow-hidden',
        isHovered ? 'w-56' : 'w-16',
        // Colours
        'border-r bg-white border-gray-200',
        'dark:bg-gray-900 dark:border-gray-700',
      ].join(' ')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex h-16 flex-shrink-0 items-center border-b border-gray-200 px-3 dark:border-gray-700">
        {/* TODO: Replace with actual logo */}
        {/* <img src="/logo.png" alt="AquaDetect" className="w-8 h-8" /> */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          AD
        </div>

        {/* App name — fades in/out with expansion */}
        <span
          className={[
            'ml-3 text-lg font-bold whitespace-nowrap text-gray-900 dark:text-white',
            'transition-opacity duration-300',
            isHovered ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
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
            // Show browser tooltip with the link name when sidebar is collapsed
            title={isHovered ? undefined : label}
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
            <span className={labelCls}>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Bottom ──────────────────────────────────────────────────────── */}
      <div className="mt-auto border-t border-gray-200 px-2 pb-4 pt-4 dark:border-gray-700">
        <button
          type="button"
          onClick={toggleTheme}
          title={isHovered ? undefined : (theme === 'dark' ? 'Dark Mode' : 'Light Mode')}
          className={[
            'mb-1 flex w-full items-center rounded-lg px-3 py-2.5 transition-colors',
            'text-gray-400 hover:bg-gray-800 hover:text-white',
            'dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
          ].join(' ')}
        >
          {theme === 'dark'
            ? <Moon className="h-5 w-5 flex-shrink-0" />
            : <Sun  className="h-5 w-5 flex-shrink-0" />}
          <span className={labelCls}>
            {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </button>
      </div>
    </div>
  )
}
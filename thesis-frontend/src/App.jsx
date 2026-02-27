import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import AlertBanner from './components/AlertBanner'
import Dashboard from './pages/Dashboard'
import MapControl from './pages/MapControl'
import ManualControl from './pages/ManualControl'
import Detection from './pages/Detection'
import Cleaning from './pages/Cleaning'
import Battery from './pages/Battery'
import Sensors from './pages/Sensors'
import Logs from './pages/Logs'

function App() {
  return (
    // Root layout wrapper. dark: variants activate because AppContext applies
    // the "dark" class to <html> — the universal ancestor for all elements.
    // overflow-hidden prevents a double scrollbar from appearing alongside
    // the fixed sidebar.
    <div className="flex h-screen overflow-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      {/* Fixed sidebar — always 64 px wide in collapsed state */}
      <Sidebar />

      {/* Content area — ml-16 (64 px) offsets the fixed sidebar so nothing
          is hidden beneath it. flex-1 takes all remaining width. */}
      <div className="ml-16 flex flex-1 flex-col overflow-hidden">
        <StatusBar />
        {/* pt-14 offsets the fixed StatusBar (h-14 = 56 px). AlertBanner
            sits in normal flow directly below it, pushing main down
            by however many alerts are active. */}
        <div className="flex flex-1 flex-col overflow-hidden pt-14">
          <AlertBanner />
          <main className="flex-1 overflow-y-auto px-4 pb-4">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/map" element={<MapControl />} />
              <Route path="/control" element={<ManualControl />} />
              <Route path="/detection" element={<Detection />} />
              <Route path="/cleaning" element={<Cleaning />} />
              <Route path="/battery" element={<Battery />} />
              <Route path="/sensors" element={<Sensors />} />
              <Route path="/logs" element={<Logs />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
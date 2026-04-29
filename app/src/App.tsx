import { Routes, Route } from 'react-router'
import DashboardLayout from './components/DashboardLayout'
import Home from './pages/Home'
import Strategies from './pages/Strategies'
import Backtest from './pages/Backtest'
import Risk from './pages/Risk'
import Analytics from './pages/Analytics'
import Terminal from './pages/Terminal'
import Settings from './pages/Settings'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/risk" element={<Risk />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/terminal" element={<Terminal />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DashboardLayout>
      } />
    </Routes>
  )
}

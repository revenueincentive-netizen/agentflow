import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export default function AcceptInvite() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { acceptInvite } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) setError('Missing or invalid invite link.')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await acceptInvite(token, password, fullName || undefined)
      navigate('/agents')
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Something went wrong. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg">
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-ink">AgentFlow</span>
        </div>

        <div className="card p-8">
          <h1 className="text-xl font-bold text-ink mb-1">Join your team</h1>
          <p className="text-sm text-ink-muted mb-6">Set your name and password to activate your account.</p>

          {error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Full name (optional)"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="input"
            />
            <input
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="input"
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="input"
            />
            <button type="submit" disabled={loading || !token} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Activating...' : 'Activate account'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-faint mt-4">
          Already have an account?{' '}
          <a href="/login" className="text-brand-600 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  )
}

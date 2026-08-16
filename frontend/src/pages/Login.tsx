import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const PILLARS = [
  { headline: 'Domain expertise built in', body: 'Agents that know MEDDPICC, pipeline hygiene, comp plans. Not generic AI guessing your business.' },
  { headline: 'Your LLM. Your data. Your rules.', body: 'Plug in OpenAI, Azure, Anthropic, or Google. Data never leaves your control.' },
  { headline: 'Answers in seconds, not reports in hours.', body: 'Pipeline coverage, at-risk deals, deal coaching — one question away.' },
]

export default function Login() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(company, email, password, fullName)
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── Left panel ────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[52%] bg-sidebar relative overflow-hidden px-14 py-12">
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(white 1px,transparent 1px),linear-gradient(90deg,white 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Glow */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-600/20 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-brand-500/10 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">AgentFlow</span>
          </div>

          {/* Hero copy */}
          <div className="my-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              Sales Intelligence Platform
            </div>

            <h1 className="text-[42px] font-extrabold text-white leading-[1.1] tracking-tight mb-4">
              Not a chatbot.<br />
              Not a copilot.<br />
              <span className="bg-gradient-to-r from-brand-400 to-blue-400 bg-clip-text text-transparent">
                Your unfair advantage.
              </span>
            </h1>
            <p className="text-white/50 text-base mb-10 max-w-sm leading-relaxed">
              AI agents built for revenue teams — grounded in your data, powered by your LLM, answering in seconds.
            </p>

            <div className="space-y-4">
              {PILLARS.map(({ headline, body }) => (
                <div key={headline} className="flex gap-3 items-start">
                  <CheckCircle2 size={16} className="text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm font-semibold">{headline}</p>
                    <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/20 text-xs mt-auto">
            Trusted by revenue teams who are done building reports.
          </p>
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-surface-50 px-8 py-12">
        <div className="w-full max-w-[380px] animate-slide-up">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-bold text-ink">AgentFlow</span>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-bold text-ink mb-1">
              {tab === 'login' ? 'Welcome back' : 'Create your workspace'}
            </h2>
            <p className="text-ink-muted text-sm">
              {tab === 'login' ? 'Sign in to your AgentFlow workspace.' : 'Get your first sales agent running in minutes.'}
            </p>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-1 p-1 bg-surface-100 rounded-xl mb-6">
            {(['login', 'register'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  tab === t ? 'bg-white text-ink shadow-card' : 'text-ink-muted hover:text-ink'
                }`}>
                {t === 'login' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {tab === 'register' && (
              <>
                <input required placeholder="Company name" value={company}
                  onChange={e => setCompany(e.target.value)} className="input" />
                <input placeholder="Your name (optional)" value={fullName}
                  onChange={e => setFullName(e.target.value)} className="input" />
              </>
            )}
            <input required type="email" placeholder="Email address" value={email}
              onChange={e => setEmail(e.target.value)} className="input" />
            <input required type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} className="input" />

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Please wait…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {tab === 'login' ? 'Sign in' : 'Get started free'}
                  <ArrowRight size={15} />
                </span>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-ink-faint mt-6">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}

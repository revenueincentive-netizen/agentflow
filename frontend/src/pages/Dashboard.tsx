import { useQuery } from '@tanstack/react-query'
import { Bot, Plug, Zap, ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'

const STEPS = [
  { step: 1, title: 'Add your LLM', desc: 'Plug in your OpenAI, Azure, Anthropic, or Google key.', to: '/settings', cta: 'Go to Settings' },
  { step: 2, title: 'Connect your CRM', desc: 'Give agents access to your live Salesforce or HubSpot pipeline.', to: '/connectors', cta: 'Add connector' },
  { step: 3, title: 'Deploy a sales agent', desc: 'One-click deploy from pre-built templates — domain expertise included.', to: '/templates', cta: 'Browse templates' },
]

export default function Dashboard() {
  const { user } = useAuthStore()
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: () => api.get('/agents').then(r => r.data) })
  const { data: connectors = [] } = useQuery({ queryKey: ['connectors'], queryFn: () => api.get('/connectors').then(r => r.data) })
  const { data: llmConfigs = [] } = useQuery({ queryKey: ['llm-configs'], queryFn: () => api.get('/llm-configs').then(r => r.data) })

  const hasLLM = llmConfigs.length > 0
  const hasCRM = connectors.some((c: any) => c.connector_type === 'crm')
  const hasAgent = agents.length > 0
  const stepDone = [hasLLM, hasCRM, hasAgent]
  const isReady = stepDone.every(Boolean)

  const stats = [
    { label: 'Deployed Agents', value: agents.length, icon: Bot, gradient: 'from-brand-500 to-brand-700', lightBg: 'bg-brand-50', lightText: 'text-brand-600' },
    { label: 'Data Connectors', value: connectors.length, icon: Plug, gradient: 'from-emerald-500 to-teal-600', lightBg: 'bg-emerald-50', lightText: 'text-emerald-600' },
    { label: 'Agent Templates', value: 7, icon: Zap, gradient: 'from-violet-500 to-purple-700', lightBg: 'bg-violet-50', lightText: 'text-violet-600' },
  ]

  return (
    <div className="p-8 max-w-6xl animate-slide-up">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">
          {user?.full_name ? `Good to see you, ${user.full_name.split(' ')[0]}.` : 'Your revenue intelligence hub.'}
        </h1>
        <p className="text-ink-muted text-sm mt-1">Not a chatbot. Not a copilot. Agents that know your pipeline.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, lightBg, lightText }) => (
          <div key={label} className="card p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${lightBg}`}>
              <Icon size={20} className={lightText} />
            </div>
            <div>
              <p className="text-[26px] font-bold text-ink leading-none">{value}</p>
              <p className="text-xs text-ink-muted mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Setup checklist */}
      {!isReady && (
        <div className="card p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-ink">Get your first agent working</h2>
              <p className="text-xs text-ink-muted mt-0.5">{stepDone.filter(Boolean).length} of 3 steps complete</p>
            </div>
            <div className="flex gap-1">
              {stepDone.map((done, i) => (
                <div key={i} className={`h-1.5 w-10 rounded-full transition-all ${done ? 'bg-brand-500' : 'bg-surface-200'}`} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {STEPS.map(({ step, title, desc, to, cta }, i) => {
              const done = stepDone[i]
              return (
                <div key={step} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${done ? 'bg-emerald-50/60 border-emerald-100' : 'bg-surface-50 border-surface-200'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all ${done ? 'bg-emerald-500 text-white' : 'bg-surface-200 text-ink-muted'}`}>
                    {done ? <CheckCircle2 size={16} /> : step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${done ? 'text-emerald-700 line-through opacity-60' : 'text-ink'}`}>{title}</p>
                    <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
                  </div>
                  {!done && (
                    <Link to={to} className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors">
                      {cta} <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Agents */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-ink">Active agents</h2>
        <Link to="/templates" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
          Browse templates <ChevronRight size={14} />
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="card border-dashed p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <Zap size={22} className="text-brand-500" />
          </div>
          <p className="font-semibold text-ink mb-1">No agents deployed yet</p>
          <p className="text-sm text-ink-muted mb-5">Start with a pre-built template — domain expertise included.</p>
          <Link to="/templates" className="btn-primary inline-flex">
            <Zap size={15} /> Browse agent templates
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent: any) => (
            <Link key={agent.id} to="/agents" className="card-hover p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <p className="font-semibold text-ink text-sm leading-tight">{agent.name}</p>
                  <p className="text-[11px] text-ink-faint">{agent.connector_ids?.length ?? 0} connector{agent.connector_ids?.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed">{agent.description ?? 'No description'}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

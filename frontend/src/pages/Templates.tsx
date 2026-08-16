import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart2, Target, PhoneCall, Map, Calculator, TrendingUp, ShieldCheck,
  Plus, Zap, ArrowRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'bar-chart-2': BarChart2, 'target': Target, 'phone-call': PhoneCall,
  'map': Map, 'calculator': Calculator, 'trending-up': TrendingUp, 'shield-check': ShieldCheck,
}

const CATEGORY_CONFIG: Record<string, { label: string; pill: string }> = {
  sales:                { label: 'Sales',                pill: 'bg-brand-50 text-brand-700 border-brand-200'   },
  sales_ops:            { label: 'Sales Ops',            pill: 'bg-violet-50 text-violet-700 border-violet-200' },
  revenue_intelligence: { label: 'Revenue Intelligence', pill: 'bg-amber-50 text-amber-700 border-amber-200'    },
}

const CARD_ACCENT: Record<string, string> = {
  pipeline_analyst:     'from-brand-500 to-brand-700',
  deal_coach:           'from-orange-500 to-rose-600',
  call_prep:            'from-teal-500 to-emerald-600',
  territory_intelligence:'from-violet-500 to-purple-700',
  comp_calculator:      'from-amber-500 to-orange-600',
  win_loss_analyst:     'from-indigo-500 to-blue-700',
  crm_hygiene:          'from-emerald-500 to-teal-700',
}

export default function Templates() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deploying, setDeploying] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/agents/templates').then(r => r.data),
  })
  const { data: connectors = [] } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get('/connectors/').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/agents/', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); navigate('/agents') },
  })

  const handleDeploy = (template: any) => {
    setDeploying(template.id)
    const matchedIds = connectors.filter((c: any) => template.recommended_connectors.includes(c.connector_type)).map((c: any) => c.id)
    createMutation.mutate({ name: template.name, description: template.description, system_prompt: template.system_prompt, connector_ids: matchedIds, settings: template.settings, template_id: template.id })
  }

  const categories = ['all', ...new Set<string>(templates.map((t: any) => t.category))]
  const filtered = activeCategory === 'all' ? templates : templates.filter((t: any) => t.category === activeCategory)

  return (
    <div className="p-8 max-w-6xl animate-slide-up">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">Agent Templates</span>
        </div>
        <h1 className="text-2xl font-bold text-ink mb-1">Domain expertise built in.<br className="hidden sm:block" /> Not prompted in.</h1>
        <p className="text-sm text-ink-muted max-w-lg leading-relaxed">
          Pre-built sales agents grounded in proven methodology. Deploy in one click &mdash; customise for your team. Your LLM, your data, your rules.
        </p>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
              activeCategory === cat
                ? 'bg-ink text-white border-ink shadow-sm'
                : 'bg-white text-ink-muted border-surface-200 hover:border-ink-faint hover:text-ink'
            }`}>
            {cat === 'all' ? 'All agents' : (CATEGORY_CONFIG[cat]?.label ?? cat)}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((template: any) => {
          const Icon = ICON_MAP[template.icon] ?? Zap
          const accent = CARD_ACCENT[template.id] ?? 'from-brand-500 to-brand-700'
          const cat = CATEGORY_CONFIG[template.category]

          return (
            <div key={template.id} className="card flex flex-col overflow-hidden hover:shadow-card-md hover:-translate-y-0.5 transition-all duration-200">
              {/* Accent bar */}
              <div className={`h-1 bg-gradient-to-r ${accent}`} />

              <div className="p-6 flex flex-col flex-1">
                {/* Icon + category */}
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-sm`}>
                    <Icon size={18} className="text-white" />
                  </div>
                  {cat && (
                    <span className={`badge border ${cat.pill} text-[10px]`}>
                      {cat.label}
                    </span>
                  )}
                </div>

                {/* Text */}
                <h3 className="font-bold text-ink text-[15px] mb-1">{template.name}</h3>
                <p className="text-[11px] font-semibold text-ink-muted italic mb-2 leading-snug">"{template.tagline}"</p>
                <p className="text-xs text-ink-muted flex-1 leading-relaxed mb-5">{template.description}</p>

                {/* Connector tags */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {template.recommended_connectors.map((ct: string) => (
                    <span key={ct} className="text-[10px] font-medium bg-surface-100 text-ink-muted px-2 py-0.5 rounded-md">{ct}</span>
                  ))}
                </div>

                {/* CTA */}
                <button onClick={() => handleDeploy(template)}
                  disabled={deploying === template.id && createMutation.isPending}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[.98] disabled:opacity-50 bg-gradient-to-r ${accent} text-white shadow-sm hover:shadow-md`}>
                  {deploying === template.id && createMutation.isPending ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Deploying...</>
                  ) : (
                    <><Plus size={14} /> Deploy agent</>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

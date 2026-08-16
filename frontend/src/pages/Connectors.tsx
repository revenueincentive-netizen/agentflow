import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Plug, Trash2, Upload, Database, FileText, Globe, Share2, BarChart2, X } from 'lucide-react'
import api from '../api/client'
import type { Connector } from '../types'

const TYPES = ['file', 'sql', 'crm', 'sharepoint', 'rest_api', 'powerbi'] as const

const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  file:       { label: 'Files (PDF, Excel, Word)', icon: FileText,  color: 'text-blue-600',   bg: 'bg-blue-50' },
  sql:        { label: 'SQL Database',             icon: Database,  color: 'text-violet-600', bg: 'bg-violet-50' },
  crm:        { label: 'CRM (Salesforce / HubSpot)', icon: Share2,  color: 'text-orange-600', bg: 'bg-orange-50' },
  sharepoint: { label: 'SharePoint / M365',        icon: Globe,     color: 'text-teal-600',   bg: 'bg-teal-50' },
  rest_api:   { label: 'REST API',                 icon: Globe,     color: 'text-pink-600',   bg: 'bg-pink-50' },
  powerbi:    { label: 'Power BI',                 icon: BarChart2, color: 'text-yellow-600', bg: 'bg-yellow-50' },
}

const CRM_CONFIG_HINT: Record<string, string> = {
  salesforce: '{"crm_type":"salesforce","instance_url":"https://your-org.salesforce.com","encrypted_access_token":"<access_token>"}',
  hubspot: '{"crm_type":"hubspot","encrypted_api_key":"<private_app_token>"}',
}

const STATUS_STYLE: Record<string, string> = {
  not_indexed: 'bg-surface-100 text-ink-muted border-surface-200',
  indexing:    'bg-yellow-50 text-yellow-700 border-yellow-200',
  ready:       'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function Connectors() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', connector_type: 'file' as typeof TYPES[number], description: '', config: '{}' })
  const [formError, setFormError] = useState<string | null>(null)

  const { data: connectors = [] } = useQuery<Connector[]>({
    queryKey: ['connectors'],
    queryFn: () => api.get('/connectors/').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/connectors/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      setShowForm(false)
      setFormError(null)
      setForm({ name: '', connector_type: 'file', description: '', config: '{}' })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Failed to create connector'
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/connectors/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connectors'] }),
  })

  const uploadMutation = useMutation({
    mutationFn: ({ connectorId, file }: { connectorId: string; file: File }) => {
      const fd = new FormData(); fd.append('file', file)
      return api.post(`/connectors/${connectorId}/upload/`, fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connectors'] }),
  })

  const selectedType = TYPE_META[form.connector_type]

  return (
    <div className="p-8 max-w-6xl animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Plug size={16} className="text-brand-600" />
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">Data Connectors</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Connected data sources</h1>
          <p className="text-sm text-ink-muted mt-0.5">Ground your agents in live CRM data, files, and databases.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Add connector
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card p-6 mb-8 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-ink">New data connector</h2>
            <button onClick={() => setShowForm(false)} className="text-ink-faint hover:text-ink transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1.5 block">Connector name *</label>
                <input placeholder="e.g. Salesforce Production" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1.5 block">Type</label>
                <select value={form.connector_type}
                  onChange={e => setForm(f => ({ ...f, connector_type: e.target.value as any }))}
                  className="input">
                  {TYPES.map(t => <option key={t} value={t}>{TYPE_META[t]?.label ?? t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1.5 block">Description</label>
                <input placeholder="What data does this connect to?" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" />
              </div>
            </div>
            {form.connector_type !== 'file' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ink-muted">Config JSON</label>
                  {form.connector_type === 'crm' && (
                    <div className="flex gap-2">
                      {(['salesforce', 'hubspot'] as const).map(crm => (
                        <button key={crm} type="button"
                          onClick={() => setForm(f => ({ ...f, config: CRM_CONFIG_HINT[crm] }))}
                          className="text-xs px-2 py-0.5 border border-surface-200 rounded-lg hover:border-brand-400 text-ink-muted capitalize transition-colors">
                          {crm}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea rows={8} value={form.config}
                  onChange={e => setForm(f => ({ ...f, config: e.target.value }))}
                  className="input font-mono text-xs resize-none h-full min-h-[160px]" />
              </div>
            )}
            {form.connector_type === 'file' && (
              <div className="flex items-center justify-center border-2 border-dashed border-surface-200 rounded-2xl p-8 text-center">
                <div>
                  <FileText size={28} className="text-ink-faint mx-auto mb-2" />
                  <p className="text-sm text-ink-muted">Files can be uploaded after creating the connector</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-5 pt-5 border-t border-surface-100">
            <button
              onClick={() => { setFormError(null); createMutation.mutate({ ...form, config: JSON.parse(form.config || '{}') }) }}
              disabled={!form.name || createMutation.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {createMutation.isPending ? 'Adding...' : 'Add connector'}
            </button>
            <button onClick={() => { setShowForm(false); setFormError(null) }} className="btn-secondary">Cancel</button>
          </div>
          {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mt-2">{formError}</p>}
        </div>
      )}

      {/* Empty state */}
      {connectors.length === 0 && !showForm && (
        <div className="card border-dashed p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <Plug size={26} className="text-brand-600" />
          </div>
          <p className="font-semibold text-ink mb-1">No connectors yet</p>
          <p className="text-sm text-ink-muted mb-5 max-w-xs mx-auto">
            Connect your CRM, files, or database to give agents access to live data.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 mx-auto">
            <Plus size={14} /> Add first connector
          </button>
        </div>
      )}

      {/* Connector grid */}
      {connectors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {connectors.map((conn) => {
            const meta = TYPE_META[conn.connector_type] ?? { label: conn.connector_type, icon: Plug, color: 'text-ink-muted', bg: 'bg-surface-100' }
            const Icon = meta.icon
            return (
              <div key={conn.id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                      <Icon size={17} className={meta.color} />
                    </div>
                    <div>
                      <p className="font-semibold text-ink text-sm leading-tight">{conn.name}</p>
                      <p className="text-[11px] text-ink-faint mt-0.5">{meta.label}</p>
                    </div>
                  </div>
                  <button onClick={() => deleteMutation.mutate(conn.id)}
                    className="text-ink-faint hover:text-red-500 transition-colors p-1 -mr-1">
                    <Trash2 size={14} />
                  </button>
                </div>
                {conn.description && (
                  <p className="text-xs text-ink-muted mb-3 line-clamp-2">{conn.description}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_STYLE[conn.rag_status] ?? STATUS_STYLE.not_indexed}`}>
                    {conn.rag_status === 'not_indexed' ? 'Not indexed' : conn.rag_status === 'indexing' ? 'Indexing...' : 'Ready'}
                  </span>
                  {conn.connector_type === 'file' && (
                    <label className="flex items-center gap-1.5 text-xs font-medium text-brand-600 cursor-pointer hover:text-brand-700 transition-colors">
                      <Upload size={13} /> Upload file
                      <input type="file" className="hidden" onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) uploadMutation.mutate({ connectorId: conn.id, file: f })
                      }} />
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

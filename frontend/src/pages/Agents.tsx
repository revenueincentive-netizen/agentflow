import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Bot, MessageSquare, Trash2, Zap, X, ChevronLeft, Pencil, Plug } from 'lucide-react'
import api from '../api/client'
import type { Agent } from '../types'
import ChatWindow from '../components/ChatWindow'

export default function Agents() {
  const qc = useQueryClient()
  const [chatAgent, setChatAgent] = useState<Agent | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', system_prompt: 'You are a helpful AI sales assistant.' })
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [editConnectors, setEditConnectors] = useState<string[]>([])

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents/').then(r => r.data),
  })

  const { data: connectors = [] } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get('/connectors/').then(r => r.data),
  })

  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([])

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/agents/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      setShowForm(false)
      setForm({ name: '', description: '', system_prompt: 'You are a helpful AI sales assistant.' })
      setSelectedConnectors([])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, connector_ids }: { id: string; connector_ids: string[] }) =>
      api.patch(`/agents/${id}`, { connector_ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      setEditAgent(null)
    },
  })

  const openEdit = (agent: Agent) => {
    setEditAgent(agent)
    setEditConnectors(agent.connector_ids ?? [])
  }

  if (chatAgent) {
    return (
      <div className="flex flex-col h-screen bg-surface-50">
        <div className="px-6 py-3 bg-white border-b border-surface-200 flex items-center gap-3 shadow-card">
          <button
            onClick={() => setChatAgent(null)}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <ChevronLeft size={16} /> Back to agents
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatWindow agentId={chatAgent.id} agentName={chatAgent.name} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl animate-slide-up">

      {/* Edit connectors modal */}
      {editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-ink">Edit connectors</h2>
                <p className="text-xs text-ink-muted mt-0.5">{editAgent.name}</p>
              </div>
              <button onClick={() => setEditAgent(null)} className="text-ink-faint hover:text-ink transition-colors">
                <X size={18} />
              </button>
            </div>

            {connectors.length === 0 ? (
              <div className="text-center py-8">
                <Plug size={28} className="text-ink-faint mx-auto mb-3" />
                <p className="text-sm text-ink-muted">No connectors yet.</p>
                <a href="/connectors" className="text-xs text-brand-600 hover:underline mt-1 block">Add a connector &rarr;</a>
              </div>
            ) : (
              <div className="space-y-2 mb-5">
                {connectors.map((c: any) => {
                  const active = editConnectors.includes(c.id)
                  return (
                    <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      active ? 'border-brand-400 bg-brand-50' : 'border-surface-200 hover:border-surface-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => setEditConnectors(s =>
                          active ? s.filter(x => x !== c.id) : [...s, c.id]
                        )}
                        className="accent-brand-600 w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{c.name}</p>
                        <p className="text-[11px] text-ink-faint capitalize">{c.connector_type} &bull; {c.rag_status}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-surface-100">
              <button
                onClick={() => updateMutation.mutate({ id: editAgent.id, connector_ids: editConnectors })}
                disabled={updateMutation.isPending}
                className="btn-primary flex-1"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditAgent(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot size={16} className="text-brand-600" />
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">My Agents</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Deployed agents</h1>
          <p className="text-sm text-ink-muted mt-0.5">Custom agents connected to your data and LLM.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> New agent
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card p-6 mb-8 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-ink">Create custom agent</h2>
            <button onClick={() => setShowForm(false)} className="text-ink-faint hover:text-ink transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1.5 block">Agent name *</label>
                <input
                  placeholder="e.g. Pipeline Analyst"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1.5 block">Description</label>
                <input
                  placeholder="What does this agent do?"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="input"
                />
              </div>
              {connectors.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-ink-muted mb-1.5 block">Data connectors</label>
                  <div className="flex flex-wrap gap-2">
                    {connectors.map((c: any) => {
                      const active = selectedConnectors.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedConnectors(s =>
                            active ? s.filter(x => x !== c.id) : [...s, c.id]
                          )}
                          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                            active
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-ink-muted border-surface-200 hover:border-brand-400'
                          }`}
                        >
                          {c.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted mb-1.5 block">System prompt</label>
              <textarea
                rows={7}
                placeholder="Instructions for the agent..."
                value={form.system_prompt}
                onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                className="input resize-none h-full min-h-[140px]"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5 pt-5 border-t border-surface-100">
            <button
              onClick={() => createMutation.mutate({ ...form, connector_ids: selectedConnectors })}
              disabled={!form.name || createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Creating...' : 'Create agent'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {agents.length === 0 && !showForm && (
        <div className="card border-dashed p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <Bot size={26} className="text-brand-600" />
          </div>
          <p className="font-semibold text-ink mb-1">No agents yet</p>
          <p className="text-sm text-ink-muted mb-5 max-w-xs mx-auto">
            Deploy from a template for instant domain expertise, or build a custom agent from scratch.
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/templates" className="btn-primary flex items-center gap-2">
              <Zap size={14} /> Browse templates
            </a>
            <button onClick={() => setShowForm(true)} className="btn-secondary flex items-center gap-2">
              <Plus size={14} /> Custom agent
            </button>
          </div>
        </div>
      )}

      {/* Agent grid */}
      {agents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="card-hover p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-card flex-shrink-0">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-ink text-sm leading-tight">{agent.name}</p>
                    <p className="text-[11px] text-ink-faint mt-0.5">
                      {agent.connector_ids.length} connector{agent.connector_ids.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(agent)}
                    className="text-ink-faint hover:text-brand-600 transition-colors p-1"
                    title="Edit connectors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(agent.id)}
                    className="text-ink-faint hover:text-red-500 transition-colors p-1 -mr-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-ink-muted line-clamp-2 flex-1 mb-4 leading-relaxed">
                {agent.description || 'No description'}
              </p>
              <button
                onClick={() => setChatAgent(agent)}
                className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors w-full justify-center"
              >
                <MessageSquare size={13} /> Open chat
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

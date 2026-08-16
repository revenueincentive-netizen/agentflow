import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CheckCircle } from 'lucide-react'
import api from '../api/client'
import type { LLMConfig } from '../types'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], needsKey: true },
  { value: 'azure_openai', label: 'Azure OpenAI', models: [], needsKey: true },
  { value: 'azure_foundry', label: 'Microsoft — Azure AI Foundry', models: ['Phi-4', 'Phi-4-mini', 'Meta-Llama-3.1-70B-Instruct', 'Mistral-Large-2411', 'Cohere-command-r-plus-08-2024'], needsKey: true },
  { value: 'anthropic', label: 'Anthropic (Claude)', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'], needsKey: true },
  { value: 'google', label: 'Google (Gemini)', models: ['gemini-1.5-pro', 'gemini-1.5-flash'], needsKey: true },
  { value: 'ollama', label: 'Ollama — Local models (Phi-4, Llama, Mistral)', models: ['phi4', 'phi4-mini', 'llama3.1', 'llama3.2', 'mistral', 'gemma2'], needsKey: false },
]

export default function Settings() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [form, setForm] = useState({ name: '', model: '', api_key: '', is_default: false, extra: '{}' })

  const { data: configs = [] } = useQuery<LLMConfig[]>({
    queryKey: ['llm-configs'],
    queryFn: () => api.get('/llm-configs').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/llm-configs', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['llm-configs'] }); setShowForm(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/llm-configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-configs'] }),
  })

  const selected = PROVIDERS.find(p => p.value === provider)

  return (
    <div className="p-8 max-w-3xl animate-slide-up">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1">Settings</h1>
        <p className="text-sm text-ink-muted">Connect your LLM provider. Your API keys are encrypted before storage and never returned via the API.</p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-700">LLM Providers</h2>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
          <Plus size={16} /> Add provider
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6 space-y-3">
          <h3 className="font-semibold text-ink">New LLM provider</h3>
          <input placeholder="Config name (e.g. GPT-4o Production)" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" />
          <select value={provider} onChange={e => { setProvider(e.target.value); setForm(f => ({ ...f, model: '' })) }}
            className="input">
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {selected && selected.models.length > 0 ? (
            <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} className="input">
              <option value="">Select model</option>
              {selected.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input placeholder="Model / deployment name" value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))} className="input" />
          )}
          {selected?.needsKey && (
            <input type="password" placeholder="API Key" value={form.api_key}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} className="input" />
          )}
          {(provider === 'azure_openai' || provider === 'azure_foundry') && (
            <div>
              <p className="text-xs text-ink-muted mb-1">Extra config JSON (azure_endpoint required)</p>
              <textarea rows={3} value={form.extra} onChange={e => setForm(f => ({ ...f, extra: e.target.value }))}
                placeholder='{"azure_endpoint": "https://...", "api_version": "2024-02-01"}'
                className="input font-mono text-xs resize-none" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer text-ink-muted">
            <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
            Set as default for all agents
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={() => createMutation.mutate({ ...form, provider, extra: JSON.parse(form.extra || '{}') })} className="btn-primary">Save provider</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {configs.map((cfg) => (
          <div key={cfg.id} className="card px-5 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-ink text-sm">{cfg.name}</p>
                {cfg.is_default && (
                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle size={10} /> Default
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted mt-0.5">{cfg.provider} · {cfg.model}</p>
            </div>
            <button onClick={() => deleteMutation.mutate(cfg.id)} className="text-ink-faint hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {configs.length === 0 && (
          <div className="card border-dashed p-8 text-center">
            <p className="text-sm text-ink-muted">No LLM providers configured yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}

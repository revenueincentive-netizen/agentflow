import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CheckCircle, Copy, Check, Users, Cpu } from 'lucide-react'
import api from '../api/client'
import type { LLMConfig } from '../types'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], needsKey: true },
  { value: 'azure_openai', label: 'Azure OpenAI', models: [], needsKey: true },
  { value: 'azure_foundry', label: 'Microsoft — Azure AI Foundry', models: ['Phi-4', 'Phi-4-mini', 'Meta-Llama-3.1-70B-Instruct', 'Mistral-Large-2411', 'Cohere-command-r-plus-08-2024'], needsKey: true },
  { value: 'anthropic', label: 'Anthropic (Claude)', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'], needsKey: true },
  { value: 'google', label: 'Google (Gemini)', models: ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'], needsKey: true },
  { value: 'ollama', label: 'Ollama — Local models (Phi-4, Llama, Mistral)', models: ['phi4', 'phi4-mini', 'llama3.1', 'llama3.2', 'mistral', 'gemma2'], needsKey: false },
]

interface Member { id: string; email: string; full_name: string | null; role: string; is_active: boolean; created_at: string }

function LLMTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [form, setForm] = useState({ name: '', model: '', api_key: '', is_default: false, extra: '{}' })
  const [formError, setFormError] = useState<string | null>(null)

  const { data: configs = [] } = useQuery<LLMConfig[]>({
    queryKey: ['llm-configs'],
    queryFn: () => api.get('/llm-configs/').then(r => r.data),
  })
  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/llm-configs/', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['llm-configs'] }); setShowForm(false); setFormError(null) },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Failed to save provider'
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/llm-configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-configs'] }),
  })
  const selected = PROVIDERS.find(p => p.value === provider)

  return (
    <>
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
          <select value={provider} onChange={e => { setProvider(e.target.value); setForm(f => ({ ...f, model: '' })) }} className="input">
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
            <button onClick={() => { setFormError(null); createMutation.mutate({ ...form, provider, extra: JSON.parse(form.extra || '{}') }) }}
              disabled={createMutation.isPending} className="btn-primary disabled:opacity-50">
              {createMutation.isPending ? 'Saving...' : 'Save provider'}
            </button>
            <button onClick={() => { setShowForm(false); setFormError(null) }} className="btn-secondary">Cancel</button>
          </div>
          {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>}
        </div>
      )}
      <div className="space-y-2">
        {configs.map(cfg => (
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
    </>
  )
}

function TeamTab() {
  const qc = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ['members'],
    queryFn: () => api.get('/auth/members').then(r => r.data),
  })
  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    setInviteLink(null)
    try {
      const { data } = await api.post('/auth/invite', { email: inviteEmail.trim(), role: inviteRole })
      const url = `${window.location.origin}/accept-invite?token=${data.invite_token}`
      setInviteLink(url)
      setInviteEmail('')
    } catch (err: any) {
      setInviteError(err?.response?.data?.detail ?? 'Failed to generate invite')
    } finally {
      setInviting(false)
    }
  }

  const copyLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const ROLE_BADGE: Record<string, string> = {
    owner: 'bg-purple-50 text-purple-700 border-purple-200',
    admin: 'bg-blue-50 text-blue-700 border-blue-200',
    member: 'bg-surface-100 text-ink-muted border-surface-200',
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-700 mb-4">Invite team members</h2>
      <div className="card p-5 mb-6 space-y-3">
        <p className="text-sm text-ink-muted">Enter a colleague's email. They'll receive a link to set their password and join your workspace. The link is valid for 7 days.</p>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            className="input flex-1"
          />
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'member' | 'admin')} className="input w-32">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="btn-primary disabled:opacity-50 whitespace-nowrap">
            {inviting ? 'Generating...' : 'Generate link'}
          </button>
        </div>
        {inviteError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{inviteError}</p>}
        {inviteLink && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <p className="text-xs text-emerald-800 font-mono flex-1 truncate">{inviteLink}</p>
            <button onClick={copyLink} className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium shrink-0">
              {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-gray-700 mb-3">Team members</h2>
      <div className="space-y-2">
        {members.map(m => (
          <div key={m.id} className="card px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                {m.email[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{m.full_name ?? m.email}</p>
                {m.full_name && <p className="text-xs text-ink-muted">{m.email}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge border capitalize ${ROLE_BADGE[m.role] ?? ROLE_BADGE.member}`}>{m.role}</span>
              {!m.is_active && <span className="text-xs text-ink-faint italic">Deactivated</span>}
              {m.role !== 'owner' && m.is_active && (
                <button onClick={() => removeMutation.mutate(m.id)}
                  className="text-ink-faint hover:text-red-500 transition-colors" title="Remove member">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <div className="card border-dashed p-8 text-center">
            <p className="text-sm text-ink-muted">No team members yet. Invite your first colleague above.</p>
          </div>
        )}
      </div>
    </>
  )
}

export default function Settings() {
  const [tab, setTab] = useState<'llm' | 'team'>('llm')

  return (
    <div className="p-8 max-w-3xl animate-slide-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">Settings</h1>
        <p className="text-sm text-ink-muted">Manage your LLM providers and team members.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-200">
        {([['llm', 'LLM Providers', Cpu], ['team', 'Team Members', Users]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {tab === 'llm' ? <LLMTab /> : <TeamTab />}
    </div>
  )
}

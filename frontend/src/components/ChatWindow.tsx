import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Bot, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { Message } from '../types'

interface ChatWindowProps { agentId: string; agentName: string }

export default function ChatWindow({ agentId, agentName }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)

    const token = localStorage.getItem('access_token')
    const baseUrl = import.meta.env.VITE_API_URL ?? ''
    const res = await fetch(`${baseUrl}/api/v1/agents/${agentId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: input, conversation_id: conversationId, stream: true }),
    })
    if (!res.body) { setLoading(false); return }

    let assistantContent = ''
    setMessages(m => [...m, { role: 'assistant', content: '' }])
    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value).split('\n')) {
        if (line.startsWith('data: ')) {
          const text = line.slice(6)
          if (text === '[DONE]') break
          if (text.startsWith('[ERROR]')) {
            const errMsg = text.slice(7).trim()
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: `⚠️ ${errMsg}` }; return u })
            break
          }
          assistantContent += text
          setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: assistantContent }; return u })
        }
      }
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full bg-surface-50">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center gap-3 shadow-card">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
          <Bot size={15} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-ink text-sm leading-tight">{agentName}</p>
          <p className="text-[10px] text-ink-faint">AI Sales Agent</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-ink-muted">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mb-4 shadow-card-md">
              <Bot size={22} className="text-white" />
            </div>
            <p className="font-semibold text-ink mb-1">Ask {agentName} anything</p>
            <p className="text-sm text-ink-muted max-w-xs">
              Try: <span className="italic">"What's our pipeline coverage this quarter?"</span> or <span className="italic">"Which deals are at risk?"</span>
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === 'user'
                ? 'bg-ink text-white'
                : 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm'
            }`}>
              {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
            </div>

            {/* Bubble */}
            <div className={`max-w-[72%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-ink text-white rounded-tr-sm'
                : 'bg-white border border-surface-200 text-ink rounded-tl-sm shadow-card'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                  <ReactMarkdown>{msg.content || '…'}</ReactMarkdown>
                </div>
              ) : msg.content}
            </div>
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Bot size={13} className="text-white" />
            </div>
            <div className="bg-white border border-surface-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-card">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t bg-white">
        <div className="flex gap-3 items-end">
          <textarea rows={1} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Ask your agent… (Enter to send)"
            className="flex-1 resize-none input py-2.5 min-h-[42px] max-h-32"
            style={{ height: 'auto' }}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center hover:shadow-card-md disabled:opacity-40 active:scale-95 transition-all flex-shrink-0">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  )
}

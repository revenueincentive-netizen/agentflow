export interface User {
  id: string
  email: string
  full_name: string | null
  role: string
  tenant_id: string
}

export interface Agent {
  id: string
  name: string
  description: string | null
  system_prompt: string
  connector_ids: string[]
  settings: Record<string, unknown>
  is_active: boolean
  is_public: boolean
}

export interface LLMConfig {
  id: string
  name: string
  provider: 'openai' | 'azure_openai' | 'anthropic' | 'google'
  model: string
  extra: Record<string, unknown>
  is_default: boolean
}

export interface Connector {
  id: string
  name: string
  connector_type: 'file' | 'sql' | 'sharepoint' | 'powerbi' | 'crm' | 'rest_api'
  description: string | null
  is_active: boolean
  rag_status: 'not_indexed' | 'indexing' | 'ready'
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Conversation {
  id: string
  agent_id: string
  messages: Message[]
}

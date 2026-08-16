import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'
import api from '../api/client'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (companyName: string, email: string, password: string, fullName?: string) => Promise<void>
  acceptInvite: (token: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        const me = await api.get('/auth/me')
        set({ user: me.data, isAuthenticated: true })
      },

      register: async (companyName, email, password, fullName) => {
        const { data } = await api.post('/auth/register', {
          company_name: companyName,
          email,
          password,
          full_name: fullName,
        })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        const me = await api.get('/auth/me')
        set({ user: me.data, isAuthenticated: true })
      },

      acceptInvite: async (token, password, fullName) => {
        const { data } = await api.post('/auth/accept-invite', { token, password, full_name: fullName })
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        const me = await api.get('/auth/me')
        set({ user: me.data, isAuthenticated: true })
      },

      logout: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, isAuthenticated: false })
      },

      fetchMe: async () => {
        const { data } = await api.get('/auth/me')
        set({ user: data, isAuthenticated: true })
      },
    }),
    { name: 'auth', partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }) }
  )
)

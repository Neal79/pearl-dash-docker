import { computed, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { updateTheme, type Appearance } from './useAppearance'

// Global theme state
const currentTheme = ref<Appearance>('dark')

export function useThemeVuetify() {
  const vuetifyTheme = useTheme()

  // Initialize theme from existing system
  const initializeTheme = () => {
    if (typeof window === 'undefined') return

    // Get theme from cookie or default to dark
    const savedTheme = getCookie('theme') as Appearance || 'dark'
    currentTheme.value = savedTheme
    updateTheme(savedTheme)
    syncVuetifyTheme(savedTheme)
  }

  // Sync Vuetify theme with our theme system
  const syncVuetifyTheme = (theme: Appearance) => {
    let effectiveTheme = theme
    
    if (theme === 'system') {
      const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
      effectiveTheme = mediaQueryList.matches ? 'dark' : 'light'
    }
    
    vuetifyTheme.global.name.value = effectiveTheme
  }

  // Set theme and persist
  const setTheme = (newTheme: Appearance) => {
    currentTheme.value = newTheme
    updateTheme(newTheme) // Update HTML classes for existing system
    syncVuetifyTheme(newTheme) // Update Vuetify theme
    setCookie('theme', newTheme) // Persist to cookie
  }

  // Toggle between light and dark (skip system for quick toggle)
  const toggleTheme = () => {
    const newTheme = currentTheme.value === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  // Computed properties for easy access
  const isDark = computed(() => {
    if (currentTheme.value === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return currentTheme.value === 'dark'
  })

  const isLight = computed(() => !isDark.value)

  // Watch for system theme changes
  if (typeof window !== 'undefined') {
    const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryList.addEventListener('change', (e) => {
      if (currentTheme.value === 'system') {
        syncVuetifyTheme('system')
      }
    })
  }

  // Auto-initialize
  initializeTheme()

  return {
    currentTheme: computed(() => currentTheme.value),
    isDark,
    isLight,
    setTheme,
    toggleTheme,
    initializeTheme,
  }
}

// Helper functions (copied from useAppearance.ts to avoid circular imports)
const setCookie = (name: string, value: string, days = 365) => {
  if (typeof document === 'undefined') return
  
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`
}

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null
  
  const nameEQ = name + '='
  const ca = document.cookie.split(';')
  
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  
  return null
}
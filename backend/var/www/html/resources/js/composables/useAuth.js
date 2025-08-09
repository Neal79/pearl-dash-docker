import { ref, computed } from 'vue'
import { router } from '@inertiajs/vue3'

// Global auth state
const authToken = ref(null)
const tokenExpiry = ref(null)
const user = ref(null)
const isLoading = ref(false)

export function useAuth() {
  const isAuthenticated = computed(() => !!authToken.value)
  const isTokenExpiring = computed(() => {
    if (!tokenExpiry.value) return false
    const now = Date.now() / 1000
    const expiryTime = tokenExpiry.value
    // Consider token expiring if less than 5 minutes remaining
    return (expiryTime - now) < 300
  })

  /**
   * Fetch JWT token for WebSocket authentication
   */
  const fetchWebSocketToken = async () => {
    if (isLoading.value) {
      console.log('🔄 Token fetch already in progress...')
      return authToken.value
    }

    isLoading.value = true

    try {
      console.log('🔑 Fetching WebSocket JWT token...')
      
      const response = await fetch('/api/auth/token', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        credentials: 'same-origin' // Include session cookies
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('❌ Failed to fetch WebSocket token:', data)
        
        if (response.status === 401) {
          // User is not authenticated - don't auto-redirect, let components handle this
          console.log('🔒 User not authenticated for WebSocket')
          return null
        }
        
        throw new Error(data.message || 'Failed to fetch token')
      }

      if (data.success && data.token) {
        authToken.value = data.token
        tokenExpiry.value = Math.floor(Date.now() / 1000) + data.expires_in
        user.value = data.user
        
        console.log('✅ WebSocket token obtained successfully')
        console.log(`🕐 Token expires in ${data.expires_in} seconds`)
        
        return authToken.value
      } else {
        throw new Error('Invalid token response format')
      }
    } catch (error) {
      console.error('❌ Error fetching WebSocket token:', error)
      authToken.value = null
      tokenExpiry.value = null
      user.value = null
      throw error
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh the current JWT token
   */
  const refreshToken = async () => {
    console.log('🔄 Refreshing JWT token...')
    return fetchWebSocketToken()
  }

  /**
   * Get current valid token, refreshing if necessary
   */
  const getValidToken = async () => {
    // If no token exists, fetch one
    if (!authToken.value) {
      return await fetchWebSocketToken()
    }

    // If token is expiring soon, refresh it
    if (isTokenExpiring.value) {
      console.log('🔄 Token expiring soon, refreshing...')
      return await refreshToken()
    }

    return authToken.value
  }

  /**
   * Clear authentication state
   */
  const clearAuth = () => {
    authToken.value = null
    tokenExpiry.value = null
    user.value = null
    console.log('🧹 Authentication state cleared')
  }

  /**
   * Handle authentication errors
   */
  const handleAuthError = (error) => {
    console.error('🔒 Authentication error:', error)
    clearAuth()
    
    // Optionally redirect to login page
    if (error.message && error.message.includes('401')) {
      router.visit('/login')
    }
  }

  return {
    // State
    authToken: computed(() => authToken.value),
    user: computed(() => user.value),
    isAuthenticated,
    isTokenExpiring,
    isLoading: computed(() => isLoading.value),
    
    // Methods
    fetchWebSocketToken,
    refreshToken,
    getValidToken,
    clearAuth,
    handleAuthError
  }
}
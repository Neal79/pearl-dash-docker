/**
 * API Authentication Composable for SPA Session Auth
 * 
 * Handles CSRF token management and authenticated API requests
 * for the Pearl Dashboard application using Laravel web session authentication.
 */

import { ref } from 'vue'
import axios from 'axios'

const isInitialized = ref(false)
const isInitializing = ref(false)

export function useApiAuth() {
  
  /**
   * Initialize CSRF token for authenticated requests
   */
  const initializeAuth = async (): Promise<boolean> => {
    if (isInitialized.value || isInitializing.value) {
      return isInitialized.value
    }
    
    isInitializing.value = true
    
    try {
      // Get CSRF cookie for session-based authentication
      await axios.get('/sanctum/csrf-cookie')
      isInitialized.value = true
      console.log('✅ Session authentication initialized')
      return true
    } catch (error) {
      console.error('❌ Failed to initialize session authentication:', error)
      isInitialized.value = false
      return false
    } finally {
      isInitializing.value = false
    }
  }
  
  /**
   * Make an authenticated API request with automatic CSRF initialization
   */
  const authenticatedRequest = async <T = any>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
    data?: any,
    config?: any
  ): Promise<T> => {
    // Ensure authentication is initialized
    if (!isInitialized.value) {
      const success = await initializeAuth()
      if (!success) {
        throw new Error('Failed to initialize authentication')
      }
    }
    
    try {
      const response = await axios[method](url, data, {
        withCredentials: true,
        withXSRFToken: true,
        ...config
      })
      return response.data
    } catch (error: any) {
      // If we get 419 (CSRF mismatch), try to reinitialize and retry once
      if (error.response?.status === 419) {
        console.warn('🔄 CSRF token expired, reinitializing...')
        isInitialized.value = false
        const success = await initializeAuth()
        if (success) {
          const retryResponse = await axios[method](url, data, {
            withCredentials: true,
            withXSRFToken: true,
            ...config
          })
          return retryResponse.data
        }
      }
      throw error
    }
  }
  
  /**
   * Convenience methods for common HTTP verbs
   */
  const get = <T = any>(url: string, config?: any) => 
    authenticatedRequest<T>('get', url, undefined, config)
    
  const post = <T = any>(url: string, data?: any, config?: any) => 
    authenticatedRequest<T>('post', url, data, config)
    
  const put = <T = any>(url: string, data?: any, config?: any) => 
    authenticatedRequest<T>('put', url, data, config)
    
  const patch = <T = any>(url: string, data?: any, config?: any) => 
    authenticatedRequest<T>('patch', url, data, config)
    
  const del = <T = any>(url: string, config?: any) => 
    authenticatedRequest<T>('delete', url, undefined, config)
  
  return {
    // State
    isInitialized,
    isInitializing,
    
    // Methods
    initializeAuth,
    authenticatedRequest,
    
    // Convenience methods
    get,
    post,
    put,
    patch,
    delete: del,
  }
}
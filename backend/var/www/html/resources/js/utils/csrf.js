/**
 * CSRF Token Utilities
 * Handles dynamic CSRF token fetching and management
 */

/**
 * Get current CSRF token from meta tag
 */
export function getCurrentCSRFToken() {
  const token = document.querySelector('meta[name="csrf-token"]')
  return token ? token.getAttribute('content') : null
}

/**
 * Fetch fresh CSRF token from server
 */
export async function fetchFreshCSRFToken() {
  try {
    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'same-origin'
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.csrf_token) {
        // Update the meta tag
        const metaTag = document.querySelector('meta[name="csrf-token"]')
        if (metaTag) {
          metaTag.setAttribute('content', data.csrf_token)
        }
        return data.csrf_token
      }
    }
    
    console.warn('Failed to fetch fresh CSRF token')
    return getCurrentCSRFToken()
  } catch (error) {
    console.error('Error fetching CSRF token:', error)
    return getCurrentCSRFToken()
  }
}

/**
 * Get a valid CSRF token (fresh if needed)
 */
export async function getValidCSRFToken() {
  // Try current token first
  let token = getCurrentCSRFToken()
  
  // If no token, fetch a fresh one
  if (!token) {
    token = await fetchFreshCSRFToken()
  }
  
  return token
}

/**
 * Update Axios default headers with fresh CSRF token
 */
export async function updateAxiosCSRFToken() {
  const token = await getValidCSRFToken()
  if (token && window.axios) {
    window.axios.defaults.headers.common['X-CSRF-TOKEN'] = token
  }
  return token
}
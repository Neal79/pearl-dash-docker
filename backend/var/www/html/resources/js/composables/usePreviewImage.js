/**
 * usePreviewImage Composable
 * 
 * Simple composable to integrate with the preview-image-service for efficient
 * cached image delivery. Handles subscription management and provides cached
 * image URLs with configurable refresh rates and secure JWT authentication.
 * 
 * Features:
 * - Auto-subscribe on mount, auto-unsubscribe on unmount
 * - Secure image loading via fetch() + Authorization headers (no JWT exposure in URLs)
 * - Automatic blob URL management for efficient image display
 * - Configurable refresh rate via VITE_PREVIEW_IMAGE_FRONTEND_REFRESH_RATE (default: 10s)
 * - JWT token retry mechanism for page refresh scenarios
 * - Heartbeat system prevents zombie subscriptions (auto-cleanup after 5min of inactivity)
 * - Graceful fallback to direct API if service unavailable
 * - Unique subscriber IDs for proper multi-user support
 * 
 * Usage:
 * const { imageUrl, isSubscribed, error } = usePreviewImage(deviceId, channelId)
 * 
 * @author Pearl Dashboard
 */

import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useAuth } from './useAuth.js'

// Preview image service configuration - use nginx proxy route (no fallback, production-safe)
const PREVIEW_SERVICE_BASE_URL = '/img-cache'
const ENABLE_PREVIEW_SERVICE = true // Set to false to disable preview service entirely

export function usePreviewImage(deviceId, channelId, options = {}) {
  // Configuration
  const {
    clientId = `dashboard_${Math.random().toString(36).substr(2, 9)}`,
    fallbackToDirect = false, // DISABLED - no direct calls in production LAN environment
    autoSubscribe = true
  } = options

  // State
  const subscriberId = ref(null)
  const isSubscribed = ref(false)
  const error = ref(null)
  const serviceAvailable = ref(true)
  const imageRefreshInterval = ref(null)
  const imageRefreshTrigger = ref(Date.now())
  const refreshRate = (parseInt(import.meta.env.VITE_PREVIEW_IMAGE_FRONTEND_REFRESH_RATE) || 10) * 1000 // Convert seconds to milliseconds, default 10 seconds
  
  // Blob URL management for secure image loading
  const currentBlobUrl = ref(null)
  const isFetchingImage = ref(false)
  
  // Heartbeat system to prevent zombie subscriptions
  const heartbeatInterval = ref(null)
  const heartbeatRate = 90000 // 90 seconds - less than service timeout (300s)
  
  // JWT Authentication
  const auth = useAuth()
  
  // Track if we need to retry subscription when token becomes available
  const needsTokenRetry = ref(false)
  const tokenRetryDeviceId = ref(null)
  const tokenRetryChannelId = ref(null)

  /**
   * Subscribe to preview images for a device/channel combination
   * CRITICAL: Enhanced error handling for live monitoring reliability
   */
  const subscribe = async (devId, chanId, retryCount = 0) => {
    if (!devId || !chanId) {
      console.log('📸 usePreviewImage: No deviceId or channelId provided')
      return false
    }

    const maxRetries = 1 // Allow one retry for auth failures

    try {
      // Get valid JWT token for authentication
      const token = await auth.getValidToken()
      if (!token) {
        console.error('📸 CRITICAL: No JWT token available for subscription - auth system may be down')
        serviceAvailable.value = false
        
        // Set up retry for when token becomes available
        needsTokenRetry.value = true
        tokenRetryDeviceId.value = devId
        tokenRetryChannelId.value = chanId
        
        error.value = 'Subscription failed - no valid authentication token'
        return false
      }
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
      
      const response = await fetch(`${PREVIEW_SERVICE_BASE_URL}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: parseInt(devId),
          channelId: parseInt(chanId),
          clientId: clientId
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      // CRITICAL: Handle 401 errors in subscription with retry
      if (response.status === 401) {
        console.warn(`📸 SUBSCRIPTION AUTHENTICATION FAILED (401) - attempt ${retryCount + 1}/${maxRetries + 1}`)
        
        if (retryCount < maxRetries) {
          console.log('📸 Attempting subscription token refresh and retry...')
          
          // Force token refresh
          auth.clearAuth()
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Recursive retry
          return await subscribe(devId, chanId, retryCount + 1)
        } else {
          console.error('📸 CRITICAL: Subscription max retries exceeded - auth system failure')
          serviceAvailable.value = false
          error.value = 'Subscription authentication failed after retry'
          return false
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.success) {
        subscriberId.value = data.subscriberId
        isSubscribed.value = true
        error.value = null
        serviceAvailable.value = true
        
        // Clear retry flags since subscription was successful
        needsTokenRetry.value = false
        tokenRetryDeviceId.value = null
        tokenRetryChannelId.value = null
        
        // Start automatic image refresh and heartbeat
        startImageRefresh()
        startHeartbeat()
        
        console.log(`📸 usePreviewImage: Subscribed to device ${devId} channel ${chanId}`)
        console.log(`📸 Subscriber ID: ${subscriberId.value}`)
        console.log(`📸 Total subscribers: ${data.subscriberCount}`)
        
        // Give the service a moment to fetch the first image, then trigger secure refresh retries
        // This helps with initial image loading after subscription
        const retryDelays = [1000, 3000, 5000] // Retry after 1s, 3s, and 5s
        retryDelays.forEach((delay) => {
          setTimeout(() => {
            if (isSubscribed.value) {
              refreshSecureImage()
              console.log(`📸 Triggered secure image refresh retry after ${delay}ms`)
            }
          }, delay)
        })
        
        return true
      } else {
        throw new Error(data.message || 'Subscription failed')
      }
    } catch (err) {
      console.error('📸 CRITICAL: Failed to subscribe to preview service:', err.message)
      error.value = `Subscription failed: ${err.message}`
      serviceAvailable.value = false
      return false
    }
  }

  /**
   * Unsubscribe from preview images
   */
  const unsubscribe = async () => {
    if (!subscriberId.value) {
      console.log('📸 usePreviewImage: No active subscription to unsubscribe')
      return true
    }

    try {
      // Get valid JWT token for authentication
      const token = await auth.getValidToken()
      if (!token) {
        console.log('📸 usePreviewImage: No JWT token available for unsubscribe, cleaning up locally')
        // Still reset our state even if unsubscribe fails
        subscriberId.value = null
        isSubscribed.value = false
        stopImageRefresh()
        return false
      }
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout for unsubscribe
      
      const response = await fetch(`${PREVIEW_SERVICE_BASE_URL}/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscriberId: subscriberId.value
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.success) {
        console.log(`📸 usePreviewImage: Unsubscribed ${subscriberId.value}`)
        console.log(`📸 Remaining subscribers: ${data.remainingSubscribers}`)
        if (data.pollingStoppedFor) {
          console.log(`📸 Polling stopped for: ${data.pollingStoppedFor}`)
        }
        
        // Stop image refresh, heartbeat, and clean up blob URL
        stopImageRefresh()
        stopHeartbeat()
        cleanupBlobUrl()
        
        subscriberId.value = null
        isSubscribed.value = false
        error.value = null
        return true
      } else {
        throw new Error(data.message || 'Unsubscribe failed')
      }
    } catch (err) {
      console.warn('📸 usePreviewImage: Failed to unsubscribe:', err.message)
      // Still reset our state and cleanup even if unsubscribe failed
      stopImageRefresh()
      stopHeartbeat()
      cleanupBlobUrl()
      subscriberId.value = null
      isSubscribed.value = false
      return false
    }
  }

  /**
   * Start automatic image refresh interval
   */
  const startImageRefresh = () => {
    // Clear existing interval
    stopImageRefresh()
    
    // Force immediate secure image refresh
    refreshSecureImage()
    
    // Start new refresh interval
    imageRefreshInterval.value = setInterval(() => {
      refreshSecureImage()
      if (import.meta.env.DEV) {
        console.log('📸 Secure image refresh triggered')
      }
    }, refreshRate)
    
    console.log(`📸 Secure image refresh started (${refreshRate}ms interval, configured: ${import.meta.env.VITE_PREVIEW_IMAGE_FRONTEND_REFRESH_RATE || 10}s)`)
  }
  
  /**
   * Stop automatic image refresh interval
   */
  const stopImageRefresh = () => {
    if (imageRefreshInterval.value) {
      clearInterval(imageRefreshInterval.value)
      imageRefreshInterval.value = null
      console.log('📸 Image refresh stopped')
    }
  }

  /**
   * Securely fetch image using Authorization header and return blob URL
   * CRITICAL: Handles 401 errors with token refresh and retry mechanism
   * No silent failures - all auth issues trigger re-establishment
   */
  const fetchSecureImage = async (devId, chanId, retryCount = 0) => {
    if (!serviceAvailable.value || !devId || !chanId || isFetchingImage.value) {
      return null
    }
    
    const maxRetries = 2 // Allow one retry for 401 errors
    
    try {
      isFetchingImage.value = true
      
      // Get valid JWT token - this should refresh if needed
      const token = await auth.getValidToken()
      if (!token) {
        console.error('📸 CRITICAL: No JWT token available for secure image fetch - auth system may be down')
        serviceAvailable.value = false
        
        // For live monitoring, we cannot silently fail - trigger error state
        error.value = 'Authentication failed - no valid token available'
        return null
      }
      
      const baseUrl = `${PREVIEW_SERVICE_BASE_URL}/image/${devId}/${chanId}`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout for image fetch
      
      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'image/*'
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      // CRITICAL: Handle 401 errors with token refresh and retry
      if (response.status === 401) {
        console.warn(`📸 AUTHENTICATION FAILED (401) for image fetch - attempt ${retryCount + 1}/${maxRetries + 1}`)
        
        if (retryCount < maxRetries) {
          console.log('📸 Attempting token refresh and retry...')
          
          // Force token refresh by clearing current token first
          auth.clearAuth()
          
          // Wait a moment before retry to avoid rapid-fire requests
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Recursive retry with fresh token
          return await fetchSecureImage(devId, chanId, retryCount + 1)
        } else {
          // Max retries exceeded - this is critical for live monitoring
          console.error('📸 CRITICAL: Max authentication retries exceeded - subscription may need re-establishment')
          
          // Mark service as unavailable and trigger error state
          serviceAvailable.value = false
          error.value = 'Authentication failed after retry - subscription needs refresh'
          
          // Trigger subscription re-establishment
          await handleAuthFailureRecovery(devId, chanId)
          return null
        }
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      // Convert response to blob
      const blob = await response.blob()
      
      // Clean up old blob URL if it exists
      if (currentBlobUrl.value) {
        URL.revokeObjectURL(currentBlobUrl.value)
        currentBlobUrl.value = null
      }
      
      // Create new blob URL
      const blobUrl = URL.createObjectURL(blob)
      currentBlobUrl.value = blobUrl
      
      return blobUrl
      
    } catch (error) {
      console.warn('📸 Error fetching secure image:', error.message)
      return null
    } finally {
      isFetchingImage.value = false
    }
  }

  /**
   * Clean up blob URL when no longer needed
   */
  const cleanupBlobUrl = () => {
    if (currentBlobUrl.value) {
      URL.revokeObjectURL(currentBlobUrl.value)
      currentBlobUrl.value = null
    }
  }

  /**
   * CRITICAL: Handle authentication failure recovery for live monitoring
   * Re-establishes subscription when auth completely fails
   */
  const handleAuthFailureRecovery = async (devId, chanId) => {
    console.log('📸 CRITICAL: Starting auth failure recovery process...')
    
    try {
      // First, clean up current subscription state
      if (subscriberId.value) {
        console.log('📸 Cleaning up failed subscription before recovery')
        subscriberId.value = null
        isSubscribed.value = false
        stopHeartbeat()
        stopImageRefresh()
        cleanupBlobUrl()
      }
      
      // Wait for potential token refresh in auth system
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Attempt to re-establish subscription
      console.log('📸 Attempting to re-establish subscription after auth failure...')
      const success = await subscribe(devId, chanId)
      
      if (success) {
        console.log('📸 SUCCESS: Subscription re-established after auth failure')
        error.value = null
        serviceAvailable.value = true
      } else {
        console.error('📸 CRITICAL: Failed to re-establish subscription - auth system may be down')
        error.value = 'Failed to recover from authentication failure'
      }
    } catch (recoveryError) {
      console.error('📸 CRITICAL: Auth recovery process failed:', recoveryError)
      error.value = 'Authentication recovery failed'
    }
  }

  /**
   * Send heartbeat to prevent zombie subscription cleanup
   * CRITICAL: Enhanced with 401 error handling and recovery for live monitoring
   */
  const sendHeartbeat = async (retryCount = 0) => {
    if (!subscriberId.value || !isSubscribed.value) {
      return false
    }

    const maxRetries = 1 // Allow one retry for 401 errors

    try {
      const token = await auth.getValidToken()
      if (!token) {
        console.error('📸 CRITICAL: No JWT token available for heartbeat - auth system may be down')
        
        // For live monitoring, auth failures in heartbeat are critical
        error.value = 'Heartbeat authentication failed - no valid token'
        return false
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const response = await fetch(`${PREVIEW_SERVICE_BASE_URL}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscriberId: subscriberId.value
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // CRITICAL: Handle 401 errors in heartbeat with recovery
      if (response.status === 401) {
        console.warn(`📸 HEARTBEAT AUTHENTICATION FAILED (401) - attempt ${retryCount + 1}/${maxRetries + 1}`)
        
        if (retryCount < maxRetries) {
          console.log('📸 Attempting heartbeat token refresh and retry...')
          
          // Force token refresh
          auth.clearAuth()
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Recursive retry
          return await sendHeartbeat(retryCount + 1)
        } else {
          console.error('📸 CRITICAL: Heartbeat max retries exceeded - triggering subscription recovery')
          
          // Extract device/channel for recovery
          const devId = deviceId && typeof deviceId === 'object' && 'value' in deviceId ? deviceId.value : deviceId
          const chanId = channelId && typeof channelId === 'object' && 'value' in channelId ? channelId.value : channelId
          
          if (devId && chanId) {
            // Trigger full recovery in background
            handleAuthFailureRecovery(devId, chanId).catch(err => {
              console.error('📸 CRITICAL: Background auth recovery failed:', err)
            })
          }
          
          return false
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.success) {
        if (import.meta.env.DEV) {
          console.log(`💓 Heartbeat sent successfully for subscriber ${subscriberId.value}`)
        }
        
        // Clear any previous errors since heartbeat succeeded
        if (error.value && error.value.includes('Heartbeat')) {
          error.value = null
        }
        
        return true
      } else {
        throw new Error(data.message || 'Heartbeat failed')
      }
    } catch (err) {
      console.warn('📸 Failed to send heartbeat:', err.message)
      
      // If subscriber not found, we might have been cleaned up as a zombie
      if (err.message.includes('404') || err.message.includes('not found')) {
        console.warn('📸 Subscriber not found on heartbeat - may have been cleaned up as zombie')
        // Reset our state since we're no longer subscribed
        subscriberId.value = null
        isSubscribed.value = false
        stopHeartbeat()
        stopImageRefresh()
        cleanupBlobUrl()
      }
      
      // For live monitoring, set error state for heartbeat failures
      if (!err.message.includes('404')) {
        error.value = `Heartbeat failed: ${err.message}`
      }
      
      return false
    }
  }

  /**
   * Start heartbeat interval to prevent zombie cleanup
   */
  const startHeartbeat = () => {
    if (!subscriberId.value) {
      return
    }

    // Clear any existing heartbeat
    stopHeartbeat()

    // Send immediate heartbeat
    sendHeartbeat()

    // Start regular heartbeat interval
    heartbeatInterval.value = setInterval(() => {
      sendHeartbeat()
    }, heartbeatRate)

    if (import.meta.env.DEV) {
      console.log(`💓 Heartbeat started for subscriber ${subscriberId.value} (every ${heartbeatRate/1000}s)`)
    }
  }

  /**
   * Stop heartbeat interval
   */
  const stopHeartbeat = () => {
    if (heartbeatInterval.value) {
      clearInterval(heartbeatInterval.value)
      heartbeatInterval.value = null
      
      if (import.meta.env.DEV) {
        console.log('💓 Heartbeat stopped')
      }
    }
  }

  /**
   * Get fallback direct API URL (original behavior)
   */
  const getDirectImageUrl = (devId, chanId) => {
    if (!devId || !chanId) return null
    return `/api/devices/${devId}/channels/${chanId}/preview?_=${Date.now()}`
  }

  /**
   * Computed image URL - uses secure blob URLs for cached images
   */
  const imageUrl = computed(() => {
    // If preview service is disabled, return null immediately
    if (!ENABLE_PREVIEW_SERVICE) {
      return null
    }
    
    // If subscribed to service and we have a blob URL, return it
    if (isSubscribed.value && serviceAvailable.value && currentBlobUrl.value) {
      return currentBlobUrl.value
    }
    
    // Fallback to direct API if enabled
    if (fallbackToDirect) {
      const devId = deviceId && typeof deviceId === 'object' && 'value' in deviceId ? deviceId.value : deviceId
      const chanId = channelId && typeof channelId === 'object' && 'value' in channelId ? channelId.value : channelId
      return getDirectImageUrl(devId, chanId)
    }
    
    return null
  })

  /**
   * Trigger secure image fetch when refresh trigger changes
   */
  const refreshSecureImage = async () => {
    if (!isSubscribed.value || !serviceAvailable.value) {
      return
    }

    const devId = deviceId && typeof deviceId === 'object' && 'value' in deviceId ? deviceId.value : deviceId
    const chanId = channelId && typeof channelId === 'object' && 'value' in channelId ? channelId.value : channelId

    if (devId && chanId) {
      await fetchSecureImage(devId, chanId)
      
      if (import.meta.env.DEV) {
        console.log('📸 Secure image refreshed for', devId, chanId)
      }
    }
  }

  /**
   * Check service health
   */
  const checkServiceHealth = async () => {
    try {
      // Get valid JWT token for authentication (optional for status endpoint)
      const token = await auth.getValidToken()
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout for health check
      
      const headers = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      const response = await fetch(`${PREVIEW_SERVICE_BASE_URL}/status`, {
        headers,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        serviceAvailable.value = true
        return true
      } else {
        serviceAvailable.value = false
        return false
      }
    } catch (err) {
      serviceAvailable.value = false
      return false
    }
  }

  // Watch for JWT token availability and retry subscription if needed
  watch(() => auth.authToken.value, (newToken, oldToken) => {
    // Only proceed if token just became available and we have a pending retry
    if (!oldToken && newToken && needsTokenRetry.value && tokenRetryDeviceId.value && tokenRetryChannelId.value) {
      console.log('📸 usePreviewImage: JWT token became available, retrying subscription...')
      
      nextTick(async () => {
        try {
          const success = await subscribe(tokenRetryDeviceId.value, tokenRetryChannelId.value)
          if (success) {
            needsTokenRetry.value = false
            tokenRetryDeviceId.value = null
            tokenRetryChannelId.value = null
            console.log('📸 usePreviewImage: Token retry subscription successful!')
          }
        } catch (error) {
          console.warn('📸 usePreviewImage: Token retry subscription failed:', error.message)
        }
      })
    }
  })

  // Watch for deviceId/channelId changes and resubscribe (non-blocking)
  watch([deviceId, channelId], ([newDevId, newChanId], [oldDevId, oldChanId]) => {
    // Extract actual values in case they are refs
    const extractedNewDevId = newDevId && typeof newDevId === 'object' && 'value' in newDevId ? newDevId.value : newDevId
    const extractedNewChanId = newChanId && typeof newChanId === 'object' && 'value' in newChanId ? newChanId.value : newChanId
    const extractedOldDevId = oldDevId && typeof oldDevId === 'object' && 'value' in oldDevId ? oldDevId.value : oldDevId
    const extractedOldChanId = oldChanId && typeof oldChanId === 'object' && 'value' in oldChanId ? oldChanId.value : oldChanId
    
    // Skip if values are the same
    if (extractedNewDevId === extractedOldDevId && extractedNewChanId === extractedOldChanId) return
    
    // Skip if no valid values
    if (!extractedNewDevId || !extractedNewChanId) {
      console.log('📸 usePreviewImage: Watcher - No valid deviceId/channelId:', extractedNewDevId, extractedNewChanId)
      return
    }
    
    console.log(`📸 usePreviewImage: Device/channel changed to ${extractedNewDevId}/${extractedNewChanId}`)
    
    // Special case: If we weren't subscribed before but now have valid values, subscribe
    if (!isSubscribed.value && extractedNewDevId && extractedNewChanId && autoSubscribe) {
      console.log('📸 usePreviewImage: Was not subscribed, subscribing now to:', extractedNewDevId, extractedNewChanId)
    }
    
    // Perform async operations in nextTick to avoid blocking
    nextTick(async () => {
      try {
        // Unsubscribe from old subscription (this will also stop refresh)
        if (isSubscribed.value) {
          await unsubscribe()
        }
        
        // Subscribe to new device/channel if auto-subscribe enabled
        if (autoSubscribe) {
          await subscribe(extractedNewDevId, extractedNewChanId)
        }
      } catch (error) {
        console.warn('📸 Error handling device/channel change:', error.message)
        serviceAvailable.value = false
      }
    })
  }, { immediate: false })

  // Lifecycle management (non-blocking)
  onMounted(() => {
    if (import.meta.env.DEV) {
      console.log('📸 usePreviewImage: Mounted')
    }
    
    // Skip initialization if service is disabled
    if (!ENABLE_PREVIEW_SERVICE) {
      serviceAvailable.value = false
      return
    }
    
    // Perform async operations in nextTick to avoid blocking mount
    nextTick(async () => {
      try {
        // Check service availability
        await checkServiceHealth()
        
        // Auto-subscribe if enabled and we have valid device/channel
        if (autoSubscribe) {
          const devId = deviceId && typeof deviceId === 'object' && 'value' in deviceId ? deviceId.value : deviceId
          const chanId = channelId && typeof channelId === 'object' && 'value' in channelId ? channelId.value : channelId
          
          console.log('📸 onMounted - devId:', devId, 'chanId:', chanId, 'autoSubscribe:', autoSubscribe)
          
          if (devId && chanId) {
            console.log('📸 onMounted - Subscribing to', devId, chanId)
            await subscribe(devId, chanId)
          } else {
            console.log('📸 onMounted - No valid deviceId/channelId, skipping subscription')
          }
        }
      } catch (error) {
        console.warn('📸 Error during mount initialization:', error.message)
        serviceAvailable.value = false
      }
    })
  })

  onBeforeUnmount(() => {
    if (import.meta.env.DEV) {
      console.log('📸 usePreviewImage: Unmounting')
    }
    
    // Clean up subscription, refresh interval, heartbeat, and blob URLs (non-blocking)
    stopImageRefresh()
    stopHeartbeat()
    cleanupBlobUrl()
    
    if (isSubscribed.value) {
      // Unsubscribe in background without blocking unmount
      unsubscribe().catch(error => {
        console.warn('📸 Error during unmount unsubscribe:', error.message)
      })
    }
  })

  return {
    // State
    imageUrl,                    // Secure blob URL for image display
    isSubscribed,
    error,
    serviceAvailable,
    subscriberId,
    needsTokenRetry: computed(() => needsTokenRetry.value),
    isFetchingImage: computed(() => isFetchingImage.value),
    
    // Methods
    subscribe: () => subscribe(
      typeof deviceId === 'function' ? deviceId.value : deviceId,
      typeof channelId === 'function' ? channelId.value : channelId
    ),
    unsubscribe,
    checkServiceHealth,
    refreshSecureImage,          // Manual secure image refresh
    getDirectImageUrl,           // Fallback method
    cleanupBlobUrl              // Manual cleanup (usually automatic)
  }
}
import { ref, watch, computed, type Ref } from 'vue'
import { useApiAuth } from './useApiAuth'
import { useRealTimeData } from './useRealTimeData'
import { usePolling } from './usePolling'

/**
 * Enhanced Publisher Control with Real-Time WebSocket Updates
 * 
 * This composable replaces the HTTP polling approach with WebSocket real-time updates
 * while maintaining backward compatibility and fallback strategies.
 * 
 * Architecture:
 * 1. Primary: WebSocket real-time updates (sub-second latency)
 * 2. Fallback: HTTP polling (existing system)
 * 3. Hybrid: Uses both during connection issues
 * 
 * Performance Benefits:
 * - Sub-second response times vs 1-6 second HTTP polling
 * - Reduced server load (no continuous polling)
 * - Real-time change detection and push updates
 * - Automatic fallback ensures reliability
 */

interface PublisherStatus {
  id: string
  name: string
  type: string
  status?: {
    is_configured: boolean
    started: boolean
    state: 'stopped' | 'starting' | 'started' | 'stopping'
  }
}

interface PublisherStatusResponse {
  publishers: PublisherStatus[]
  status: string
  device_id: number
  device_ip: string
  channel: number
  fetched_at: string
  error?: string
}

interface PublisherControlResponse {
  result?: string
  status: string
  device_id: number
  device_ip: string
  channel: number
  action: 'start' | 'stop'
  timestamp: string
  error?: string
}

export function usePublisherControlRT(deviceId: number, channelId: Ref<string | ''>) {
  // State
  const publishers = ref<PublisherStatus[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isControlling = ref(false)
  const lastFetch = ref<Date | null>(null)
  
  // API authentication
  const apiAuth = useApiAuth()
  
  // Real-time WebSocket data subscription
  const {
    data: realtimeData,
    isConnected: wsConnected,
    error: wsError,
    lastUpdated: wsLastUpdated,
    isCachedData,
    refresh: refreshRealtime
  } = useRealTimeData('publisher_status', deviceId, channelId)
  
  // HTTP polling fallback (for when WebSocket is not available)
  const httpFallbackEnabled = ref(false)

  // Fetch publisher name from backend state API
  const fetchPublisherName = async (publisherId: string): Promise<string> => {
    try {
      const response = await apiAuth.get(
        `/api/device-state/devices/${deviceId}/channels/${channelId.value}/publishers/${publisherId}/name`
      )
      
      if (response.status === 'ok') {
        return response.name || `Publisher ${publisherId}`
      } else {
        console.warn(`Failed to fetch name for publisher ${publisherId}:`, response.error)
        return `Publisher ${publisherId}`
      }
    } catch (err: any) {
      console.warn(`Error fetching name for publisher ${publisherId}:`, err.message)
      return `Publisher ${publisherId}`
    }
  }

  // HTTP fallback: Fetch publisher status from backend state API
  const fetchPublisherStatusHTTP = async (): Promise<void> => {
    if (!channelId.value) {
      publishers.value = []
      return
    }

    try {
      loading.value = true
      const url = `/api/device-state/devices/${deviceId}/channels/${channelId.value}/publishers/status`
      const response = await apiAuth.get<PublisherStatusResponse>(url)
      
      if (response.status === 'ok') {
        const publishersWithoutNames = response.publishers || []
        
        // Fetch names for all publishers in parallel
        const publishersWithNames = await Promise.all(
          publishersWithoutNames.map(async (publisher, index) => {
            if (!publisher) {
              return null
            }
            
            try {
              const name = await fetchPublisherName(publisher.id)
              const result: PublisherStatus = {
                ...publisher,
                name,
                type: publisher.type || 'unknown'
              }
              return result
            } catch (error) {
              const result: PublisherStatus = {
                ...publisher,
                name: `Publisher ${publisher.id}`,
                type: 'unknown'
              }
              return result
            }
          })
        ).then(results => results.filter((p): p is PublisherStatus => p !== null))
        
        publishers.value = publishersWithNames
        error.value = null
        lastFetch.value = new Date()
        
        console.log('📡 HTTP fallback: Publisher status updated', {
          device: deviceId,
          channel: channelId.value,
          publishers: publishersWithNames.length
        })
      } else {
        error.value = response.error || 'Failed to fetch publisher status'
        publishers.value = []
      }
    } catch (err: any) {
      console.error('HTTP fallback: Error fetching publisher status:', err)
      error.value = err.response?.data?.error || err.message || 'Network error'
      publishers.value = []
    } finally {
      loading.value = false
    }
  }

  // HTTP polling fallback system
  const { isActive: isFallbackPolling, start: startFallbackPolling, stop: stopFallbackPolling } = usePolling(
    fetchPublisherStatusHTTP,
    {
      interval: 2000, // 2 second fallback polling
      immediate: false,
      onError: (err) => {
        console.error('HTTP fallback polling error:', err)
        error.value = err.message
      }
    }
  )

  // Process real-time WebSocket data
  const processRealtimeData = (data: any) => {
    if (!data || !data.publishers) {
      console.warn('Invalid real-time publisher data received:', data)
      return
    }

    try {
      publishers.value = data.publishers.map((publisher: any) => ({
        id: publisher.id,
        name: publisher.name || `Publisher ${publisher.id}`,
        type: publisher.type || 'unknown',
        status: publisher.status || {
          is_configured: false,
          started: false,
          state: 'stopped'
        }
      }))

      error.value = null
      lastFetch.value = new Date()
      
      console.log('⚡ Real-time: Publisher status updated', {
        device: deviceId,
        channel: channelId.value,
        publishers: publishers.value.length,
        cached: isCachedData.value
      })
    } catch (err: any) {
      console.error('Error processing real-time data:', err)
      error.value = 'Failed to process real-time data'
    }
  }

  // Watch for real-time data changes
  watch(realtimeData, (newData) => {
    if (newData) {
      // Stop HTTP fallback when real-time data is available
      if (httpFallbackEnabled.value) {
        console.log('✅ Real-time data restored, stopping HTTP fallback')
        stopFallbackPolling()
        httpFallbackEnabled.value = false
      }
      
      processRealtimeData(newData)
    }
  })

  // Watch WebSocket connection status
  watch(wsConnected, (connected) => {
    if (!connected && !httpFallbackEnabled.value && channelId.value) {
      // WebSocket disconnected, enable HTTP fallback
      console.log('🔄 WebSocket disconnected, enabling HTTP fallback')
      httpFallbackEnabled.value = true
      startFallbackPolling()
    } else if (connected && httpFallbackEnabled.value) {
      // WebSocket reconnected, disable HTTP fallback
      console.log('✅ WebSocket reconnected, disabling HTTP fallback')
      stopFallbackPolling()
      httpFallbackEnabled.value = false
    }
  })

  // Start all publishers for the channel using backend state API
  const startPublishers = async (): Promise<boolean> => {
    if (!channelId.value || isControlling.value) return false

    isControlling.value = true
    try {
      const response = await apiAuth.post<PublisherControlResponse>(
        `/api/device-state/devices/${deviceId}/channels/${channelId.value}/publishers/control`,
        { action: 'start' }
      )
      
      if (response.status === 'ok') {
        console.log('🚀 Publishers start command sent successfully')
        
        // Trigger backend polling for immediate update
        refreshRealtime()
        
        // Brief loading state for UX feedback
        loading.value = true
        setTimeout(() => {
          loading.value = false
        }, 1000)
        
        return true
      } else {
        error.value = response.error || 'Failed to start publishers'
        return false
      }
    } catch (err: any) {
      console.error('Error starting publishers:', err)
      error.value = err.response?.data?.error || err.message || 'Network error'
      return false
    } finally {
      isControlling.value = false
    }
  }

  // Stop all publishers for the channel using backend state API
  const stopPublishers = async (): Promise<boolean> => {
    if (!channelId.value || isControlling.value) return false

    isControlling.value = true
    try {
      const response = await apiAuth.post<PublisherControlResponse>(
        `/api/device-state/devices/${deviceId}/channels/${channelId.value}/publishers/control`,
        { action: 'stop' }
      )
      
      if (response.status === 'ok') {
        console.log('🛑 Publishers stop command sent successfully')
        
        // Trigger backend polling for immediate update
        refreshRealtime()
        
        // Brief loading state for UX feedback
        loading.value = true
        setTimeout(() => {
          loading.value = false
        }, 1000)
        
        return true
      } else {
        error.value = response.error || 'Failed to stop publishers'
        return false
      }
    } catch (err: any) {
      console.error('Error stopping publishers:', err)
      error.value = err.response?.data?.error || err.message || 'Network error'
      return false
    } finally {
      isControlling.value = false
    }
  }

  // Manual refresh (triggers both real-time and HTTP fallback)
  const refresh = async (): Promise<void> => {
    refreshRealtime()
    
    if (httpFallbackEnabled.value) {
      await fetchPublisherStatusHTTP()
    }
  }

  // Computed values for streaming status
  const isStreaming = ref(false)
  const streamingState = ref<'stopped' | 'starting' | 'started' | 'stopping'>('stopped')

  // Update streaming status based on publishers
  const updateStreamingStatus = () => {
    if (publishers.value.length === 0) {
      isStreaming.value = false
      streamingState.value = 'stopped'
      return
    }

    // Check publisher states
    const hasStartingPublisher = publishers.value.some(p => p.status?.state === 'starting')
    const hasStoppingPublisher = publishers.value.some(p => p.status?.state === 'stopping')
    const allStarted = publishers.value.every(p => p.status?.started === true)
    const allStopped = publishers.value.every(p => p.status?.started === false)

    if (hasStoppingPublisher) {
      streamingState.value = 'stopping'
      isStreaming.value = false
    } else if (hasStartingPublisher) {
      streamingState.value = 'starting'
      isStreaming.value = false
    } else if (allStarted) {
      streamingState.value = 'started'
      isStreaming.value = true
    } else {
      streamingState.value = 'stopped'
      isStreaming.value = false
    }
  }

  // Watch publishers for changes and update streaming status
  watch(publishers, () => {
    updateStreamingStatus()
  }, { deep: true })

  // Watch for channel changes
  watch(channelId, (newChannelId) => {
    if (!newChannelId) {
      // Channel cleared, clean up
      publishers.value = []
      stopFallbackPolling()
      httpFallbackEnabled.value = false
    }
    // Note: WebSocket subscription is handled automatically by useRealTimeData
  })

  // Connection status computed values
  const connectionStatus = computed(() => {
    if (wsConnected.value) {
      return isCachedData.value ? 'connected-cached' : 'connected-live'
    } else if (httpFallbackEnabled.value) {
      return 'fallback-http'
    } else {
      return 'disconnected'
    }
  })

  const connectionDescription = computed(() => {
    switch (connectionStatus.value) {
      case 'connected-live':
        return 'Real-time WebSocket (Live)'
      case 'connected-cached':
        return 'Real-time WebSocket (Cached)'
      case 'fallback-http':
        return 'HTTP Polling Fallback'
      case 'disconnected':
        return 'Disconnected'
      default:
        return 'Unknown'
    }
  })

  return {
    // State
    publishers,
    loading,
    error,
    isControlling,
    lastFetch,
    
    // Computed status
    isStreaming,
    streamingState,
    
    // Connection info
    connectionStatus,
    connectionDescription,
    wsConnected,
    wsError,
    wsLastUpdated,
    httpFallbackEnabled,
    
    // Actions
    startPublishers,
    stopPublishers,
    refresh,
    updateStreamingStatus,
    
    // Legacy compatibility (for existing components)
    fetchPublisherStatus: refresh,
    isPollingActive: computed(() => httpFallbackEnabled.value),
    startPolling: () => {
      if (!wsConnected.value) {
        httpFallbackEnabled.value = true
        startFallbackPolling()
      }
    },
    stopPolling: () => {
      stopFallbackPolling()
      httpFallbackEnabled.value = false
    },
    restartPolling: refresh
  }
}
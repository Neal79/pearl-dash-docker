import { ref, watch, computed, type Ref } from 'vue'
import { useApiAuth } from './useApiAuth'
import { usePolling } from './usePolling'
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

export function usePublisherControl(deviceId: number, channelId: Ref<string | ''>) {
  // State
  const publishers = ref<PublisherStatus[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isControlling = ref(false)
  const lastFetch = ref<Date | null>(null)
  
  // API authentication
  const apiAuth = useApiAuth()

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

  // Fetch publisher status from backend state API and enrich with names
  const fetchPublisherStatus = async (): Promise<void> => {
    if (!channelId.value) {
      console.log(`🔄 [Publisher Control] No channel selected, clearing publishers for device ${deviceId}`)
      publishers.value = []
      return
    }

    console.log(`🔄 [Publisher Control] Fetching publisher status for device ${deviceId}, channel ${channelId.value}`)
    
    try {
      const url = `/api/device-state/devices/${deviceId}/channels/${channelId.value}/publishers/status`
      const response = await apiAuth.get<PublisherStatusResponse>(url)
      
      console.log(`📡 [Publisher Control] API Response:`, response)
      
      if (response.status === 'ok') {
        const publishersWithoutNames = response.publishers || []
        console.log(`📋 [Publisher Control] Found ${publishersWithoutNames.length} publishers:`, publishersWithoutNames)
        
        // Fetch names for all publishers in parallel
        const publishersWithNames = await Promise.all(
          publishersWithoutNames.map(async (publisher, index) => {
            if (!publisher) {
              console.warn(`⚠️ [Publisher Control] Null publisher at index ${index}`)
              return null
            }
            
            console.log(`🏷️ [Publisher Control] Fetching name for publisher ${publisher.id}`)
            
            try {
              const name = await fetchPublisherName(publisher.id)
              const result: PublisherStatus = {
                ...publisher,
                name,
                type: publisher.type || 'unknown' // Ensure type is never null
              }
              console.log(`✅ [Publisher Control] Publisher ${publisher.id} enriched:`, result)
              return result
            } catch (error) {
              console.warn(`⚠️ [Publisher Control] Failed to fetch name for publisher ${publisher.id}:`, error)
              const result: PublisherStatus = {
                ...publisher,
                name: `Publisher ${publisher.id}`,
                type: 'unknown'
              }
              return result
            }
          })
        ).then(results => results.filter((p): p is PublisherStatus => p !== null)) // Remove null results
        
        publishers.value = publishersWithNames
        error.value = null
        lastFetch.value = new Date()
        console.log(`✅ [Publisher Control] Successfully loaded ${publishersWithNames.length} publishers:`, publishersWithNames)
      } else {
        error.value = response.error || 'Failed to fetch publisher status'
        publishers.value = []
        console.error(`❌ [Publisher Control] API error:`, response.error)
      }
    } catch (err: any) {
      console.error('❌ [Publisher Control] Error fetching publisher status:', err)
      error.value = err.response?.data?.error || err.message || 'Network error'
      publishers.value = []
    }
  }

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
        // Immediately fetch updated status (single call, no polling boost)
        await fetchPublisherStatus()
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
        // Immediately fetch updated status (single call, no polling boost)
        await fetchPublisherStatus()
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

  // DISABLED - Continuous polling (using hybrid HTTP initial + WebSocket updates instead)
  const isPollingActive = ref(false)
  const startPolling = () => {
    console.log('🚫 Continuous polling disabled - using hybrid HTTP initial + WebSocket updates')
    // No-op - polling replaced by hybrid HTTP/WebSocket approach
  }
  const stopPolling = () => {
    console.log('🚫 Continuous polling disabled - using hybrid HTTP initial + WebSocket updates')
    // No-op - polling replaced by hybrid HTTP/WebSocket approach
  }
  const restartPolling = () => {
    console.log('🚫 Continuous polling disabled - using hybrid HTTP initial + WebSocket updates')
    // No-op - polling replaced by hybrid HTTP/WebSocket approach
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
      // If not all started (some stopped, some started, or all stopped)
      streamingState.value = 'stopped'
      isStreaming.value = false
    }
  }

  // Watch publishers for changes and update streaming status
  watch(publishers, () => {
    updateStreamingStatus()
  }, { deep: true })

  // Channel change handling (Hybrid mode - HTTP initial fetch handled by parent component)
  watch(channelId, (newChannelId) => {
    if (!newChannelId) {
      publishers.value = []
    }
    // No continuous polling restart needed - parent component handles HTTP initial fetch
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
    
    // Actions
    fetchPublisherStatus,
    startPublishers,
    stopPublishers,
    updateStreamingStatus,
    
    // Polling control
    isPollingActive,
    startPolling,
    stopPolling,
    restartPolling
  }
}
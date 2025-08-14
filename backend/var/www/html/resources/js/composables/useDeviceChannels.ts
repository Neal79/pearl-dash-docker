/**
 * DEVICE CHANNELS COMPOSABLE - HYBRID ARCHITECTURE PATTERN
 * =========================================================
 * 
 * This composable demonstrates the HYBRID HTTP + WEBSOCKET PATTERN used throughout
 * the Pearl Dashboard for optimal user experience with real-time data updates.
 * 
 * HYBRID ARCHITECTURE OVERVIEW:
 * 1. HTTP Initial Load: Immediate data on page load/channel change
 * 2. WebSocket Updates: Real-time updates after initial load
 * 3. Smart Fallback: Graceful degradation when WebSocket unavailable
 * 4. Backend Cache: All data comes from backend cache, not direct device calls
 * 5. One-time Fetch: No continuous polling, WebSocket handles updates
 * 
 * KEY PRINCIPLES:
 * - IMMEDIATE + REALTIME: HTTP for instant UX, WebSocket for live updates
 * - BACKEND CACHE: All data comes from backend state API, not direct device calls
 * - ERROR GRACEFUL: Preserve last known good state on errors
 * - LIFECYCLE CLEAN: Always clean up WebSocket subscriptions on component unmount
 * - REACTIVE: Use Vue reactivity for automatic UI updates
 * 
 * WHEN TO USE THIS PATTERN:
 * - Device configuration data (layouts, presets, settings)
 * - Real-time status data (recording, streaming, encoding)
 * - Health monitoring data (temperatures, storage, network)
 * - Any data that changes over time and needs immediate + live updates
 * 
 * HOW TO ADAPT FOR NEW FEATURES:
 * 1. Copy this file and rename interfaces/functions
 * 2. Update API endpoint URLs for HTTP initial load
 * 3. Add corresponding WebSocket subscription in parent component
 * 4. Modify data transformation logic for both HTTP and WebSocket data
 * 5. Add feature-specific error handling and graceful degradation
 */

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useApiAuth } from './useApiAuth'

export interface Publisher {
  id: string
  name: string
  type: string
  status?: {
    is_configured: boolean
    started: boolean
    state: 'stopped' | 'starting' | 'started' | 'stopping'
  }
  settings?: Record<string, any>
}

export interface ChannelData {
  id: string
  name: string
  publishers?: Publisher[]
  encoders?: any[]
  active_layout?: any
}

export interface DeviceChannelsResponse {
  channels: ChannelData[]
  status: string
  device_id: number
  device_ip: string
  fetched_at: string
  error?: string
}

export function useDeviceChannels(deviceId: number) {
  // State
  const channels = ref<ChannelData[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetch = ref<Date | null>(null)
  
  // Polling control
  let pollingInterval: any = null
  const isPolling = ref(false)
  
  // API authentication
  const apiAuth = useApiAuth()
  
  // HYBRID MODE - HTTP initial load for immediate UX (WebSocket updates handled by parent)
  const fetchChannels = async (force = false, includeStatus = true): Promise<DeviceChannelsResponse | null> => {
    console.log(`🔄 [Device Channels] Fetching initial channel data for device ${deviceId} (hybrid mode)`)
    
    // Avoid redundant calls unless forced
    if (loading.value && !force) return null
    
    loading.value = true
    error.value = null

    try {
      // Use backend state API endpoint (cached data, no direct device polling)
      const url = `/api/device-state/devices/${deviceId}/channels`
      console.log(`📡 [Device Channels] Making API call to: ${url}`)
      
      const data = await apiAuth.get<DeviceChannelsResponse>(url, {
        timeout: 5000, // Faster timeout since it's backend cache, not device
      })
      
      console.log(`📡 [Device Channels] API Response:`, data)
      
      // Handle API response structure
      if (data.status === 'error') {
        throw new Error(data.error || 'Device returned error status')
      }
      
      channels.value = data.channels || []
      lastFetch.value = new Date(data.fetched_at)
      
      console.log(`✅ [Device Channels] Successfully loaded ${channels.value.length} channels for device ${deviceId}:`, channels.value)
      return data
    } catch (e: any) {
      let errorMessage = 'Failed to fetch channels'
      
      if (e.response) {
        // Server responded with error status
        if (e.response.status === 503) {
          errorMessage = 'Device unreachable or offline'
        } else if (e.response.status === 401) {
          errorMessage = 'Authentication failed - check device credentials'
        } else if (e.response.status === 404) {
          errorMessage = 'Device not found'
        } else {
          errorMessage = e.response.data?.error || `Server error (${e.response.status})`
        }
      } else if (e.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout - device may be slow to respond'
      } else if (e.code === 'NETWORK_ERROR' || e.message.includes('Network Error')) {
        errorMessage = 'Network error - check device IP and connectivity'
      } else {
        errorMessage = e.message || 'Unknown error occurred'
      }
      
      error.value = errorMessage
      console.error(`🔌 Failed to fetch initial channels for device ${deviceId}:`, errorMessage, e)
      
      // Keep existing channels on error (graceful degradation)
      // Don't clear channels.value here to maintain last known good state
      
      return null
    } finally {
      loading.value = false
    }
  }
  
  // DISABLED - Lightweight status refresh (using hybrid HTTP initial + WebSocket updates instead)
  const refreshStatus = async (): Promise<boolean> => {
    console.log('🚫 Status refresh disabled - using hybrid HTTP initial + WebSocket updates')
    // No-op - status updates come from WebSocket after initial HTTP load
    return true
  }
  
  // DISABLED - Start background polling (using hybrid HTTP initial + WebSocket updates instead)
  const startPolling = (intervalMs = 2000) => {
    console.log(`🚫 Channel polling disabled - using hybrid HTTP initial + WebSocket updates for device ${deviceId}`)
    // No-op - polling replaced by hybrid HTTP/WebSocket approach
  }
  
  // DISABLED - Stop background polling (using hybrid HTTP initial + WebSocket updates instead)
  const stopPolling = () => {
    console.log('🚫 Channel polling disabled - using hybrid HTTP initial + WebSocket updates')
    // No-op - polling replaced by hybrid HTTP/WebSocket approach
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
      isPolling.value = false
    }
  }
  
  // Find channel by ID
  const findChannel = (channelId: string): ChannelData | undefined => {
    return channels.value.find(ch => ch.id.toString() === channelId)
  }
  
  // Get primary publisher for a channel (usually the first one)
  const getPrimaryPublisher = (channelId: string): Publisher | undefined => {
    const channel = findChannel(channelId)
    return channel?.publishers?.[0]
  }
  
  // Check if a channel is streaming (has active publishers)
  const isChannelStreaming = (channelId: string): boolean => {
    const channel = findChannel(channelId)
    return channel?.publishers?.some(pub => pub.status?.started) || false
  }
  
  // Get channel options for dropdown
  const channelOptions = computed(() => [
    { name: 'Select Channel', value: '' },
    ...channels.value.map(ch => ({
      name: `${ch.name} (${ch.id})`,
      value: ch.id.toString() // ← Ensure consistent STRING type like fallback
    }))
  ])
  
  // Check if we have any channels
  const hasChannels = computed(() => channels.value.length > 0)
  
  // Get connection status based on last fetch
  const connectionStatus = computed(() => {
    if (loading.value) return 'connecting'
    if (error.value) return 'error'
    if (hasChannels.value) return 'connected'
    return 'disconnected'
  })
  
  // HYBRID MODE - Update channels from WebSocket data (for real-time updates)
  const updateChannelsFromWebSocket = (webSocketData: any) => {
    if (webSocketData?.channels && Array.isArray(webSocketData.channels)) {
      console.log(`🔄 [Device Channels] Updating channels from WebSocket for device ${deviceId}:`, webSocketData.channels.length)
      channels.value = webSocketData.channels
      lastFetch.value = new Date(webSocketData.fetched_at)
      error.value = null
    }
  }

  // Auto-cleanup on unmount
  onBeforeUnmount(() => {
    stopPolling()
  })
  
  return {
    // State (return refs, not values)
    channels,
    loading,
    error,
    lastFetch,
    isPolling,
    
    // Computed
    channelOptions,
    hasChannels,
    connectionStatus,
    
    // Actions
    fetchChannels,
    refreshStatus,
    startPolling,
    stopPolling,
    findChannel,
    getPrimaryPublisher,
    isChannelStreaming,
    updateChannelsFromWebSocket,
  }
}
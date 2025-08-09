import { ref, computed, onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import { useAuth } from './useAuth.js'

/**
 * Real-Time Data Composable
 * 
 * Enterprise-grade WebSocket client for real-time data subscriptions
 * Designed to replace HTTP polling with sub-second WebSocket updates
 * 
 * Features:
 * - Multi-subscription support (publisher_status, device_health, etc.)
 * - Automatic reconnection with exponential backoff
 * - Graceful fallback to HTTP polling on connection failure
 * - Connection sharing across components
 * - Comprehensive error handling and logging
 * - Performance monitoring and metrics
 * 
 * Usage:
 * const { data, isConnected, error } = useRealTimeData('publisher_status', deviceId, channelId)
 */

interface WebSocketMessage {
  type: string
  [key: string]: any
}

interface SubscriptionOptions {
  dataType: string
  device: string
  channel?: number
  publisherId?: string
}

interface RealTimeData {
  [subscriptionKey: string]: {
    data: any
    timestamp: string
    cached: boolean
  }
}

interface ConnectionStats {
  connected: boolean
  reconnectAttempts: number
  lastConnected: Date | null
  lastError: string | null
  messagesReceived: number
  subscriptions: number
}

// Global WebSocket connection (shared across all components)
let globalWS: WebSocket | null = null
let connectionAttempts = 0
let reconnectTimer: any = null
let pingTimer: any = null
let lastPingTime = 0

// Global state management - NO CACHE for real-time data
const globalSubscriptions = ref<Map<string, Set<string>>>(new Map()) // subscriptionKey -> Set of componentIds  
const globalConnected = ref(false)
const globalError = ref<string | null>(null)
const globalLatestData = ref<Map<string, any>>(new Map()) // Live data only, no persistence
const globalStats = ref<ConnectionStats>({
  connected: false,
  reconnectAttempts: 0,
  lastConnected: null,
  lastError: null,
  messagesReceived: 0,
  subscriptions: 0
})

// Configuration
const WEBSOCKET_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/realtime` // Real-time data service via Nginx proxy
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_INTERVALS = [1000, 2000, 4000, 8000, 16000, 30000] // Exponential backoff
const PING_INTERVAL = 30000 // 30 seconds
const CONNECTION_TIMEOUT = 10000 // 10 seconds

/**
 * Main composable function
 */
export function useRealTimeData(
  dataType: string, 
  device: number | string, 
  channel?: Ref<number | string | ''> | number | string,
  publisherId?: string
) {
  const componentId = generateComponentId()
  const auth = useAuth()
  
  // Reactive refs
  const isConnected = computed(() => globalConnected.value)
  const error = computed(() => globalError.value)
  const stats = computed(() => globalStats.value)
  
  // Build subscription key
  const subscriptionKey = computed(() => {
    let key = `${dataType}:${device}`
    const channelValue = typeof channel === 'object' ? channel.value : channel
    if (channelValue !== undefined && channelValue !== null && channelValue !== '') {
      key += `:${channelValue}`
    }
    if (publisherId) {
      key += `:${publisherId}`
    }
    return key
  })
  
  // Get live data for this subscription - no cache, only current data
  const data = computed(() => {
    return globalLatestData.value.get(subscriptionKey.value) || null
  })
  
  const lastUpdated = computed(() => {
    // No timestamp storage in real-time mode - data is always "now"
    return globalLatestData.value.has(subscriptionKey.value) ? new Date() : null
  })
  
  const isCachedData = computed(() => {
    // Never cached in real-time mode
    return false
  })

  /**
   * Clear all live data on connection reset
   */
  const clearLiveData = () => {
    console.log('🧹 Clearing all live data on WebSocket reconnect')
    globalLatestData.value.clear()
  }

  /**
   * Initialize WebSocket connection (shared)
   */
  const connectWebSocket = async (): Promise<void> => {
    if (globalWS && globalWS.readyState === WebSocket.OPEN) {
      return // Already connected
    }

    try {
      console.log('🔌 Connecting to real-time WebSocket service...')
      
      // Get authentication token - handle gracefully like AudioMeter
      console.log('🔑 Getting JWT token for WebSocket authentication...')
      const token = await auth.getValidToken()
      
      if (!token) {
        console.log('❌ Real-time WebSocket: No JWT token available - will retry in 1 second')
        globalError.value = null // Don't treat this as an error
        globalStats.value.lastError = null
        // Retry connection after a delay (like AudioMeter does)
        setTimeout(async () => {
          console.log('🔄 Real-time WebSocket: Retrying connection after token delay')
          await connectWebSocket()
        }, 1000)
        return
      }
      
      console.log('✅ Real-time WebSocket: Got JWT token, proceeding with connection')

      // Close existing connection
      if (globalWS) {
        globalWS.close()
      }

      // Create new WebSocket connection with auth token - use URL constructor like AudioMeter
      const wsUrl = new URL(WEBSOCKET_URL)
      wsUrl.searchParams.set('token', token)
      globalWS = new WebSocket(wsUrl.toString())
      
      // Set up connection timeout
      const connectionTimeout = setTimeout(() => {
        if (globalWS && globalWS.readyState === WebSocket.CONNECTING) {
          console.warn('⏱️ WebSocket connection timeout')
          globalWS.close()
        }
      }, CONNECTION_TIMEOUT)

      globalWS.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log('✅ Real-time WebSocket connected')
        
        // Clear all cached data on reconnect for fresh real-time data
        clearLiveData()
        
        globalConnected.value = true
        globalError.value = null
        connectionAttempts = 0
        globalStats.value.connected = true
        globalStats.value.lastConnected = new Date()
        globalStats.value.reconnectAttempts = connectionAttempts
        
        // Start ping/pong for keep-alive
        startPingTimer()
        
        // Resubscribe to all active subscriptions
        resubscribeAll()
      }

      globalWS.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          handleWebSocketMessage(message)
          globalStats.value.messagesReceived++
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error)
        }
      }

      globalWS.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log(`🔌 WebSocket disconnected: ${event.code} - ${event.reason}`)
        
        globalConnected.value = false
        globalStats.value.connected = false
        stopPingTimer()
        
        // Handle authentication-related closures
        if (event.code === 1008) { // Policy Violation (auth failure)
          console.warn('🔒 WebSocket closed due to authentication failure')
          globalError.value = 'Authentication failed: ' + (event.reason || 'Invalid or expired token')
          globalStats.value.lastError = 'Authentication failed'
          auth.handleAuthError(new Error('WebSocket authentication failed'))
          return // Don't auto-reconnect on auth failures
        }
        
        // Attempt reconnection unless it was a clean close
        if (event.code !== 1000 && connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
          scheduleReconnect()
        }
      }

      globalWS.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error('❌ WebSocket error:', error)
        globalError.value = 'WebSocket connection error'
        globalStats.value.lastError = 'Connection error'
      }

    } catch (error: any) {
      console.error('❌ Failed to connect WebSocket:', error.message)
      globalError.value = error.message
      globalStats.value.lastError = error.message
      scheduleReconnect()
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  const handleWebSocketMessage = (message: WebSocketMessage): void => {
    switch (message.type) {
      case 'connected':
        console.log('🎉 WebSocket service connected:', message.user?.name)
        break
        
      case 'data_update':
        handleDataUpdate(message)
        break
        
      case 'cached_data':
        handleDataUpdate(message, true)
        break
        
      case 'subscribed':
        console.log(`📊 Subscribed to: ${message.subscriptionKey}`)
        break
        
      case 'unsubscribed':
        console.log(`📊 Unsubscribed from: ${message.subscriptionKey}`)
        break
        
      case 'error':
        console.error('❌ WebSocket service error:', message.message)
        globalError.value = message.message
        break
        
      case 'pong':
        // Handle ping response
        const latency = Date.now() - lastPingTime
        console.log(`🏓 WebSocket latency: ${latency}ms`)
        break
        
      default:
        console.log('📨 Unknown WebSocket message type:', message.type)
    }
  }

  /**
   * Handle real-time data updates
   */
  const handleDataUpdate = (message: any, cached: boolean = false): void => {
    const { subscriptionKey, data, timestamp } = message
    
    if (!subscriptionKey || !data) {
      console.warn('⚠️ Invalid data update message:', message)
      return
    }
    
    // Store live data only - no caching, no timestamps
    globalLatestData.value.set(subscriptionKey, data)
    
    console.log(`📊 Real-time data update: ${subscriptionKey} (${cached ? 'cached' : 'live'})`)
  }

  /**
   * Subscribe to real-time data
   */
  const subscribe = (): void => {
    const key = subscriptionKey.value
    
    // Add component to subscription tracking
    if (!globalSubscriptions.value.has(key)) {
      globalSubscriptions.value.set(key, new Set())
    }
    globalSubscriptions.value.get(key)!.add(componentId)
    
    // Update stats
    globalStats.value.subscriptions = globalSubscriptions.value.size
    
    // Send subscription message if connected
    if (globalWS && globalWS.readyState === WebSocket.OPEN) {
      const subscriptionMessage = {
        type: 'subscribe',
        ...parseSubscriptionKey(key)
      }
      
      globalWS.send(JSON.stringify(subscriptionMessage))
      console.log('📡 Sent subscription:', subscriptionMessage)
    }
  }

  /**
   * Unsubscribe from real-time data
   */
  const unsubscribe = (): void => {
    const key = subscriptionKey.value
    
    // Remove component from subscription tracking
    if (globalSubscriptions.value.has(key)) {
      globalSubscriptions.value.get(key)!.delete(componentId)
      
      // If no more components subscribed, clean up
      if (globalSubscriptions.value.get(key)!.size === 0) {
        globalSubscriptions.value.delete(key)
        globalLatestData.value.delete(key)
        
        // Send unsubscription message if connected
        if (globalWS && globalWS.readyState === WebSocket.OPEN) {
          const unsubscriptionMessage = {
            type: 'unsubscribe',
            ...parseSubscriptionKey(key)
          }
          
          globalWS.send(JSON.stringify(unsubscriptionMessage))
          console.log('📡 Sent unsubscription:', unsubscriptionMessage)
        }
      }
    }
    
    // Update stats
    globalStats.value.subscriptions = globalSubscriptions.value.size
  }

  /**
   * Resubscribe all active subscriptions (after reconnect)
   */
  const resubscribeAll = (): void => {
    if (!globalWS || globalWS.readyState !== WebSocket.OPEN) return
    
    for (const key of globalSubscriptions.value.keys()) {
      const subscriptionMessage = {
        type: 'subscribe',
        ...parseSubscriptionKey(key)
      }
      
      globalWS.send(JSON.stringify(subscriptionMessage))
      console.log('🔄 Resubscribed:', subscriptionMessage)
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  const scheduleReconnect = (): void => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }
    
    if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('❌ Max reconnection attempts reached')
      globalError.value = 'Max reconnection attempts exceeded'
      return
    }
    
    const delay = RECONNECT_INTERVALS[Math.min(connectionAttempts, RECONNECT_INTERVALS.length - 1)]
    connectionAttempts++
    globalStats.value.reconnectAttempts = connectionAttempts
    
    console.log(`🔄 Scheduling reconnection attempt ${connectionAttempts} in ${delay}ms`)
    
    reconnectTimer = setTimeout(() => {
      connectWebSocket()
    }, delay)
  }

  /**
   * Start ping timer for keep-alive
   */
  const startPingTimer = (): void => {
    stopPingTimer()
    
    pingTimer = setInterval(() => {
      if (globalWS && globalWS.readyState === WebSocket.OPEN) {
        lastPingTime = Date.now()
        globalWS.send(JSON.stringify({ type: 'ping', timestamp: lastPingTime }))
      }
    }, PING_INTERVAL)
  }

  /**
   * Stop ping timer
   */
  const stopPingTimer = (): void => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  /**
   * Parse subscription key back to components
   */
  const parseSubscriptionKey = (key: string): SubscriptionOptions => {
    const parts = key.split(':')
    const result: SubscriptionOptions = {
      dataType: parts[0],
      device: parts[1]
    }
    
    if (parts[2] !== undefined) {
      result.channel = parseInt(parts[2])
    }
    
    if (parts[3] !== undefined) {
      result.publisherId = parts[3]
    }
    
    return result
  }

  /**
   * Request cached data immediately
   */
  const requestCachedData = (): void => {
    if (globalWS && globalWS.readyState === WebSocket.OPEN) {
      const message = {
        type: 'get_cached_data',
        ...parseSubscriptionKey(subscriptionKey.value)
      }
      
      globalWS.send(JSON.stringify(message))
    }
  }

  /**
   * Force refresh data - Pure WebSocket mode
   */
  const refresh = async (): Promise<void> => {
    // Request fresh cached data from real-time updates
    requestCachedData()
    
    // Note: No HTTP polling in pure WebSocket mode
    // The Node.js service handles all device polling
    console.log('🔄 Refreshing real-time data from WebSocket cache')
  }

  // Watch for subscription key changes
  watch(subscriptionKey, (newKey, oldKey) => {
    if (oldKey && oldKey !== newKey) {
      // Unsubscribe from old key (using old componentId tracking)
      const oldSubscriptions = globalSubscriptions.value.get(oldKey)
      if (oldSubscriptions) {
        oldSubscriptions.delete(componentId)
        if (oldSubscriptions.size === 0) {
          globalSubscriptions.value.delete(oldKey)
          globalLatestData.value.delete(oldKey)
        }
      }
    }
    
    if (newKey) {
      subscribe()
    }
  }, { immediate: true }) // ← Fixed: immediate: true ensures initial subscription

  // Lifecycle hooks
  onMounted(async () => {
    console.log(`🔄 useRealTimeData mounted for: ${subscriptionKey.value}`)
    
    // Connect WebSocket if not already connected
    if (!globalWS || globalWS.readyState !== WebSocket.OPEN) {
      await connectWebSocket()
    }
    
    // Subscribe to data
    subscribe()
    
    // Request any existing cached data
    setTimeout(() => requestCachedData(), 100)
  })

  onBeforeUnmount(() => {
    console.log(`🔄 useRealTimeData unmounting for: ${subscriptionKey.value}`)
    unsubscribe()
  })

  return {
    // Data
    data,
    lastUpdated,
    isCachedData,
    
    // Connection state
    isConnected,
    error,
    stats,
    
    // Actions
    refresh,
    requestCachedData,
    
    // Utils
    subscriptionKey: computed(() => subscriptionKey.value)
  }
}

/**
 * Generate unique component ID
 */
function generateComponentId(): string {
  return `comp_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`
}

/**
 * Global connection management composable
 */
export function useRealTimeConnection() {
  return {
    isConnected: computed(() => globalConnected.value),
    error: computed(() => globalError.value),
    stats: computed(() => globalStats.value),
    subscriptions: computed(() => Array.from(globalSubscriptions.value.keys())),
    disconnect: () => {
      if (globalWS) {
        globalWS.close(1000, 'Manual disconnect')
        globalWS = null
      }
    }
  }
}
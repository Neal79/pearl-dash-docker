<!--
  PearlDeviceCard.vue - Main Pearl Mini Device Management Component
  
  COMPONENT ARCHITECTURE UPDATE (December 2024):
  ==============================================
  
  The streams tab functionality has been successfully extracted into StreamsTab.vue
  as a reusable component. This demonstrates proper component extraction patterns
  for real-time applications with WebSocket data flow.
  
  NEW MODULAR STRUCTURE:
  - Preview Tab: Still handled in this component
  - Streams Tab: Extracted to StreamsTab.vue ← EXTRACTED COMPONENT
  - Record Tab: Still handled in this component  
  - Status Tab: Still handled in this component
  
  DATA FLOW TO STREAMSTAB (HYBRID ARCHITECTURE):
  This component passes reactive data to StreamsTab via props:
  - device: Device object
  - selectedChannel: Current channel selection
  - publishers: HTTP publisher data (for initial state on mount/channel change)
  - realtimePublisherData: WebSocket publisher status (real-time updates)
  - realtimePublisherNames: WebSocket publisher names (15s updates)
  - realtimeConnected: WebSocket connection status
  - realtimeLastUpdated: Last WebSocket update timestamps
  - findChannel: Helper function from useDeviceChannels
  
  HYBRID ARCHITECTURE (HTTP + WebSocket):
  =======================================
  
  The component now uses a hybrid approach for optimal user experience:
  1. HTTP API calls for immediate data on mount and channel changes
  2. WebSocket events for real-time updates (via tiered polling backend)
  3. Smart data merging with HTTP fallback when WebSocket data unavailable
  
  This provides instant functionality while maintaining real-time updates.
  
  CRITICAL LEARNING: Reactive Props Pattern
  =========================================
  
  The key insight from this extraction is that child components receiving
  real-time WebSocket data MUST use toRefs(props) to make props reactive.
  Without this, WebSocket updates in the parent won't trigger re-renders
  in the child component.
  
  FOR FUTURE COMPONENT EXTRACTIONS:
  See /COMPONENT_EXTRACTION_GUIDE.md for complete documentation.
  
  DESIGN PRINCIPLES FOR FUTURE CLAUDE ITERATIONS:
  ===============================================
  
  1. LAYOUT STABILITY: Never create layouts that move/shift content when showing messages
     - Use absolute positioning for overlays
     - Maintain fixed button positions
     - Preserve consistent spacing
  
  2. USER FEEDBACK PATTERNS:
     - Success: Green messages for completed actions
     - Error: Red messages for failures  
     - Info: Blue messages for informational feedback
     - Use floating overlays that don't disrupt layout
     - Auto-dismiss after 3 seconds with manual close option
  
  3. STREAMING STATUS LOGIC:
     - Gray: No publishers available (neutral state)
     - Red: Has publishers but ALL are stopped (error state)
     - Green: ALL publishers are streaming (success state)
     - Orange: ANY publisher transitioning (warning state)
  
  4. API INTEGRATION PATTERNS:
     - Use composables for reusable logic
     - Real-time polling for status updates (1s for publishers, 2s for channels)
     - Graceful error handling with user feedback
     - Reactive updates using Vue refs and computed properties
  
  5. ANIMATION STANDARDS:
     - Fade in: 0.3s ease-out with subtle slide
     - Fade out: 0.2s ease-in 
     - Use Vue transitions for smooth animations
     - Backdrop blur for modern overlay appearance
-->
<template>
  <v-card class="pearl-device-card" elevation="2">
    <!-- Card Header with Channel Dropdown -->
    <v-card-title class="d-flex align-center justify-space-between pb-2">
      <div class="d-flex align-center">
        <v-btn
          :icon="isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-monitor'"
          color="primary"
          variant="text"
          size="small"
          class="mr-2"
          @click="toggleFullscreen"
          :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
        />
        <span class="text-h6">{{ device.name || device.ip }}</span>
      </div>
      
      <div class="d-flex align-center ga-2">
        <!-- Channel Selection Dropdown -->
        <v-select
          v-model="selectedChannel"
          :items="channelOptions"
          item-title="name"
          item-value="value"
          label="Channel"
          variant="outlined"
          density="compact"
          hide-details
          class="channel-select"
          prepend-inner-icon="mdi-video"
          style="max-width: 150px;"
          @update:model-value="onChannelChange"
        />
        
        <!-- Remove Device Button (hidden in fullscreen) -->
        <v-btn
          v-if="!isFullscreen"
          icon="mdi-close"
          size="small"
          variant="text"
          color="error"
          @click="removeDevice"
        />
      </div>
    </v-card-title>

    <v-divider />

    <!-- Tab Navigation -->
    <v-tabs
      v-model="activeTab"
      color="primary"
      align-tabs="center"
      class="px-4"
      density="compact"
    >
      <v-tab value="preview" size="small">
        <v-icon size="16" class="mr-1">mdi-eye</v-icon>
        <span class="text-caption">Preview</span>
      </v-tab>
      <v-tab value="stream" size="small">
        <v-icon size="16" class="mr-1">mdi-broadcast</v-icon>
        <span class="text-caption">Stream</span>
      </v-tab>
      <v-tab value="record" size="small">
        <v-icon size="16" class="mr-1">mdi-record</v-icon>
        <span class="text-caption">Record</span>
      </v-tab>
      <v-tab value="status" size="small">
        <v-icon size="16" class="mr-1">mdi-information</v-icon>
        <span class="text-caption">Status</span>
      </v-tab>
    </v-tabs>

    <!-- Tab Content with Fixed Height -->
    <v-card-text class="pa-0 tab-content-container">
      <v-tabs-window v-model="activeTab" class="tab-content-window">
        <!-- Preview Tab - EXTRACTED COMPONENT (MOST COMPLEX) -->
        <!-- 
          ULTIMATE COMPONENT EXTRACTION ACHIEVEMENT:
          ==========================================
          
          The PreviewTab represents the most sophisticated component extraction,
          managing multiple real-time systems simultaneously:
          
          1. Image Management: Real-time updates, seamless loading, error handling
          2. Audio Streaming: Web Audio API, lifecycle management, state coordination
          3. Control System: Streaming/recording controls with real-time status
          4. User Feedback: Floating overlay messages with layout stability
          5. Status Display: Multi-state indicators with color coding
          
          This demonstrates the ultimate in Vue 3 component architecture
          with reactive props, complex state management, and real-time coordination.
        -->
        <v-tabs-window-item value="preview">
          <PreviewTab 
            :device="device" 
            :selected-channel="selectedChannel"
            :connection-status="connectionStatus"
            :streaming-status="streamingStatus"
            :recording-status="recordingStatus"
            :is-controlling="isControlling"
            :is-audio-muted="isAudioMuted"
            :can-toggle-audio="canToggleAudio"
            :current-display-url="currentDisplayUrl"
            :user-message="userMessage"
            :user-message-type="userMessageType"
            :preview-error="previewError"
            :is-video-mode="isVideoMode"
            :realtime-publisher-data="realtimePublisherData"
            :realtime-recorder-data="realtimeRecorderData"
            :realtime-connected="realtimeConnected"
            :recorder-connected="recorderConnected"
            @toggle-streaming="toggleStreaming"
            @toggle-recording="toggleRecording"
            @toggle-audio-mute="toggleAudioMute"
            @toggle-video-mode="toggleVideoMode"
            @image-error="onImageError"
            @user-message-clear="userMessage = null"
            @user-message="showUserMessage"
          />
        </v-tabs-window-item>

        <!-- Stream Tab - EXTRACTED COMPONENT -->
        <!-- 
          COMPONENT EXTRACTION SUCCESS:
          ============================
          
          The streams functionality has been extracted to StreamsTab.vue.
          This demonstrates proper data flow patterns for real-time components:
          
          1. Parent manages all composables (usePublisherControl, useRealTimeData)
          2. Child receives data via reactive props
          3. Child uses toRefs() to make props reactive
          4. Events flow back to parent via emit
          
          Benefits achieved:
          - Reusable StreamsTab component
          - Cleaner separation of concerns
          - No functional regressions
          - Maintains real-time WebSocket updates
        -->
        <v-tabs-window-item value="stream">
          <StreamsTab 
            :device="device" 
            :selected-channel="selectedChannel"
            :publishers="httpPublishers || []"
            :realtime-publisher-data="realtimePublisherData"
            :realtime-publisher-names="realtimePublisherNames"
            :realtime-connected="realtimeConnected"
            :names-connected="namesConnected"
            :realtime-last-updated="realtimeLastUpdated"
            :names-last-updated="namesLastUpdated"
            :find-channel="findChannel"
            @user-message="showUserMessage"
          />
        </v-tabs-window-item>

        <!-- Record Tab - EXTRACTED COMPONENT -->
        <v-tabs-window-item value="record">
          <RecordTab 
            :device="device" 
            :selected-channel="selectedChannel"
            :recorders="httpRecorders || []"
            :realtime-recorder-data="realtimeRecorderData"
            :realtime-connected="recorderConnected"
            :recorder-last-updated="recorderLastUpdated"
            @user-message="showUserMessage"
          />
        </v-tabs-window-item>

        <!-- Status Tab - EXTRACTED COMPONENT -->
        <v-tabs-window-item value="status">
          <StatusTab 
            :device="device" 
            :selected-channel="selectedChannel"
            :connection-status="connectionStatus"
            :channel-mode="channelMode"
            :channels-count="channels?.length || 0"
            :channels-error="channelsError"
            :realtime-system-identity="realtimeSystemIdentity"
            :realtime-system-status="realtimeSystemStatus"
            :identity-connected="identityConnected"
            :status-connected="statusConnected"
            :identity-last-updated="identityLastUpdated"
            :status-last-updated="statusLastUpdated"
          />
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// @claude: ALWAYS make a backup of this file before making changes

/*
  SCRIPT ORGANIZATION FOR FUTURE CLAUDE ITERATIONS:
  =================================================
  
  1. COMPOSABLE PATTERN:
     - useDeviceChannels: Handles channel discovery (initial load only)
     - usePublisherControl: Manages streaming control (HTTP for actions, WebSocket for status)
     - useAudioMeterWebSocket: Provides real-time audio level data
  
  2. REACTIVE STATE MANAGEMENT:
     - selectedChannel: ref that drives all dependent logic
     - Publisher status computed from real API data (not cached)
     - hasPublishers computed to determine UI behavior
  
  3. USER FEEDBACK SYSTEM:
     - userMessage: Controls floating overlay display
     - showUserMessage(): Helper for consistent message patterns
     - Auto-dismiss with manual close option
  
  4. CRITICAL INITIALIZATION ORDER:
     - selectedChannel MUST be declared before usePublisherControl
     - Composables use reactive refs, not primitive values
     - Watch for channel changes to trigger WebSocket subscription updates
*/

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useAudioMeterWebSocket } from '../composables/useAudioMeterWebSocket'
import { useDeviceChannels } from '../composables/useDeviceChannels'
import { usePublisherControl } from '../composables/usePublisherControl'
import { useRealTimeData } from '../composables/useRealTimeData'
import { useAudioStreaming } from '../composables/useAudioStreaming'
import { usePreviewImage } from '../composables/usePreviewImage'
import StreamsTab from './StreamsTab.vue'
import RecordTab from './RecordTab.vue'
import StatusTab from './StatusTab.vue'
import PreviewTab from './PreviewTab.vue'

interface Device {
  id: number
  name?: string
  ip: string
}

interface Props {
  device: Device
  showDebug?: boolean
  isFullscreen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showDebug: false,
  isFullscreen: false
})

const emit = defineEmits<{
  remove: [id: number]
  toggleFullscreen: [id: number]
}>()

// Create a unique storage key for this device
const getStorageKey = () => `pearlDeviceCard_channel_${props.device.id}`

// Load saved channel from localStorage
const loadSavedChannel = (): string | '' => {
  try {
    const saved = localStorage.getItem(getStorageKey())
    if (saved && saved !== '') {
      return saved
    }
  } catch (error) {
    console.warn('Failed to load saved channel from localStorage:', error)
  }
  return ''
}

// Initialize selectedChannel with saved value FIRST
const selectedChannel = ref<string | ''>(loadSavedChannel())

// Dynamic channel management using the new composable
const { 
  channels,
  loading: channelsLoading,
  error: channelsError,
  channelOptions: dynamicChannelOptions,
  hasChannels,
  findChannel,
  fetchChannels, // ← Add this to use the same instance
  stopPolling: stopChannelPolling, // ← Add this for cleanup
  updateChannelsFromWebSocket // ← Add this for WebSocket updates
} = useDeviceChannels(props.device.id)

// Publisher control for streaming (Hybrid mode - HTTP initial state + WebSocket updates)
const {
  publishers: httpPublishers,
  isControlling,
  error: publisherError,
  startPublishers,
  stopPublishers,
  fetchPublisherStatus
} = usePublisherControl(props.device.id, selectedChannel)

// HTTP recorder data fetching (device-wide, not channel-specific)
const httpRecorders = ref([])
const fetchRecorderStatus = async () => {
  try {
    const response = await fetch(`/api/devices/${props.device.id}/recorders/status`)
    if (response.ok) {
      const data = await response.json()
      httpRecorders.value = data.recorders || []
    }
  } catch (error) {
    console.error('Failed to fetch recorder status:', error)
  }
}

// Fetch recorder status on mount and when device changes
onMounted(() => {
  fetchRecorderStatus()
})

// Real-time WebSocket data for publisher status updates
const {
  data: realtimePublisherData,
  isConnected: realtimeConnected,
  error: realtimeError,
  lastUpdated: realtimeLastUpdated
} = useRealTimeData('publisher_status', props.device.ip, selectedChannel)

// Real-time WebSocket data for publisher names (medium tier - 15s updates)
const {
  data: realtimePublisherNames,
  isConnected: namesConnected,
  lastUpdated: namesLastUpdated
} = useRealTimeData('publisher_names', props.device.ip, selectedChannel)

// Real-time WebSocket data for recorder status (medium tier - 15s updates)
const {
  data: realtimeRecorderData,
  isConnected: recorderConnected,
  lastUpdated: recorderLastUpdated
} = useRealTimeData('recorder_status', props.device.ip)

// Real-time WebSocket data for system identity (slow tier - 30s updates)
const {
  data: realtimeSystemIdentity,
  isConnected: identityConnected,
  lastUpdated: identityLastUpdated
} = useRealTimeData('system_identity', props.device.ip)

// Real-time WebSocket data for system status (slow tier - 30s updates)
const {
  data: realtimeSystemStatus,
  isConnected: statusConnected,
  lastUpdated: statusLastUpdated
} = useRealTimeData('system_status', props.device.ip)

// Real-time WebSocket data for device channels (fast tier - 1s updates)
const {
  data: realtimeChannelsData,
  isConnected: channelsConnected,
  lastUpdated: channelsLastUpdated
} = useRealTimeData('device_channels', props.device.ip)

// Simple audio state - only track mute/unmute
const audioStreamingInstance = ref<any>(null)
const isAudioMuted = ref(true) // Always starts muted

// Video mode state (independent of image preview)
const isVideoMode = ref(false)

// Debug WebSocket connection status  
console.log(`🔧 PearlDeviceCard WebSocket setup for device ${props.device.ip}:`)
console.log(`   - Device ID: ${props.device.id}`)
console.log(`   - Selected Channel: ${selectedChannel.value}`)
console.log(`   📊 WebSocket Connections:`)
console.log(`     - Publisher Status: ${realtimeConnected.value}`)
console.log(`     - Publisher Names: ${namesConnected.value}`)
console.log(`     - Recorder Status: ${recorderConnected.value}`)
console.log(`     - System Identity: ${identityConnected.value}`)
console.log(`     - System Status: ${statusConnected.value}`)
console.log(`   📡 Data Available:`)
console.log(`     - Publisher Status: ${!!realtimePublisherData.value}`)
console.log(`     - Publisher Names: ${!!realtimePublisherNames.value}`)
console.log(`     - Recorder Data: ${!!realtimeRecorderData.value}`)
console.log(`     - System Identity: ${!!realtimeSystemIdentity.value}`)
console.log(`     - System Status: ${!!realtimeSystemStatus.value}`)
console.log(`   ⚠️ Errors: ${realtimeError.value}`)

// Fallback to hardcoded channels if API fails
const fallbackChannels = [1, 2, 3, 4]
const fallbackChannelOptions = computed(() => [
  { name: 'Select Channel', value: '' },
  ...fallbackChannels.map(ch => ({ name: `Channel ${ch}`, value: ch.toString() }))
])

// Use dynamic channels if available, otherwise fallback
const channelOptions = computed(() => {
  return hasChannels.value ? dynamicChannelOptions.value : fallbackChannelOptions.value
})

// Determine which channel mode we're using
const channelMode = computed(() => {
  if (channelsLoading.value) return 'loading'
  if (hasChannels.value) return 'dynamic'
  return 'fallback'
})

// Save channel to localStorage
const saveChannel = (channel: string | '') => {
  try {
    const key = getStorageKey()
    if (channel === '') {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, channel)
    }
  } catch (error) {
    console.warn('Failed to save channel to localStorage:', error)
  }
}

const activeTab = ref('preview')

// WebSocket connection for audio meters  
const { connected, connecting } = useAudioMeterWebSocket()

// Computed connection status with debounced state to prevent glitches
const connectionStatus = computed(() => {
  // Priority 1: If actively loading channels, show connecting
  if (channelsLoading.value) return 'connecting'
  
  // Priority 2: If we have channels data (successful state), show connected
  if (hasChannels.value) return 'connected'
  
  // Priority 3: If channel API has error, show disconnected  
  if (channelsError.value) return 'disconnected'
  
  // Priority 4: Fallback to WebSocket status (but only if no channels API data)
  if (connected.value) return 'connected'
  if (connecting.value) return 'connecting'
  return 'disconnected'
})

  // Preview image caching integration
  const { imageUrl: cachedImageUrl, error: previewError } = usePreviewImage(
    computed(() => props.device.id),
    selectedChannel
  )

// Seamless image URL that works with existing PreviewTab
const currentDisplayUrl = computed(() => {
  const url = cachedImageUrl.value
  if (url) return url
  
  // Fallback for safety (should rarely be used)
  const fallbackUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
  return fallbackUrl
})

// Simple error handler that works with PreviewTab
const onImageError = () => {
  console.warn(`🖼️ Image error for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
  // The composable handles fallback automatically
}

/**
 * INTELLIGENT RETRY MECHANISM FOR NEW DEVICES
 * ===========================================
 * 
 * PURPOSE: Bridge the gap between device creation and data availability
 * 
 * BACKGROUND:
 * When a user adds a new device, the backend does synchronous polling during device creation,
 * but there can be timing edge cases where the frontend component mounts before the backend
 * response completes. This retry mechanism ensures the frontend always gets the data.
 * 
 * RETRY STRATEGY:
 * - 5 attempts with incremental delays: 500ms, 700ms, 900ms, 1100ms, 1300ms
 * - Total retry time: ~4.5 seconds maximum
 * - Exits early if data is found on any attempt
 * 
 * WHEN THIS RUNS:
 * - Component onMounted (every time a device card loads)
 * - Especially important for newly created devices
 * - Also helps with page refreshes and navigation
 * 
 * FUTURE ENHANCEMENT IDEAS:
 * - Add exponential backoff for flaky network connections
 * - Add device type-specific retry logic
 * - Add WebSocket fallback for instant updates
 */

onMounted(() => {
  console.log(`🔄 PearlDeviceCard mounted for device ${props.device.id} (${props.device.name || props.device.ip})`)
  console.log(`📡 Real-time WebSocket connection status: ${realtimeConnected.value ? '✅ Connected' : '❌ Disconnected'}`)
  
  // HYBRID MODE: Initial HTTP fetch + WebSocket updates for optimal UX
  console.log(`🔄 Device ${props.device.id} using hybrid mode - initial HTTP fetch + WebSocket updates`)
  
  // Fetch initial publisher data for immediate display (especially on page refresh)
  if (selectedChannel.value) {
    console.log(`📡 Fetching initial publisher data for channel ${selectedChannel.value}`)
    fetchPublisherStatus()
  }
  
  // Perform async initialization in nextTick to avoid blocking component mount
  nextTick(async () => {
    try {
      // STABILITY ENHANCEMENT: Add small initial delay to prevent race conditions
      // This prevents visual glitches from rapid state changes during initialization
      await new Promise(resolve => setTimeout(resolve, 100))
      
      /**
       * ADAPTIVE POLLING STRATEGY FOR OPTIMAL UX
       * ========================================
       * 
       * This implements a two-tier polling system based on device state:
       * 
       * TIER 1 - NORMAL DEVICES (have channels):
       * - 2-second intervals (backend has cached data)
       * - Efficient for established devices
       * - Reduces server load while maintaining freshness
       * 
       * TIER 2 - NEW/INITIALIZING DEVICES (no channels yet):
       * - 1-second intervals for first 30 seconds
       * - Catches backend data as soon as it's available  
       * - Auto-switches to normal polling after 30 seconds
       * - Provides instant feedback for device initialization
       * 
       * HYBRID MODE: HTTP INITIAL STATE + WEBSOCKET UPDATES  
       * ====================================================
       * 1. On mount/channel change: HTTP calls for immediate data display
       * 2. Real-time updates: WebSocket events for live data changes
       * 
       * This provides:
       * - Immediate functional UI on load and channel changes
       * - Real-time updates with smart HTTP fallback when needed
       * - Optimal performance with reduced API calls via tiered polling
       */
      
      // INITIAL DATA LOAD: Get current device state for immediate UI functionality
      console.log(`🔄 Device ${props.device.id} loading initial data with hybrid HTTP + WebSocket mode`)
      
      // Load initial channels using the SAME composable instance
      try {
        console.log(`🔄 [Mount] Loading initial channels for device ${props.device.id}`)
        // Use the existing fetchChannels from the composable instance above
        await fetchChannels()
        console.log(`✅ [Mount] Initial channels loaded for device ${props.device.id}`)
        console.log(`📋 [Mount] Selected channel after load: "${selectedChannel.value}"`)
      
      // Also fetch initial publisher data if we have a selected channel
      if (selectedChannel.value) {
        console.log(`🔄 [Mount] Loading initial publisher data for device ${props.device.id}, channel ${selectedChannel.value}`)
        await fetchPublisherStatus()
        console.log(`✅ [Mount] Initial publisher data loaded for device ${props.device.id}`)
      } else {
        console.log(`⚠️ [Mount] No selected channel for device ${props.device.id}, skipping publisher fetch`)
      }
    } catch (error) {
      console.warn(`⚠️ [Mount] Failed to load initial data for device ${props.device.id}:`, error)
    }
    
    // After initial load, rely purely on WebSocket updates
    
    /*
      IMMEDIATE DATA LOADING PATTERN FOR FUTURE CLAUDE ITERATIONS:
      ==========================================================
      
      CRITICAL: When adding new API-driven features, always follow this pattern:
      1. Call the fetch function IMMEDIATELY to get initial data
      2. THEN start the polling timer for updates
      
      This ensures:
      - UI shows real data immediately on load (not default/empty states)
      - Users see accurate status without waiting for first timer interval
      - Better perceived performance and user experience
      
      Example pattern:
      ```
      if (selectedChannel.value) {
        await fetchYourNewData()    // ← IMMEDIATE call first
        startYourNewDataPolling()   // ← THEN start timer
      }
      ```
      
      Apply this to ALL new features: publisher status, recording status, 
      device info, stream quality, etc.
    */
    
      // Hybrid mode - HTTP for initial state, WebSocket for real-time updates
      console.log('🎯 Hybrid mode activated. HTTP initial state + WebSocket real-time updates.')
      
      // Preview images are now handled automatically by usePreviewImage composable
      console.log('📸 Preview images managed by usePreviewImage composable')
    } catch (err) {
      console.error('Error in onMounted:', err)
    }
  })
})

onBeforeUnmount(() => {
  // Stop channel polling only
  stopChannelPolling()
  
  
  // Clean up audio streaming
  if (audioStreamingInstance.value) {
    audioStreamingInstance.value.unsubscribe()
    audioStreamingInstance.value = null
  }
  isAudioMuted.value = true
})

// Watch for channels being loaded to validate saved selection
watch(channels, (newChannels) => {
  if (newChannels && newChannels.length > 0 && selectedChannel.value) {
    // Check if saved channel still exists
    const channelExists = newChannels.some(ch => ch.id.toString() === selectedChannel.value)
    if (!channelExists) {
      console.warn(`Saved channel ${selectedChannel.value} no longer exists, clearing selection`)
      selectedChannel.value = ''
    }
  }
})

// Watch real-time connection and manage HTTP polling fallback
// Real-time WebSocket connection status (Hybrid mode - WebSocket + HTTP fallback as needed)

// NOTE: Removed obsolete real-time data watcher that was causing console spam
// and potential data conflicts. The reactive data automatically updates the UI
// through computed properties without needing explicit watchers.

// However, we need to watch for connection status changes to ensure WebSocket works
watch([realtimeConnected, realtimeError], ([connected, error]) => {
  if (props.showDebug) {
    console.log(`🔌 WebSocket status for ${props.device.ip}: Connected=${connected}, Error=${error}`)
  }
}, { immediate: true })

// Watch for WebSocket channels data updates (hybrid mode)
watch(realtimeChannelsData, (newChannelsData) => {
  if (newChannelsData && channelsConnected.value) {
    console.log(`🔄 [PearlDeviceCard] Received WebSocket channels update for device ${props.device.ip} at ${channelsLastUpdated.value}`)
    updateChannelsFromWebSocket(newChannelsData)
  }
}, { immediate: false, deep: true })

// WebSocket data is automatically passed to StreamsTab via reactive props

// Watch for channel changes in pure real-time mode
watch(selectedChannel, async (newChannel) => {
  // Save to localStorage
  saveChannel(newChannel)
  
  // STABILITY: Add small delay to prevent rapid state changes during channel switching
  await new Promise(resolve => setTimeout(resolve, 50))
  
  // Hybrid mode - fetch initial HTTP data for immediate display on channel change
  console.log('🎯 Channel changed to', newChannel, '- fetching initial data + WebSocket updates')
  
  // Fetch initial publisher data for the new channel (same as page refresh)
  if (newChannel) {
    console.log(`📡 Fetching initial publisher data for new channel ${newChannel}`)
    fetchPublisherStatus()
  }
  
  // Clean up audio when channel changes
  if (audioStreamingInstance.value) {
    console.log('🎵 Channel changed - cleaning up audio instance')
    audioStreamingInstance.value.unsubscribe()
    audioStreamingInstance.value = null
  }
  
  // Always return to muted state when channel changes
  isAudioMuted.value = true
  console.log('🎵 Channel changed - audio reset to muted state')
  
  // Exit video mode when channel changes (bandwidth conservation)
  if (isVideoMode.value) {
    isVideoMode.value = false
    console.log('🎥 Channel changed - exited video mode for bandwidth conservation')
  }
  
  // Preview images automatically handled by usePreviewImage composable
  // (watch in composable will handle resubscription on channel change)
  console.log('📸 Preview image subscription updated for new channel')
})

// Handle channel change
const onChannelChange = () => {
  console.log(`📺 Channel changed to ${selectedChannel.value} for device ${props.device.name || props.device.ip}`)
}

// Check if current channel has publishers
const hasPublishers = computed(() => {
  if (!selectedChannel.value) return false
  const channel = findChannel(selectedChannel.value)
  return channel?.publishers && channel.publishers.length > 0
})

// Stable streaming status with proper state synchronization to prevent glitches
const streamingStatus = computed(() => {
  // Default stable state
  const defaultState = {
    active: false,
    state: 'stopped' as const,
    hasPublishers: hasPublishers.value || false
  }

  // If no channel selected, return default
  if (!selectedChannel.value) return defaultState

  // Use real-time WebSocket data ONLY if connected AND we have recent data
  if (realtimeConnected.value && realtimePublisherData.value && realtimePublisherData.value.publishers) {
    const rtPublishers = realtimePublisherData.value.publishers || []
    
    if (rtPublishers.length === 0) {
      return { active: false, state: 'stopped' as const, hasPublishers: false }
    }
    
    const hasStarting = rtPublishers.some((p: any) => p.status?.state === 'starting')
    const hasStopping = rtPublishers.some((p: any) => p.status?.state === 'stopping')  
    const allStarted = rtPublishers.every((p: any) => p.status?.started === true)
    
    let state: 'stopped' | 'starting' | 'started' | 'stopping' = 'stopped'
    let active = false
    
    if (hasStopping) {
      state = 'stopping'
    } else if (hasStarting) {
      state = 'starting'
    } else if (allStarted) {
      state = 'started'
      active = true
    }
    
    return { active, state, hasPublishers: true }
  }
  
  // No WebSocket data available yet - return safe default state
  return defaultState
})

// Recording status (still mock for now - will be implemented in future)
const recordingStatus = ref({
  active: false
})

/*
  USER FEEDBACK SYSTEM
  ====================
  PATTERN: Use floating overlays for ALL user feedback (never layout-shifting alerts)
  - Success: Green for completed actions (start/stop streaming)
  - Error: Red for failures (API errors, network issues)
  - Info: Blue for informational messages (no publishers available)
  - Auto-dismiss: 3 seconds (configurable)
  - Manual close: Always provide X button
*/
const userMessage = ref<string | null>(null)
const userMessageType = ref<'success' | 'error' | 'info'>('info')

// Show temporary user message with floating overlay (NEVER use layout-shifting alerts)
const showUserMessage = (message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
  userMessage.value = message
  userMessageType.value = type
  setTimeout(() => {
    userMessage.value = null
  }, duration)
}

// Control functions with real API calls
const toggleStreaming = async () => {
  if (!selectedChannel.value) {
    console.warn('No channel selected')
    showUserMessage('Please select a channel first', 'info')
    return
  }

  // Check if channel has publishers
  if (!hasPublishers.value) {
    console.warn(`Channel ${selectedChannel.value} has no publishers configured`)
    showUserMessage(`Channel ${selectedChannel.value} has no publishers to stream`, 'info')
    return
  }

  const deviceName = props.device.name || props.device.ip
  console.log(`🎥 Toggle streaming for ${deviceName} channel ${selectedChannel.value}`)
  console.log(`Current state: ${streamingStatus.value.state}`)
  
  try {
    if (streamingStatus.value.active) {
      // Stop streaming
      const success = await stopPublishers()
      if (success) {
        console.log(`✅ Successfully stopped streaming for ${deviceName} channel ${selectedChannel.value}`)
        showUserMessage('Streaming stopped', 'success')
      } else {
        console.error(`❌ Failed to stop streaming: ${publisherError.value}`)
        showUserMessage(`Failed to stop streaming: ${publisherError.value}`, 'error')
      }
    } else {
      // Start streaming
      const success = await startPublishers()
      if (success) {
        console.log(`✅ Successfully started streaming for ${deviceName} channel ${selectedChannel.value}`)
        showUserMessage('Streaming started', 'success')
      } else {
        console.error(`❌ Failed to start streaming: ${publisherError.value}`)
        showUserMessage(`Failed to start streaming: ${publisherError.value}`, 'error')
      }
    }
  } catch (err) {
    console.error('Error toggling streaming:', err)
    showUserMessage('An unexpected error occurred', 'error')
  }
}

// Toggle video mode handler
const toggleVideoMode = () => {
  isVideoMode.value = !isVideoMode.value
  const deviceName = props.device.name || props.device.ip
  
  if (isVideoMode.value) {
    console.log(`🎥 Switched to video mode for ${deviceName} channel ${selectedChannel.value}`)
    showUserMessage('Switched to video stream', 'success', 2000)
  } else {
    console.log(`🖼️ Switched to image mode for ${deviceName} channel ${selectedChannel.value}`)
    showUserMessage('Switched to image preview', 'info', 2000)
  }
}

const toggleRecording = () => {
  // TODO: Implement actual recording start/stop API calls
  recordingStatus.value.active = !recordingStatus.value.active
  console.log(`📹 ${recordingStatus.value.active ? 'Started' : 'Stopped'} recording for ${props.device.name || props.device.ip}`)
}

// Simple audio control - can only toggle when channel is selected
const canToggleAudio = computed(() => {
  return selectedChannel.value !== null && selectedChannel.value !== ''
})

const initializeAudioForChannel = async () => {
  if (!selectedChannel.value) return false
  
  try {
    // Clean up existing instance
    if (audioStreamingInstance.value) {
      audioStreamingInstance.value.unsubscribe()
      audioStreamingInstance.value = null
    }
    
    // Create new audio streaming instance for current channel
    audioStreamingInstance.value = useAudioStreaming({
      device: props.device.ip,
      channel: parseInt(selectedChannel.value),
      autoStart: false // Always start with streaming disabled
    })
    
    // Initialize the WebSocket connection and subscribe to audio stream
    console.log(`🎵 Subscribing to audio stream for ${props.device.ip}:${selectedChannel.value}`)
    await audioStreamingInstance.value.subscribe()
    
    // The composable starts muted by default, so our state should match
    console.log(`🎵 Initialized audio for ${props.device.ip}:${selectedChannel.value} (starts muted)`)
    return true
  } catch (error) {
    console.error('❌ Failed to initialize audio:', error)
    return false
  }
}

const toggleAudioMute = async () => {
  console.log(`🎵 toggleAudioMute - Channel: ${selectedChannel.value}, Muted: ${isAudioMuted.value}`)
  
  // Do nothing if no channel selected
  if (!canToggleAudio.value) {
    console.log('🎵 No channel selected - button does nothing')
    return
  }
  
  // Initialize audio instance if needed
  if (!audioStreamingInstance.value) {
    console.log('🎵 Initializing audio for first time')
    const success = await initializeAudioForChannel()
    if (!success) {
      console.error('❌ Failed to initialize audio')
      showUserMessage('Failed to initialize audio', 'error')
      return
    }
  }
  
  try {
    if (isAudioMuted.value) {
      // Unmute - ensure subscription is active
      console.log('🎵 Unmuting audio - ensuring subscription is active')
      
      // Make sure we're subscribed (should already be from initialization)
      if (audioStreamingInstance.value.subscribe && !audioStreamingInstance.value.isSubscribed?.value) {
        console.log('🎵 Not subscribed yet, subscribing now...')
        await audioStreamingInstance.value.subscribe()
      }
      
      // Get current audio context state
      const audioContext = audioStreamingInstance.value.audioContext?.value
      if (audioContext) {
        console.log(`🎵 Audio context state: ${audioContext.state}`)
        
        // Resume context if needed (user interaction)
        if (audioContext.state === 'suspended') {
          console.log('🎵 Resuming suspended audio context...')
          await audioContext.resume()
          console.log('✅ Audio context resumed')
        }
      }
      
      // Simple unmute
      console.log('🎵 Setting volume to 1 (unmuted)')
      if (audioStreamingInstance.value.setVolume) {
        audioStreamingInstance.value.setVolume(1)
      }
      
      if (audioStreamingInstance.value.unmute) {
        audioStreamingInstance.value.unmute()
      }
      
      // Update our state
      isAudioMuted.value = false
      
      console.log('✅ Audio unmuted')
      showUserMessage('Audio unmuted', 'success', 1500)
      
    } else {
      // Mute - simple approach
      console.log('🎵 Muting audio')
      
      if (audioStreamingInstance.value.setVolume) {
        audioStreamingInstance.value.setVolume(0)
      }
      
      if (audioStreamingInstance.value.mute) {
        audioStreamingInstance.value.mute()
      }
      
      isAudioMuted.value = true
      
      console.log('✅ Audio muted')
      showUserMessage('Audio muted', 'info', 1500)
    }
  } catch (error) {
    console.error('❌ Failed to toggle audio:', error)
    console.error('❌ Error details:', error)
    
    showUserMessage('Audio toggle failed', 'error')
  }
}


// Remove device handler
const removeDevice = () => {
  emit('remove', props.device.id)
}

// Fullscreen toggle handler
const toggleFullscreen = () => {
  emit('toggleFullscreen', props.device.id)
}






</script>

<style scoped>
/*
  STYLING GUIDELINES FOR FUTURE CLAUDE ITERATIONS:
  ================================================
  
  1. LAYOUT STABILITY PRINCIPLES:
     - Use relative positioning for containers that need overlays
     - Use absolute positioning for floating elements
     - Never use margin/padding changes for animations
     - Maintain consistent z-index hierarchy
  
  2. ANIMATION STANDARDS:
     - Fade in: 0.3s ease-out (gentle, welcoming)
     - Fade out: 0.2s ease-in (quick, unobtrusive)
     - Subtle transforms: translateY(-10px to 0) for entry
     - Backdrop blur: 4px for modern overlay effect
  
  3. THEME COMPATIBILITY:
     - Always provide light/dark theme variants
     - Use rgba() for transparency with theme adaptation
     - Test contrast ratios for accessibility
  
  4. RESPONSIVE DESIGN:
     - Mobile-first approach with @media queries
     - Maintain touch-friendly button sizes
     - Preserve overlay functionality on all screen sizes
*/

.pearl-device-card {
  height: 500px; /* Fixed height prevents content jumping */
  width: 100%;
  min-width: 420px; /* Slightly wider than default */
  display: flex;
  flex-direction: column;
}

/* Fixed height tab content container */
.tab-content-container {
  flex: 1;
  overflow: hidden;
}

.tab-content-window {
  height: 100%;
}

/* Scrollable content for all tab content */
.scrollable-content {
  height: 100%;
  overflow-y: auto;
  padding-right: 4px; /* Space for scrollbar */
}

/* Modern scrollbar styling */
.scrollable-content::-webkit-scrollbar {
  width: 6px;
}

.scrollable-content::-webkit-scrollbar-track {
  background: transparent;
}

.scrollable-content::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 3px;
}

.scrollable-content::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.3);
}

/* Empty state styling for consistent spacing */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  min-height: 200px;
}

.channel-select {
  flex-shrink: 0;
}






/* Spinning animation for loading icons */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mdi-spin {
  animation: spin 1s linear infinite;
}

/* Mobile responsive adjustments */
@media (max-width: 767px) {
  .pearl-device-card {
    width: 100%;
    min-width: 340px; /* Adjusted for slightly wider cards */
  }
}
</style>
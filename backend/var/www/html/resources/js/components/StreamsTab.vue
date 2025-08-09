<!--
  StreamsTab.vue - Extracted Streams Management Component
  
  COMPONENT EXTRACTION SUCCESS STORY:
  ====================================
  
  This component was successfully extracted from PearlDeviceCard.vue as a case study
  in proper component architecture and data flow patterns for real-time applications.
  
  KEY ARCHITECTURAL PATTERNS DEMONSTRATED:
  
  1. REACTIVE PROPS PATTERN:
     - Uses toRefs(props) to convert props to reactive refs
     - Essential for WebSocket data flow between parent and child
     - Ensures child component reacts to parent state changes
  
  2. HYBRID DATA SOURCE STRATEGY:
     - Priority 1: Real-time WebSocket data (when connected)
     - Priority 2: HTTP data (initial load/fallback)
     - Priority 3: Channel data (static fallback)
     - Seamless switching between data sources
  
  3. PARENT-CHILD COMMUNICATION:
     - Parent passes: device, channel, publishers, WebSocket data, helper functions
     - Child emits: user-message events for feedback integration
     - Clean separation of concerns with clear interfaces
  
  4. REAL-TIME UPDATES:
     - Publishers list updates automatically via WebSocket
     - Status indicators reflect real-time state
     - Pagination state managed independently
  
  USAGE EXAMPLE:
  <StreamsTab 
    :device="device" 
    :selected-channel="selectedChannel"
    :publishers="httpPublishers || []"
    :realtime-publisher-data="realtimePublisherData"
    :realtime-connected="realtimeConnected"
    :realtime-last-updated="realtimeLastUpdated"
    :find-channel="findChannel"
    @user-message="showUserMessage"
  />
  
  REUSABILITY:
  This component can be used in other device management contexts by simply
  passing the required props. No internal dependencies on parent component state.
  
  FOR FUTURE COMPONENT EXTRACTIONS:
  See /COMPONENT_EXTRACTION_GUIDE.md for detailed patterns and best practices
  learned from this extraction process.
-->
<template>
  <div class="stream-container scrollable-content">
    <div v-if="selectedChannel" class="pa-3">
      <!-- Publishers List with Pagination -->
      <div class="publishers-section">
        <div class="d-flex align-center justify-space-between mb-3">
          <h3 class="text-subtitle-1">Publishers</h3>
          <v-chip 
            :color="hasPublishers ? 'primary' : 'grey'" 
            size="small" 
            variant="tonal"
          >
            {{ enhancedPublishers.length }} {{ enhancedPublishers.length === 1 ? 'Publisher' : 'Publishers' }}
          </v-chip>
        </div>

        <!-- Publishers List -->
        <div v-if="hasPublishers" class="publishers-list" :key="`publishers-${realtimeLastUpdated?.getTime() || Date.now()}`">
          <!-- Paginated Publisher Items -->
          <v-list lines="two" density="compact" class="pa-0">
            <v-list-item 
              v-for="publisher in paginatedPublishers" 
              :key="getPublisherKey(publisher)"
              class="px-2 py-1"
            >
              <template v-slot:prepend>
                <v-avatar :color="getPublisherStatusColor(publisher)" size="32">
                  <v-icon color="white" size="16">
                    {{ getPublisherIcon(publisher) }}
                  </v-icon>
                </v-avatar>
              </template>

              <v-list-item-title class="text-body-2 font-weight-medium">
                {{ publisher.name || `Publisher ${publisher.id}` }}
              </v-list-item-title>
              
              <v-list-item-subtitle class="text-caption">
                <div class="d-flex align-center ga-2">
                  <v-chip 
                    :color="getPublisherStatusColor(publisher)" 
                    size="x-small" 
                    variant="tonal"
                  >
                    {{ getPublisherStatusText(publisher) }}
                  </v-chip>
                  <span class="text-caption text-medium-emphasis">
                    {{ publisher.type?.toUpperCase() || 'UNKNOWN' }}
                  </span>
                </div>
              </v-list-item-subtitle>

              <template v-slot:append>
                <v-btn
                  :color="publisher.status?.started ? 'error' : 'success'"
                  :icon="publisher.status?.started ? 'mdi-stop' : 'mdi-play'"
                  size="small"
                  variant="tonal"
                  @click="toggleIndividualPublisher(publisher)"
                />
              </template>
            </v-list-item>
          </v-list>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="d-flex justify-center mt-3">
            <v-pagination
              v-model="currentPage"
              :length="totalPages"
              :total-visible="3"
              size="small"
              density="compact"
            />
          </div>
        </div>

        <!-- No Publishers State -->
        <div v-else class="empty-state">
          <v-icon size="48" color="grey-lighten-1" class="mb-2">
            mdi-broadcast-off
          </v-icon>
          <div class="text-subtitle-2 text-medium-emphasis mb-1">
            No Publishers Available
          </div>
          <div class="text-caption text-medium-emphasis">
            This channel has no configured publishers for streaming.
          </div>
        </div>
      </div>
    </div>

    <!-- No Channel Selected -->
    <div v-else class="empty-state">
      <v-icon size="48" color="grey-lighten-1" class="mb-2">
        mdi-video-outline
      </v-icon>
      <div class="text-subtitle-2 text-medium-emphasis mb-1">
        No Channel Selected
      </div>
      <div class="text-caption text-medium-emphasis">
        Select a channel to view its publishers
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
  STREAMSTAB COMPONENT DATA FLOW ARCHITECTURE
  ===========================================
  
  This component demonstrates the REACTIVE PROPS PATTERN for real-time data:
  
  CRITICAL PATTERN: toRefs(props) for WebSocket Data Flow
  -------------------------------------------------------
  
  Problem: Props are not reactive by default in child components
  Solution: Use toRefs() to convert props to reactive refs
  
  Example:
  const { realtimePublisherData, realtimeConnected } = toRefs(props)
  
  This ensures that when parent's WebSocket data updates:
  1. Child component's computed properties re-evaluate
  2. UI updates automatically reflect new data
  3. No manual watching or polling required
  
  DATA SOURCE PRIORITY SYSTEM:
  ----------------------------
  
  enhancedPublishers computed property implements a waterfall pattern:
  1. WebSocket data (real-time, highest priority)
  2. HTTP data (initial load, medium priority) 
  3. Channel data (static fallback, lowest priority)
  
  This ensures users always see the most current data available while
  providing graceful degradation when connections fail.
  
  REACTIVE KEY GENERATION:
  ------------------------
  
  getPublisherKey() includes realtimeLastUpdated timestamp to force
  Vue re-renders when WebSocket data updates. This is essential for
  real-time applications where object identity may not change but
  content does.
*/

import { ref, computed, watch, toRefs } from 'vue'
import { useApiAuth } from '@/composables/useApiAuth'

interface Device {
  id: number
  name?: string
  ip: string
}

interface Publisher {
  id: string
  name?: string
  type?: string
  status?: {
    state: 'started' | 'starting' | 'stopping' | 'stopped'
    started: boolean
    is_configured?: boolean
  }
}

interface Props {
  device: Device
  selectedChannel: string | ''
  publishers: Publisher[]
  realtimePublisherData: any
  realtimeConnected: boolean
  realtimeLastUpdated: Date | null
  findChannel: (channelId: string) => any
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'user-message': [message: string, type: 'success' | 'error' | 'info', duration?: number]
}>()

// API authentication for HTTP requests
const apiAuth = useApiAuth()

// Make props reactive for proper WebSocket data flow
const { 
  selectedChannel, 
  publishers, 
  realtimePublisherData, 
  realtimeConnected, 
  realtimeLastUpdated,
  findChannel 
} = toRefs(props)

// Use props data instead of creating new composable instances

// Pagination State
const currentPage = ref(1)
const itemsPerPage = 5 // Compact space requires small page size

// Reset pagination when channel changes
watch(selectedChannel, () => {
  currentPage.value = 1
})

// Check if current channel has publishers
const hasPublishers = computed(() => {
  if (!selectedChannel.value) return false
  const channel = findChannel.value(selectedChannel.value)
  return channel?.publishers && channel.publishers.length > 0
})

// Hybrid publishers list - uses real-time data when available, fallback otherwise
const enhancedPublishers = computed(() => {
  // PRIORITY 1: Use WebSocket data if connected and available
  if (realtimeConnected.value && 
      realtimePublisherData.value && 
      realtimePublisherData.value.publishers &&
      Array.isArray(realtimePublisherData.value.publishers)) {
    return realtimePublisherData.value.publishers
  }
  
  // PRIORITY 2: Use HTTP data for initial load only (before WebSocket data arrives)
  if (publishers.value && publishers.value.length > 0) {
    return publishers.value
  }
  
  // PRIORITY 3: Fallback to channel publishers (initial load)
  if (selectedChannel.value) {
    const channel = findChannel.value(selectedChannel.value)
    if (channel?.publishers && Array.isArray(channel.publishers)) {
      return channel.publishers
    }
  }
  
  return []
})

const totalPages = computed(() => {
  return Math.ceil(enhancedPublishers.value.length / itemsPerPage)
})

const paginatedPublishers = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return enhancedPublishers.value.slice(start, start + itemsPerPage)
})

// Reactive key generator for forcing Vue re-renders when real-time data updates
const getPublisherKey = (publisher: any) => {
  const baseKey = `${publisher.id}-${selectedChannel.value}`
  // Include real-time data timestamp to force re-render when data updates
  const timestamp = realtimeLastUpdated.value?.getTime() || Date.now()
  return `${baseKey}-${timestamp}`
}

// Publisher Status Helper Functions
const getPublisherStatusColor = (publisher: Publisher) => {
  if (!publisher.status) return 'grey'
  
  switch (publisher.status.state) {
    case 'started':
      return 'success'
    case 'starting':
    case 'stopping':
      return 'warning'
    case 'stopped':
      return publisher.status.is_configured ? 'error' : 'grey'
    default:
      return 'grey'
  }
}

const getPublisherIcon = (publisher: Publisher) => {
  if (!publisher.status) return 'mdi-help-circle'
  
  switch (publisher.status.state) {
    case 'started':
      return 'mdi-broadcast'
    case 'starting':
      return 'mdi-loading mdi-spin'
    case 'stopping':
      return 'mdi-loading mdi-spin'
    case 'stopped':
      return 'mdi-broadcast-off'
    default:
      return 'mdi-help-circle'
  }
}

const getPublisherStatusText = (publisher: Publisher) => {
  if (!publisher.status) return 'Unknown'
  
  switch (publisher.status.state) {
    case 'started':
      return 'Streaming'
    case 'starting':
      return 'Starting...'
    case 'stopping':
      return 'Stopping...'
    case 'stopped':
      return publisher.status.is_configured ? 'Stopped' : 'Not Configured'
    default:
      return 'Unknown'
  }
}

// Individual Publisher Control
const toggleIndividualPublisher = async (publisher: Publisher) => {
  if (!props.device || !selectedChannel.value) {
    emit('user-message', 'Device or channel not available', 'error', 3000)
    return
  }

  const isStarted = publisher.status?.started
  const action = isStarted ? 'stop' : 'start'
  const publisherId = publisher.id
  
  // Both frontend and Pearl devices use 1-based channel numbering (1, 2, 3...)
  const frontendChannelId = selectedChannel.value
  if (frontendChannelId === undefined || frontendChannelId === null) {
    emit('user-message', 'Channel not selected', 'error', 3000)
    return
  }
  
  const parsedChannelId = parseInt(frontendChannelId, 10)
  if (isNaN(parsedChannelId)) {
    emit('user-message', `Invalid channel ID: ${frontendChannelId}`, 'error', 3000)
    return
  }
  const channelId = parsedChannelId

  try {
    emit('user-message', `${action === 'start' ? 'Starting' : 'Stopping'} publisher "${publisher.name}"...`, 'info', 2000)
    
    const response = await apiAuth.post(`/api/devices/${props.device.id}/channels/${channelId}/publishers/${publisherId}/control/${action}`)
    
    if (response.status === 'ok' || response.result) {
      emit('user-message', `Publisher "${publisher.name}" ${action === 'start' ? 'started' : 'stopped'} successfully`, 'success', 3000)
    } else {
      emit('user-message', `Failed to ${action} publisher "${publisher.name}"`, 'error', 4000)
    }
  } catch (error: any) {
    console.error(`Failed to ${action} publisher:`, error)
    
    let errorMessage = `Failed to ${action} publisher "${publisher.name}"`
    if (error.response?.data?.error) {
      errorMessage += `: ${error.response.data.error}`
    } else if (error.message) {
      errorMessage += `: ${error.message}`
    }
    
    emit('user-message', errorMessage, 'error', 5000)
  }
}
</script>

<style scoped>
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
</style>
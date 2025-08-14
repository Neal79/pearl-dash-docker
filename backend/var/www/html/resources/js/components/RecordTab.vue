<!--
  RecordTab.vue - Extracted Recording Management Component
  
  COMPONENT EXTRACTION - RECORD TAB (August 2024):
  ================================================
  
  This component was fully implemented following the same architectural patterns
  as StreamsTab but for device-wide recorder management. Unlike publishers which
  are channel-specific, recorders belong to the device level.
  
  KEY FEATURES IMPLEMENTED:
  - Individual recorder list display with real-time status
  - Individual recorder start/stop controls for each recorder
  - Hybrid data approach: WebSocket real-time updates + HTTP fallback
  - Pagination for devices with many recorders
  - Real-time status indicators with color coding
  - Device-wide scope (recorders don't depend on selected channel)
  
  ARCHITECTURAL PATTERNS:
  - Reactive props pattern with toRefs() for WebSocket data flow
  - Hybrid data source strategy (WebSocket → HTTP → Fallback)
  - Individual control actions with loading states and error handling
  - Consistent UI patterns matching StreamsTab design
  - Device-level focus (no channel dependency)
  
  DIFFERENCES FROM STREAMSTAB:
  - Device-scope instead of channel-scope (recorders are device-wide)
  - No channel selection dependency (always shows all device recorders)
  - Different API endpoints (/recorders instead of /channels/publishers)
  - Recording-specific status states ('started', 'stopped', 'disabled')
-->
<template>
  <div class="record-container scrollable-content">
    <div class="pa-3">
      <!-- Recorders List with Pagination -->
      <div class="recorders-section">
        <div class="d-flex align-center justify-space-between mb-3">
          <h3 class="text-subtitle-1">Device Recorders</h3>
          <v-chip 
            :color="hasRecorders ? 'error' : 'grey'" 
            size="small" 
            variant="tonal"
          >
            {{ enhancedRecorders.length }} {{ enhancedRecorders.length === 1 ? 'Recorder' : 'Recorders' }}
          </v-chip>
        </div>

        <!-- Recorders List -->
        <div v-if="hasRecorders" class="recorders-list" :key="`recorders-${recorderLastUpdated?.getTime() || 0}`">
          <!-- Paginated Recorder Items -->
          <v-list lines="two" density="compact" class="pa-0">
            <v-list-item 
              v-for="recorder in paginatedRecorders" 
              :key="getRecorderKey(recorder)"
              class="px-2 py-1"
            >
              <template v-slot:prepend>
                <v-avatar :color="getRecorderStatusColor(recorder)" size="32">
                  <v-icon color="white" size="16">
                    {{ getRecorderIcon(recorder) }}
                  </v-icon>
                </v-avatar>
              </template>

              <v-list-item-title class="text-body-2 font-weight-medium">
                {{ recorder.name || `Recorder ${recorder.id}` }}
              </v-list-item-title>
              
              <v-list-item-subtitle class="text-caption">
                <div class="d-flex align-center ga-2">
                  <v-chip 
                    :color="getRecorderStatusColor(recorder)" 
                    size="x-small" 
                    variant="tonal"
                  >
                    {{ getRecorderStatusText(recorder) }}
                  </v-chip>
                </div>
                <!-- Recording duration if available -->
                <div v-if="recorder.status?.duration && isRecorderRecording(recorder)" class="mt-1">
                  <span class="text-caption text-medium-emphasis">
                    Duration: {{ formatDuration(recorder.status.duration) }}
                  </span>
                </div>
              </v-list-item-subtitle>

              <template v-slot:append>
                <v-btn
                  :color="getRecorderActionColor(recorder)"
                  :icon="isRecorderControlling(recorder.id) ? 'mdi-loading mdi-spin' : 
                         isRecorderRecording(recorder) ? 'mdi-stop' : 'mdi-record'"
                  size="small"
                  variant="tonal"
                  :loading="isRecorderControlling(recorder.id)"
                  :disabled="isRecorderControlling(recorder.id) || !isRecorderControllable(recorder)"
                  @click="toggleIndividualRecorder(recorder)"
                  :title="getRecorderActionTitle(recorder)"
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

        <!-- No Recorders State -->
        <div v-else class="empty-state">
          <v-icon size="48" color="grey-lighten-1" class="mb-2">
            mdi-record-off
          </v-icon>
          <div class="text-subtitle-2 text-medium-emphasis mb-1">
            No Recorders Available
          </div>
          <div class="text-caption text-medium-emphasis">
            This device has no configured recorders for recording.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
  RECORDTAB COMPONENT ARCHITECTURE
  ================================
  
  This component follows the same patterns as StreamsTab but for device-wide
  recorder management. Unlike publishers which are channel-specific, recorders
  belong to the device level.
  
  REACTIVE PROPS PATTERN:
  ----------------------
  Uses toRefs(props) to convert props to reactive refs for real-time WebSocket
  data flow, ensuring the UI updates when parent component state changes.
  
  HYBRID DATA SOURCE STRATEGY:
  ----------------------------
  1. WebSocket data (real-time, highest priority)
  2. HTTP data (initial load, medium priority)
  3. Fallback data (lowest priority)
  
  DEVICE-WIDE SCOPE:
  -----------------
  Recorders are device-level resources, not channel-dependent like publishers.
  This component always shows all recorders on the device.
*/

import { ref, computed, toRefs } from 'vue'
import { useApiAuth } from '@/composables/useApiAuth'

interface Device {
  id: number
  name?: string
  ip: string
}

interface Recorder {
  id: string
  name?: string
  type?: string
  status?: {
    state: 'started' | 'starting' | 'stopping' | 'stopped' | 'disabled'
    started?: boolean
    is_configured?: boolean
    duration?: string
    total?: string
    active?: string
  }
}

interface Props {
  device: Device
  selectedChannel: string | ''
  recorders: Recorder[]
  realtimeRecorderData: any
  realtimeConnected: boolean
  recorderLastUpdated: Date | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'user-message': [message: string, type: 'success' | 'error' | 'info', duration?: number]
}>()

// API authentication for HTTP requests
const apiAuth = useApiAuth()

// Make props reactive for proper WebSocket data flow
const { 
  recorders,
  realtimeRecorderData,
  realtimeConnected,
  recorderLastUpdated
} = toRefs(props)

// Pagination State
const currentPage = ref(1)
const itemsPerPage = 5 // Compact space requires small page size

// Individual recorder control loading states
const controllingRecorders = ref(new Set<string>())

// Check if device has recorders
const hasRecorders = computed(() => {
  return enhancedRecorders.value.length > 0
})

// Enhanced recorders list - prioritizes WebSocket data over HTTP data
const enhancedRecorders = computed(() => {
  // PRIORITY 1: Use WebSocket data if connected and available
  if (realtimeConnected.value && 
      realtimeRecorderData.value && 
      realtimeRecorderData.value.recorders &&
      Array.isArray(realtimeRecorderData.value.recorders)) {
    
    console.log(`📊 [RecordTab] Using WebSocket recorder data: ${realtimeRecorderData.value.recorders.length} recorders`)
    return realtimeRecorderData.value.recorders
  }
  
  // PRIORITY 2: Use HTTP data for initial load
  if (recorders.value && recorders.value.length > 0) {
    console.log(`📊 [RecordTab] Using HTTP recorder data: ${recorders.value.length} recorders`)
    return recorders.value
  }
  
  console.log(`📊 [RecordTab] No recorder data available`)
  return []
})

const totalPages = computed(() => {
  return Math.ceil(enhancedRecorders.value.length / itemsPerPage)
})

const paginatedRecorders = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return enhancedRecorders.value.slice(start, start + itemsPerPage)
})

// Reactive key generator for forcing Vue re-renders when real-time data updates
const getRecorderKey = (recorder: any) => {
  const baseKey = `recorder-${recorder.id}`
  const timestamp = recorderLastUpdated.value?.getTime() || 0
  return `${baseKey}-${timestamp}`
}

// Recorder Status Helper Functions
const getRecorderStatusColor = (recorder: Recorder) => {
  if (!recorder.status) return 'grey'
  
  switch (recorder.status.state) {
    case 'started':
      return 'error' // Red for recording
    case 'starting':
    case 'stopping':
      return 'warning'
    case 'stopped':
      return 'success' // Green when stopped
    case 'disabled':
      return 'grey'
    default:
      return 'grey'
  }
}

const getRecorderIcon = (recorder: Recorder) => {
  if (!recorder.status) return 'mdi-help-circle'
  
  switch (recorder.status.state) {
    case 'started':
      return 'mdi-record'
    case 'starting':
      return 'mdi-loading mdi-spin'
    case 'stopping':
      return 'mdi-loading mdi-spin'
    case 'stopped':
      return 'mdi-record-off'
    case 'disabled':
      return 'mdi-cancel'
    default:
      return 'mdi-help-circle'
  }
}

const getRecorderStatusText = (recorder: Recorder) => {
  if (!recorder.status) return 'Unknown'
  
  switch (recorder.status.state) {
    case 'started':
      return 'Recording'
    case 'starting':
      return 'Starting...'
    case 'stopping':
      return 'Stopping...'
    case 'stopped':
      return 'Stopped'
    case 'disabled':
      return 'Disabled'
    default:
      return 'Unknown'
  }
}


const getRecorderActionColor = (recorder: Recorder) => {
  return isRecorderRecording(recorder) ? 'error' : 'success'
}

const getRecorderActionTitle = (recorder: Recorder) => {
  const action = isRecorderRecording(recorder) ? 'Stop' : 'Start'
  return `${action} recorder "${recorder.name || recorder.id}"`
}

const isRecorderRecording = (recorder: Recorder) => {
  return recorder.status?.state === 'started' || recorder.status?.started === true
}

const isRecorderControllable = (recorder: Recorder) => {
  return recorder.status?.state !== 'disabled' && 
         recorder.status?.state !== 'starting' && 
         recorder.status?.state !== 'stopping'
}

const isRecorderControlling = (recorderId: string) => {
  return controllingRecorders.value.has(recorderId)
}

const formatDuration = (duration: string | undefined) => {
  if (!duration) return 'N/A'
  
  // Convert seconds to mm:ss format
  const seconds = parseInt(duration, 10)
  if (isNaN(seconds)) return duration // Return as-is if not a number
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

// Individual Recorder Control
const toggleIndividualRecorder = async (recorder: Recorder) => {
  if (!props.device) {
    emit('user-message', 'Device not available', 'error', 3000)
    return
  }

  const isRecording = isRecorderRecording(recorder)
  const action = isRecording ? 'stop' : 'start'
  const recorderId = recorder.id
  
  // Add to controlling set to show loading state
  controllingRecorders.value.add(recorderId)
  
  try {
    emit('user-message', `${action === 'start' ? 'Starting' : 'Stopping'} recorder "${recorder.name || recorder.id}"...`, 'info', 2000)
    
    const response = await apiAuth.post(`/api/devices/${props.device.id}/recorders/${recorderId}/control/${action}`)
    
    if (response.status === 'ok' || response.result) {
      emit('user-message', `Recorder "${recorder.name || recorder.id}" ${action === 'start' ? 'started' : 'stopped'} successfully`, 'success', 3000)
    } else {
      emit('user-message', `Failed to ${action} recorder "${recorder.name || recorder.id}"`, 'error', 4000)
    }
  } catch (error: any) {
    console.error(`Failed to ${action} recorder:`, error)
    
    let errorMessage = `Failed to ${action} recorder "${recorder.name || recorder.id}"`
    if (error.response?.data?.error) {
      errorMessage += `: ${error.response.data.error}`
    } else if (error.message) {
      errorMessage += `: ${error.message}`
    }
    
    emit('user-message', errorMessage, 'error', 5000)
  } finally {
    // Remove from controlling set
    controllingRecorders.value.delete(recorderId)
  }
}
</script>

<style scoped>
/* Scrollable content styling consistent with other tab components */
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
</style>
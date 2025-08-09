<!--
  RecordTab.vue - Extracted Recording Management Component
  
  COMPONENT EXTRACTION - RECORD TAB:
  ==================================
  
  This component was extracted from PearlDeviceCard.vue following the same
  patterns established by the StreamsTab extraction. Currently a placeholder
  with future expansion planned for recording management features.
  
  ARCHITECTURAL PATTERNS:
  - Clean component interface with minimal props
  - Reactive props pattern ready for future data integration
  - Consistent empty state handling
  - Expandable for future recording features
  
  FUTURE FEATURES PLANNED:
  - Recording start/stop controls
  - Recording duration tracking
  - Storage management
  - Recording quality settings
  - Export functionality
-->
<template>
  <div class="record-container scrollable-content">
    <!-- Record tab content - placeholder for future implementation -->
    <div v-if="selectedChannel" class="empty-state">
      <v-icon size="48" color="grey-lighten-1" class="mb-2">
        mdi-record
      </v-icon>
      <div class="text-subtitle-2 text-medium-emphasis mb-1">
        Recording Controls
      </div>
      <div class="text-caption text-medium-emphasis">
        Recording management will be available in a future update.
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
        Select a channel to view recording options
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
  RECORDTAB COMPONENT ARCHITECTURE
  ================================
  
  This component follows the same patterns as StreamsTab but with minimal
  data requirements since recording features are not yet implemented.
  
  CURRENT STATE: Placeholder component with proper structure
  FUTURE STATE: Will integrate with recording APIs and real-time status
  
  When recording features are implemented, this component should:
  1. Receive recording status via props (following reactive props pattern)
  2. Use toRefs() if real-time recording data is needed
  3. Emit events for recording control actions
  4. Integrate with recording composables
*/

interface Device {
  id: number
  name?: string
  ip: string
}

interface Props {
  device: Device
  selectedChannel: string | ''
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'user-message': [message: string, type: 'success' | 'error' | 'info', duration?: number]
}>()

// Future: Add reactive props for recording data
// const { selectedChannel } = toRefs(props)

// Placeholder for future recording features
// const isRecording = ref(false)
// const recordingDuration = ref(0)
// const storageUsed = ref(0)
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
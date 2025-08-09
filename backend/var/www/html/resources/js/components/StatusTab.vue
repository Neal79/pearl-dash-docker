<!--
  StatusTab.vue - Extracted Device Status Component
  
  COMPONENT EXTRACTION - STATUS TAB:
  ==================================
  
  This component was extracted from PearlDeviceCard.vue following the same
  patterns established by the StreamsTab extraction. Contains device status
  information including connection status, channel info, and API diagnostics.
  
  ARCHITECTURAL PATTERNS:
  - Reactive props pattern for status data
  - Clean separation of device information display
  - Computed properties for status formatting
  - Ready for future status features expansion
  
  CURRENT FEATURES:
  - Device connection status
  - IP address with clickable link
  - Device name display
  - Active channel information
  - Last updated timestamp
  - Channel source (API vs fallback)
  - Error state handling
-->
<template>
  <div class="status-container scrollable-content pa-3">
    <v-list lines="two" density="compact">
      <v-list-item>
        <template v-slot:prepend>
          <v-icon 
            :color="connectionStatus === 'connected' ? 'success' : 'error'"
            :icon="connectionStatus === 'connected' ? 'mdi-check-circle' : 'mdi-alert-circle'"
          />
        </template>
        <v-list-item-title>Device Status</v-list-item-title>
        <v-list-item-subtitle>
          {{ connectionStatus === 'connected' ? 'Online' : 'Offline' }}
        </v-list-item-subtitle>
      </v-list-item>

      <v-list-item>
        <template v-slot:prepend>
          <v-icon color="info" icon="mdi-ip-network" />
        </template>
        <v-list-item-title>IP Address</v-list-item-title>
        <v-list-item-subtitle>
          <a 
            :href="`http://${device.ip}`" 
            target="_blank" 
            class="text-blue-lighten-2 text-decoration-none"
          >
            {{ device.ip }}
          </a>
        </v-list-item-subtitle>
      </v-list-item>

      <v-list-item v-if="device.name">
        <template v-slot:prepend>
          <v-icon color="primary" icon="mdi-rename-box" />
        </template>
        <v-list-item-title>Device Name</v-list-item-title>
        <v-list-item-subtitle>{{ device.name }}</v-list-item-subtitle>
      </v-list-item>

      <v-list-item v-if="selectedChannel">
        <template v-slot:prepend>
          <v-icon color="primary" icon="mdi-video-input-component" />
        </template>
        <v-list-item-title>Active Channel</v-list-item-title>
        <v-list-item-subtitle>Channel {{ selectedChannel }}</v-list-item-subtitle>
      </v-list-item>

      <v-list-item>
        <template v-slot:prepend>
          <v-icon color="secondary" icon="mdi-clock-outline" />
        </template>
        <v-list-item-title>Last Updated</v-list-item-title>
        <v-list-item-subtitle>{{ lastUpdated }}</v-list-item-subtitle>
      </v-list-item>

      <v-list-item>
        <template v-slot:prepend>
          <v-icon 
            :color="channelMode === 'dynamic' ? 'success' : channelMode === 'loading' ? 'warning' : 'info'"
            :icon="channelMode === 'dynamic' ? 'mdi-api' : channelMode === 'loading' ? 'mdi-loading' : 'mdi-backup-restore'"
          />
        </template>
        <v-list-item-title>Channel Source</v-list-item-title>
        <v-list-item-subtitle>
          {{ channelModeText }}
        </v-list-item-subtitle>
      </v-list-item>

      <v-list-item v-if="channelsError">
        <template v-slot:prepend>
          <v-icon color="error" icon="mdi-alert-circle" />
        </template>
        <v-list-item-title>Channel API Error</v-list-item-title>
        <v-list-item-subtitle>{{ channelsError }}</v-list-item-subtitle>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
/*
  STATUSTAB COMPONENT ARCHITECTURE
  ================================
  
  This component follows the same reactive props patterns as StreamsTab
  but focuses on device status information rather than real-time data.
  
  REACTIVE PROPS PATTERN:
  Uses toRefs() to make props reactive for automatic updates when parent
  component status changes (connection status, channel mode, errors, etc.)
  
  STATUS DATA SOURCES:
  - connectionStatus: Device connectivity state
  - channelMode: API vs fallback channel source
  - channelsError: Any API errors
  - lastUpdated: Timestamp of last status check
  
  FUTURE ENHANCEMENTS:
  - Device temperature monitoring
  - Storage space information  
  - Network diagnostics
  - Performance metrics
*/

import { computed, toRefs } from 'vue'

interface Device {
  id: number
  name?: string
  ip: string
}

interface Props {
  device: Device
  selectedChannel: string | ''
  connectionStatus: string
  channelMode: 'dynamic' | 'loading' | 'fallback'
  channelsCount: number
  channelsError: string | null
}

const props = defineProps<Props>()

// Make props reactive for automatic updates
const { 
  device, 
  selectedChannel, 
  connectionStatus, 
  channelMode, 
  channelsCount, 
  channelsError 
} = toRefs(props)

// Computed properties for formatted display
const lastUpdated = computed(() => {
  return new Date().toLocaleString()
})

const channelModeText = computed(() => {
  switch (channelMode.value) {
    case 'dynamic':
      return `API (${channelsCount.value} channels)`
    case 'loading':
      return 'Loading...'
    case 'fallback':
      return 'Fallback (4 channels)'
    default:
      return 'Unknown'
  }
})
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

/* Status container specific styling */
.status-container {
  min-height: 300px;
}
</style>
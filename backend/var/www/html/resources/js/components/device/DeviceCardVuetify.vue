<template>
  <v-card 
    :loading="loading"
    elevation="2"
    class="device-card ma-2"
    height="100%"
  >
    <!-- Card Header -->
    <v-card-title class="d-flex align-center justify-space-between pa-4 pb-2">
      <div class="text-truncate">
        <h3 class="text-h6 font-weight-medium">
          {{ device.name || device.ip }}
        </h3>
        <div v-if="device.name" class="text-caption text-medium-emphasis">
          {{ device.ip }}
        </div>
      </div>
      
      <v-menu 
        location="bottom end"
        :close-on-content-click="true"
      >
        <template v-slot:activator="{ props }">
          <v-btn
            icon="mdi-dots-vertical"
            variant="text"
            size="small"
            v-bind="props"
          />
        </template>
        
        <v-card
          class="device-menu-card"
          elevation="8"
          min-width="120"
        >
          <v-list 
            density="compact"
            class="pa-0"
          >
            <v-list-item
              prepend-icon="mdi-pencil"
              title="Edit"
              @click="$emit('edit', device.id)"
            />
            <v-list-item
              prepend-icon="mdi-delete"
              title="Remove"
              class="text-error"
              @click="confirmRemove"
            />
          </v-list>
        </v-card>
      </v-menu>
    </v-card-title>

    <v-card-text class="pa-4 pt-0">
      <!-- Channel Selector -->
      <div class="mb-4">
        <v-select
          v-model="selectedChannel"
          :items="channelItems"
          label="Channel"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="onChannelChange"
        >
          <template v-slot:prepend-inner>
            <v-icon size="small" color="medium-emphasis">
              mdi-video-input-component
            </v-icon>
          </template>
        </v-select>
      </div>

      <!-- Preview Image -->
      <div class="preview-container mb-4">
        <v-img
          :src="currentDisplayUrl"
          :alt="`Preview for ${device.name || device.ip}`"
          aspect-ratio="16/9"
          cover
          class="preview-image"
          @error="onImageError"
        >
          <template v-slot:placeholder>
            <div class="d-flex align-center justify-center fill-height">
              <v-progress-circular
                color="primary"
                indeterminate
                size="40"
              />
            </div>
          </template>
        </v-img>
        
        <!-- Refresh Button -->
        <v-btn
          icon="mdi-refresh"
          size="small"
          variant="elevated"
          color="surface"
          class="refresh-btn"
          @click="refreshImage"
          :disabled="!selectedChannel"
        />
      </div>

      <!-- Audio Meter (Preserve existing component) -->
      <div v-if="selectedChannel" class="audio-meter-container">
        <AudioMeter
          :device="device"
          :channel="selectedChannel"
          :show-debug="false"
        />
      </div>
      
      <!-- No Channel Selected State -->
      <v-alert
        v-else
        type="info"
        variant="tonal"
        density="compact"
        text="Select a channel to view preview and audio levels"
        class="mb-0"
      />
    </v-card-text>

    <!-- Remove Confirmation Dialog -->
    <v-dialog v-model="showRemoveDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">
          Remove Device
        </v-card-title>
        
        <v-card-text>
          Are you sure you want to remove <strong>{{ device.name || device.ip }}</strong>?
          This action cannot be undone.
        </v-card-text>
        
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showRemoveDialog = false">
            Cancel
          </v-btn>
          <v-btn 
            color="error" 
            variant="elevated"
            @click="handleRemove"
          >
            Remove
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import AudioMeter from '@/components/AudioMeter.vue' // DO NOT CHANGE THIS IMPORT
import type { Device } from '@/composables/useDevices'

interface Props {
  device: Device
  showDebug?: boolean
}

interface Emits {
  (e: 'remove', id: number): void
  (e: 'edit', id: number): void
}

const props = withDefaults(defineProps<Props>(), {
  showDebug: false,
})

const emit = defineEmits<Emits>()

// State
const loading = ref(false)
const showRemoveDialog = ref(false)
const currentDisplayUrl = ref<string>('')
const imageRefreshInterval = ref<NodeJS.Timeout | null>(null)

// Channel management with localStorage persistence (keeping existing logic)
const availableChannels = [1, 2, 3, 4, 5, 6, 7, 8]

const getStorageKey = () => `deviceCard_channel_${props.device.id}`

const loadSavedChannel = (): number | '' => {
  try {
    const saved = localStorage.getItem(getStorageKey())
    if (saved && saved !== '') {
      const channel = parseInt(saved)
      if (availableChannels.includes(channel)) {
        return channel
      }
    }
  } catch (error) {
    console.warn('Failed to load saved channel from localStorage:', error)
  }
  return ''
}

const saveChannel = (channel: number | '') => {
  try {
    const key = getStorageKey()
    if (channel === '') {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, channel.toString())
    }
  } catch (error) {
    console.warn('Failed to save channel to localStorage:', error)
  }
}

const selectedChannel = ref<number | ''>(loadSavedChannel())

// Channel items for v-select
const channelItems = computed(() => [
  { title: 'Select Channel', value: '' },
  ...availableChannels.map(channel => ({
    title: `Channel ${channel}`,
    value: channel,
  })),
])

// Image management (keeping existing logic)
const onChannelChange = () => {
  if (selectedChannel.value !== '') {
    initializeImage()
  }
}

const refreshImage = async () => {
  if (!selectedChannel.value) return
  
  try {
    const timestamp = Date.now()
    const refreshUrl = `/api/devices/${props.device.id}/channels/${selectedChannel.value}/preview?t=${timestamp}`
    await loadNewImage(refreshUrl)
  } catch (error) {
    console.warn(`🖼️ Refresh failed for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
  }
}

const loadNewImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      currentDisplayUrl.value = url
      resolve()
    }
    img.onerror = reject
    img.src = url
  })
}

const onImageError = () => {
  console.warn(`🖼️ Image error for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
  const fallbackUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
  currentDisplayUrl.value = fallbackUrl
}

const initializeImage = async () => {
  if (!selectedChannel.value) return
  
  try {
    const initialUrl = `/api/devices/${props.device.id}/channels/${selectedChannel.value}/preview`
    await loadNewImage(initialUrl)
    
    // Start refresh interval
    if (imageRefreshInterval.value) {
      clearInterval(imageRefreshInterval.value)
    }
    imageRefreshInterval.value = setInterval(refreshImage, 5000)
  } catch (error) {
    console.warn(`🖼️ Failed to load initial image for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
    const fallbackUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
    currentDisplayUrl.value = fallbackUrl
  }
}

// Lifecycle
onMounted(() => {
  if (selectedChannel.value) {
    initializeImage()
  }
})

onBeforeUnmount(() => {
  if (imageRefreshInterval.value) {
    clearInterval(imageRefreshInterval.value)
  }
})

// Watch for channel changes and persist to localStorage
watch(selectedChannel, async (newChannel) => {
  saveChannel(newChannel)
  
  if (imageRefreshInterval.value) {
    clearInterval(imageRefreshInterval.value)
  }
  
  if (newChannel !== '') {
    await initializeImage()
  }
})

// Remove confirmation
const confirmRemove = () => {
  showRemoveDialog.value = true
}

const handleRemove = () => {
  emit('remove', props.device.id)
  showRemoveDialog.value = false
}
</script>

<style scoped>
.device-card {
  transition: all 0.3s ease;
}

.device-card:hover {
  transform: translateY(-2px);
}

.preview-container {
  position: relative;
}

.preview-image {
  border-radius: 8px;
  overflow: hidden;
}

.refresh-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.preview-container:hover .refresh-btn {
  opacity: 1;
}

.audio-meter-container {
  margin-top: 8px;
}

/* Fix dropdown menu styling */
:deep(.device-menu-card) {
  background-color: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgb(var(--v-theme-outline-variant)) !important;
}

:deep(.device-menu-card .v-list) {
  background-color: transparent !important;
}

:deep(.device-menu-card .v-list-item) {
  color: rgb(var(--v-theme-on-surface)) !important;
}

:deep(.device-menu-card .v-list-item:hover) {
  background-color: rgb(var(--v-theme-surface-variant)) !important;
}

:deep(.device-menu-card .text-error) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(.device-menu-card .text-error:hover) {
  background-color: rgba(var(--v-theme-error), 0.1) !important;
}
</style>
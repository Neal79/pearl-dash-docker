<template>
  <div class="bg-gray-800 rounded-lg shadow-lg px-2 py-2 relative">
    <!-- Device Header -->
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-semibold text-white">{{ device.name || device.ip }}</h3>
      <button 
        @click="$emit('remove', device.id)"
        class="text-red-400 hover:text-red-300 transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>

    <!-- Channel Selector -->
    <div class="mb-2 flex gap-1">
      <div class="flex-1">
        <label class="block text-xs font-medium text-gray-300 mb-1">Channel</label>
        <select 
          v-model="selectedChannel" 
          @change="onChannelChange"
          class="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 px-2 py-1.5"
        >
          <option value="">Select Channel</option>
          <option v-for="channel in availableChannels" :key="channel" :value="channel">
            Channel {{ channel }}
          </option>
        </select>
      </div>
      <div class="w-12"></div>
    </div>

    <!-- Main Content Area -->
    <div v-if="selectedChannel" class="flex gap-1">
      <!-- Still Image -->
      <div class="flex-1">
        <div class="bg-gray-900 rounded-lg overflow-hidden aspect-video relative">
          <!-- Single image with seamless URL swapping -->
          <img 
            v-if="currentDisplayUrl"
            :src="currentDisplayUrl" 
            :alt="`${device.name || device.ip} Channel ${selectedChannel}`"
            class="w-full h-full object-cover"
            @error="onImageError"
          />
          
          <!-- Fallback placeholder when no image is ready -->
          <div 
            v-else
            class="w-full h-full flex items-center justify-center text-gray-400 text-sm"
          >
            Loading preview...
          </div>
        </div>
      </div>

      <!-- Vertical Audio Meter -->
      <div class="w-12 flex">
        <AudioMeter 
          :device="device.ip" 
          :channel="selectedChannel"
          :connection-status="connectionStatus"
        />
      </div>
    </div>

    <!-- Connection Status -->
    <div class="mt-2 flex items-center justify-between text-xs">
      <div class="flex items-center space-x-2">
        <div 
          class="w-2 h-2 rounded-full" 
          :class="connectionStatus === 'connected' ? 'bg-green-400' : 
                  connectionStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'"
        ></div>
        <span class="text-gray-400">
          {{ connectionStatus === 'connected' ? 'Connected' : 
             connectionStatus === 'connecting' ? 'Connecting' : 'Disconnected' }}
        </span>
      </div>
      
      <div v-if="selectedChannel" class="text-gray-500">
        <a 
          :href="`http://${device.ip}`" 
          target="_blank" 
          class="text-blue-400 hover:text-blue-300 transition-colors"
        >
          {{ device.ip }}
        </a>
      </div>
    </div>

    <!-- Debug Info -->
    <div v-if="showDebug" class="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-400">
      <div>Selected Channel: {{ selectedChannel }}</div>
      <div>WebSocket Status: {{ connectionStatus }}</div>
      <div>Current Display URL: {{ currentDisplayUrl }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAudioMeterWebSocket } from '../composables/useAudioMeterWebSocket'
import AudioMeter from './AudioMeter.vue'

interface Device {
  id: number
  name?: string
  ip: string
}

interface Props {
  device: Device
  showDebug?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showDebug: false
})

defineEmits<{
  remove: [id: number]
}>()

// Channel management with localStorage persistence
const availableChannels = [1, 2, 3, 4, 5, 6, 7, 8]

// Create a unique storage key for this device
const getStorageKey = () => `deviceCard_channel_${props.device.id}`

// Load saved channel from localStorage
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

// Save channel to localStorage
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

// Initialize selectedChannel with saved value
const selectedChannel = ref<number | ''>(loadSavedChannel())

// WebSocket connection for audio meters  
const { connected, connecting } = useAudioMeterWebSocket()

// Computed connection status
const connectionStatus = computed(() => {
  if (connected.value) return 'connected'
  if (connecting.value) return 'connecting'
  return 'disconnected'
})

// Still image URL using proxy API (same as ChannelCard)
const stillImageUrl = computed(() => {
  if (!selectedChannel.value) return ''
  return `/api/devices/${props.device.id}/channels/${selectedChannel.value}/preview?_=${Date.now()}`
})

// Seamless image loading system
const currentDisplayUrl = ref('')

// Function to preload and seamlessly switch images
const loadNewImage = (url: string): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Only update the display URL after the image is fully loaded
      currentDisplayUrl.value = url
      resolve()
    }
    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

// Refresh image with seamless transition
const refreshImage = async () => {
  if (!selectedChannel.value) return
  
  const newUrl = `/api/devices/${props.device.id}/channels/${selectedChannel.value}/preview?_=${Date.now()}`
  
  try {
    await loadNewImage(newUrl)
  } catch (error) {
    console.warn(`🖼️ Failed to load still image for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
    // On error, set fallback image
    const fallbackUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
    currentDisplayUrl.value = fallbackUrl
  }
}

// Handle image error
const onImageError = () => {
  console.warn(`🖼️ Image error for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
  const fallbackUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
  currentDisplayUrl.value = fallbackUrl
}

// Auto-refresh image every 10 seconds
let imageRefreshInterval: any

// Initialize image loading
const initializeImage = async () => {
  if (!selectedChannel.value) return
  
  const initialUrl = `/api/devices/${props.device.id}/channels/${selectedChannel.value}/preview?_=${Date.now()}`
  
  try {
    await loadNewImage(initialUrl)
  } catch (error) {
    console.warn(`🖼️ Failed to load initial image for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
    const fallbackUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
    currentDisplayUrl.value = fallbackUrl
  }
}

onMounted(() => {
  if (selectedChannel.value) {
    initializeImage()
    imageRefreshInterval = setInterval(refreshImage, 10000)
  }
})

onBeforeUnmount(() => {
  if (imageRefreshInterval) {
    clearInterval(imageRefreshInterval)
  }
})

// Watch for channel changes and persist to localStorage
watch(selectedChannel, async (newChannel) => {
  // Save to localStorage
  saveChannel(newChannel)
  
  // Handle image refresh interval
  if (imageRefreshInterval) {
    clearInterval(imageRefreshInterval)
  }
  if (selectedChannel.value) {
    currentDisplayUrl.value = '' // Clear current image
    await initializeImage()
    imageRefreshInterval = setInterval(refreshImage, 10000)
  } else {
    currentDisplayUrl.value = ''
  }
})

// Handle channel change
const onChannelChange = () => {
  console.log(`📺 Channel changed to ${selectedChannel.value} for device ${props.device.name || props.device.ip}`)
  
  // Subscribe to audio meter data for this device:channel
  if (selectedChannel.value) {
    console.log(`🎵 Subscribing to audio meter: ${props.device.ip}:${selectedChannel.value}`)
    subscribe(props.device.ip, selectedChannel.value)
  }
}
</script>

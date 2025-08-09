<template>
  <!-- Fullscreen Mode - render directly in component root -->
  <div v-if="isFullscreen" class="fullscreen-container">
    <PearlDeviceCard 
      :device="devices.find(d => d.id === fullscreenDeviceId)!" 
      @remove="handleRemoveDevice"
      @toggle-fullscreen="handleToggleFullscreen"
      :is-fullscreen="true"
      class="fullscreen-card"
    />
  </div>

  <!-- Normal Mode - use container -->
  <v-container 
    v-else
    fluid 
    :class="mobile ? 'pa-4' : 'pa-6'"
    class="main-container fill-height"
  >
    <!-- Loading State -->
    <div v-if="loading" class="d-flex justify-center align-center" style="height: 200px;">
      <v-progress-circular 
        indeterminate 
        color="primary" 
        size="64"
      />
    </div>

    <!-- Empty State -->
    <div v-else-if="devices.length === 0" class="d-flex flex-column align-center justify-center" style="height: 400px;">
      <v-icon size="120" color="grey-lighten-1" class="mb-6">
        mdi-monitor-off
      </v-icon>
      <div class="text-h4 text-medium-emphasis mb-4">No devices added yet</div>
      <div class="text-body-1 text-medium-emphasis mb-6 text-center" style="max-width: 400px;">
        Get started by adding your first Pearl device to begin monitoring audio streams and managing recordings.
      </div>
      <v-btn
        color="primary"
        size="large"
        prepend-icon="mdi-plus"
        @click="$emit('show-add-modal')"
      >
        Add Your First Device
      </v-btn>
    </div>

    <!-- Pearl Device Cards Grid with Drag and Drop -->
    <div v-else>
      <!-- Normal Grid Mode -->
      <draggable 
        v-model="localDevices" 
        :disabled="mobile"
        ghost-class="ghost"
        chosen-class="no-effect"
        drag-class="drag"
        @start="handleDragStart"
        @end="handleDragEnd"
        item-key="id"
        class="device-grid"
      >
        <template #item="{ element: device }">
          <div class="device-grid-item draggable-item">
            <PearlDeviceCard 
              :device="device" 
              @remove="handleRemoveDevice"
              @toggle-fullscreen="handleToggleFullscreen"
              :is-fullscreen="false"
              :class="dragging ? 'dragging-card' : ''"
            />
          </div>
        </template>
      </draggable>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDisplay } from 'vuetify'
import draggable from 'vuedraggable'
import PearlDeviceCard from '@/components/PearlDeviceCard.vue'

interface Device {
  id: number
  name?: string
  ip: string
  username: string
  password: string
}

// Props
const props = defineProps<{
  devices: Device[]
  loading: boolean
  fullscreenDeviceId: number | null
}>()

// Emits
const emit = defineEmits<{
  'remove-device': [deviceId: number]
  'toggle-fullscreen': [deviceId: number]
  'show-add-modal': []
  'drag-start': []
  'drag-end': [devices: Device[]]
}>()

// Mobile detection
const { mobile } = useDisplay()

// Local dragging state
const dragging = ref(false)

// Computed properties
const isFullscreen = computed(() => props.fullscreenDeviceId !== null)

// Create local reactive copy for draggable
const localDevices = ref<Device[]>([...props.devices])

// Watch props.devices and sync with localDevices
watch(() => props.devices, (newDevices) => {
  localDevices.value = [...newDevices]
}, { deep: true })

// Event handlers
const handleRemoveDevice = (deviceId: number) => {
  emit('remove-device', deviceId)
}

const handleToggleFullscreen = (deviceId: number) => {
  emit('toggle-fullscreen', deviceId)
}

const handleDragStart = () => {
  dragging.value = true
  emit('drag-start')
}

const handleDragEnd = () => {
  dragging.value = false
  // Emit the new device order back to parent
  emit('drag-end', localDevices.value)
}
</script>

<style scoped>
/* Fix main content overflow */
.main-container {
  max-width: 100vw;
  overflow-x: hidden;
}

/* Device Grid Layout */
.device-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  width: 100%;
  margin: 0;
  padding: 0;
}

.device-grid-item {
  flex: 1 1 auto;
  width: 100%;
  max-width: 400px;
  min-width: 320px;
}

/* Desktop - multiple columns */
@media (min-width: 900px) {
  .device-grid-item {
    flex: 0 0 auto;
    width: 400px;
  }
}

/* Tablet - 2 columns */
@media (min-width: 768px) and (max-width: 899px) {
  .device-grid-item {
    flex: 0 0 calc(50% - 12px);
    width: auto;
    max-width: none;
  }
}

/* Mobile - single column */
@media (max-width: 767px) {
  .device-grid {
    gap: 16px;
  }
  
  .device-grid-item {
    flex: 1 1 100%;
    width: 100%;
    max-width: none;
    min-width: 280px;
  }
}

/* Drag and drop styles */
.draggable-item {
  transition: all 0.3s ease;
}

/* Desktop drag styles */
@media (min-width: 768px) {
  .draggable-item {
    cursor: grab;
  }

  .draggable-item:active {
    cursor: grabbing;
  }
}

/* Mobile - no drag cursor */
@media (max-width: 767px) {
  .draggable-item {
    cursor: default;
  }
}

.ghost {
  opacity: 0.5;
}

.chosen {
  transform: rotate(2deg);
  z-index: 1000;
}

.no-effect {
  /* No visual changes - ready for future customization */
  z-index: inherit;
}

.drag {
  transform: rotate(2deg);
  opacity: 0.8;
  z-index: 1000;
}

.dragging-card {
  cursor: grabbing !important;
}

/* Fullscreen styles */
.fullscreen-container {
  width: 100%;
  height: calc(100vh - 64px); /* Account for app bar */
  display: flex;
  align-items: center; /* Center vertically */
  justify-content: center; /* Center horizontally */
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.fullscreen-card {
  /* Desktop: narrower for perfect fit */
  width: 50vw; 
  max-width: 800px; 
  height: calc(100vh - 100px); /* Fixed height to prevent internal overflow */
  min-width: 320px; /* Ensure minimum usable width */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin: 16px auto; /* Center horizontally with margins */
  display: flex;
  flex-direction: column;
  overflow: hidden; /* No scrolling */
}

/* Tablet responsive */
@media (max-width: 1024px) {
  .fullscreen-card {
    width: 80vw; /* Wider on tablet */
    max-width: none;
  }
}

/* Mobile responsive */
@media (max-width: 768px) {
  .fullscreen-card {
    width: 90vw; /* A bit narrower on mobile */
    margin: 8px auto; /* Smaller margins */
    height: calc(100vh - 80px); /* Account for smaller margins */
  }
}

/* Reset all container constraints in fullscreen */
.fullscreen-card :deep(.preview-container) {
  min-height: auto !important; /* Remove forced heights */
  flex: 1; /* Take available space */
  display: flex;
  flex-direction: column;
}

.fullscreen-card :deep(.v-card-text) {
  padding: 16px !important; /* Normal padding */
  flex: 1; /* Take available space */
  overflow: hidden; /* No internal scrolling */
}

.fullscreen-card :deep(.audio-meter-wrapper) {
  width: 80px;
}

.fullscreen-card :deep(.status-container) {
  min-height: 500px;
  height: 100%;
}

.fullscreen-card :deep(.controls-section) {
  margin-top: 0;
  padding-top: 0;
}

.fullscreen-card :deep(.preview-wrapper) {
  /* Use full card width in fullscreen mode */
  max-width: none; /* Remove width constraints */
  width: 100%; /* Use full card width */
  min-width: 0;
  margin: 0; /* No centering needed if using full width */
}

/* Fullscreen mode: remove gap between image and audio meter */
.fullscreen-card :deep(.d-flex.ga-2) {
  gap: 0 !important;
}

/* Fullscreen mode: make audio meter stick to image edge */
.fullscreen-card :deep(.audio-meter-wrapper) {
  margin-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
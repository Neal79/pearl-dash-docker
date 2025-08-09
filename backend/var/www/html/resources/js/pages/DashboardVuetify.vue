<template>
  <VuetifyAppLayout @add-device="showAddDialog = true">
    <!-- Main Dashboard Content -->
    <DeviceGrid
      :devices="devices"
      :loading="loading"
      :error="error"
      :show-debug="false"
      @add-device="showAddDialog = true"
      @remove-device="handleRemoveDevice"
      @edit-device="handleEditDevice"
      @retry="fetchDevices"
      @clear-error="error = null"
    />

    <!-- Add Device Dialog -->
    <AddDeviceDialog
      v-model="showAddDialog"
      @add="handleAddDevice"
    />

    <!-- Global Snackbar for Success Messages -->
    <v-snackbar
      v-model="showSnackbar"
      :color="snackbarColor"
      :timeout="4000"
      location="bottom right"
    >
      <div class="d-flex align-center">
        <v-icon :icon="snackbarIcon" class="mr-2" />
        {{ snackbarMessage }}
      </div>
      
      <template v-slot:actions>
        <v-btn
          variant="text"
          @click="showSnackbar = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </VuetifyAppLayout>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import VuetifyAppLayout from '@/layouts/VuetifyAppLayout.vue'
import DeviceGrid from '@/components/ui/DeviceGrid.vue'
import AddDeviceDialog from '@/components/device/AddDeviceDialog.vue'
import { useDevices, type AddDeviceForm } from '@/composables/useDevices'
import { useThemeVuetify } from '@/composables/useThemeVuetify'

// Initialize composables
const { devices, loading, error, addDevice, removeDevice, fetchDevices } = useDevices()
const { initializeTheme } = useThemeVuetify()

// Component state
const showAddDialog = ref(false)

// Snackbar state
const showSnackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error' | 'info'>('success')
const snackbarIcon = ref('mdi-check-circle')

// Show snackbar with message
const showMessage = (message: string, color: 'success' | 'error' | 'info' = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbarIcon.value = color === 'success' ? 'mdi-check-circle' : 
                       color === 'error' ? 'mdi-alert-circle' : 'mdi-information'
  showSnackbar.value = true
}

// Handle adding a new device
const handleAddDevice = async (deviceData: AddDeviceForm) => {
  const newDevice = await addDevice(deviceData)
  
  if (newDevice) {
    showMessage(`Device "${newDevice.name || newDevice.ip}" added successfully!`)
    showAddDialog.value = false
  } else {
    showMessage('Failed to add device. Please try again.', 'error')
  }
}

// Handle removing a device
const handleRemoveDevice = async (deviceId: number) => {
  // Find device name for confirmation message
  const device = devices.find(d => d.id === deviceId)
  const deviceName = device?.name || device?.ip || 'Unknown device'
  
  const success = await removeDevice(deviceId)
  
  if (success) {
    showMessage(`Device "${deviceName}" removed successfully!`)
  } else {
    showMessage('Failed to remove device. Please try again.', 'error')
  }
}

// Handle editing a device (placeholder for future implementation)
const handleEditDevice = (deviceId: number) => {
  // TODO: Implement device editing functionality
  console.log('Edit device:', deviceId)
  showMessage('Device editing coming soon!', 'info')
}

// Initialize theme on mount
initializeTheme()
</script>

<style scoped>
/* Add any dashboard-specific styles here */
</style>
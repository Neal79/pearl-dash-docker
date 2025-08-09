<template>
  <v-container fluid class="pa-6">
    <!-- Loading State -->
    <div v-if="loading" class="d-flex justify-center py-12">
      <div class="text-center">
        <v-progress-circular
          size="48"
          color="primary"
          indeterminate
        />
        <div class="text-body-1 text-medium-emphasis mt-4">
          Loading devices...
        </div>
      </div>
    </div>

    <!-- Error State -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      class="mb-6"
      closable
      @click:close="$emit('clearError')"
    >
      <template v-slot:title>
        <strong>Error loading devices</strong>
      </template>
      {{ error }}
      <template v-slot:append>
        <v-btn
          variant="outlined"
          size="small"
          @click="$emit('retry')"
        >
          Retry
        </v-btn>
      </template>
    </v-alert>

    <!-- Empty State -->
    <EmptyState 
      v-else-if="devices.length === 0"
      @add-device="$emit('addDevice')"
    />

    <!-- Device Grid -->
    <div v-else>
      <v-row>
        <v-col
          v-for="device in devices"
          :key="device.id"
          cols="12"
          sm="6"
          md="4"
          lg="3"
          xl="3"
        >
          <DeviceCardVuetify
            :device="device"
            :show-debug="showDebug"
            @remove="$emit('removeDevice', $event)"
            @edit="$emit('editDevice', $event)"
          />
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import DeviceCardVuetify from '@/components/device/DeviceCardVuetify.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { Device } from '@/composables/useDevices'

interface Props {
  devices: Device[]
  loading?: boolean
  error?: string | null
  showDebug?: boolean
}

interface Emits {
  (e: 'addDevice'): void
  (e: 'removeDevice', id: number): void
  (e: 'editDevice', id: number): void
  (e: 'retry'): void
  (e: 'clearError'): void
}

withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
  showDebug: false,
})

defineEmits<Emits>()
</script>

<style scoped>
/* Responsive grid adjustments */
@media (max-width: 600px) {
  :deep(.v-container) {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }
}

@media (min-width: 1920px) {
  :deep(.v-col-xl-3) {
    flex: 0 0 20%;
    max-width: 20%;
  }
}
</style>
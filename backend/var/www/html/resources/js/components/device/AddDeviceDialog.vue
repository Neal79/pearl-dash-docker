<template>
  <v-dialog 
    v-model="dialogModel" 
    max-width="500"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <div class="d-flex align-center">
          <v-icon color="primary" class="mr-3">mdi-monitor-plus</v-icon>
          <span class="text-h5">Add Pearl Device</span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="closeDialog"
          :disabled="loading"
        />
      </v-card-title>

      <v-divider />

      <v-form 
        ref="formRef"
        v-model="formValid"
        @submit.prevent="handleSubmit"
      >
        <v-card-text class="pa-6">
          <v-container class="pa-0">
            <v-row>
              <!-- IP Address -->
              <v-col cols="12">
                <v-text-field
                  v-model="form.ip"
                  label="IP Address"
                  placeholder="192.168.1.100"
                  prepend-inner-icon="mdi-ip-network"
                  variant="outlined"
                  :rules="ipRules"
                  :error-messages="fieldErrors.ip"
                  required
                  @input="clearFieldError('ip')"
                />
              </v-col>

              <!-- Device Name -->
              <v-col cols="12">
                <v-text-field
                  v-model="form.name"
                  label="Device Name"
                  placeholder="Main Lobby (optional)"
                  prepend-inner-icon="mdi-tag"
                  variant="outlined"
                  hint="Optional: Give your device a friendly name"
                  persistent-hint
                />
              </v-col>

              <!-- Username -->
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.username"
                  label="Username"
                  placeholder="admin"
                  prepend-inner-icon="mdi-account"
                  variant="outlined"
                  :rules="usernameRules"
                  :error-messages="fieldErrors.username"
                  required
                  @input="clearFieldError('username')"
                />
              </v-col>

              <!-- Password -->
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  label="Password"
                  placeholder="Enter password"
                  prepend-inner-icon="mdi-lock"
                  :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                  variant="outlined"
                  :rules="passwordRules"
                  :error-messages="fieldErrors.password"
                  required
                  @click:append-inner="showPassword = !showPassword"
                  @input="clearFieldError('password')"
                />
              </v-col>
            </v-row>
          </v-container>

          <!-- Error Alert -->
          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            class="mt-4"
            closable
            @click:close="error = null"
          >
            {{ error }}
          </v-alert>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-6">
          <v-spacer />
          
          <v-btn
            @click="closeDialog"
            :disabled="loading"
          >
            Cancel
          </v-btn>
          
          <v-btn
            type="submit"
            color="primary"
            variant="elevated"
            :loading="loading"
            :disabled="!formValid"
            class="ml-2"
          >
            <v-icon start>mdi-plus</v-icon>
            Add Device
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AddDeviceForm } from '@/composables/useDevices'

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'add', device: AddDeviceForm): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Form state
const formRef = ref()
const formValid = ref(false)
const loading = ref(false)
const showPassword = ref(false)
const error = ref<string | null>(null)

// Form data
const form = ref<AddDeviceForm>({
  ip: '',
  name: '',
  username: 'admin', // Default username
  password: '',
})

// Field-specific errors
const fieldErrors = ref<Partial<Record<keyof AddDeviceForm, string[]>>>({})

// Two-way binding for dialog
const dialogModel = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Validation rules
const ipRules = [
  (v: string) => !!v || 'IP address is required',
  (v: string) => {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    return ipRegex.test(v) || 'Please enter a valid IP address'
  },
]

const usernameRules = [
  (v: string) => !!v || 'Username is required',
  (v: string) => v.length >= 2 || 'Username must be at least 2 characters',
]

const passwordRules = [
  (v: string) => !!v || 'Password is required',
]

// Clear field error when user starts typing
const clearFieldError = (field: keyof AddDeviceForm) => {
  if (fieldErrors.value[field]) {
    fieldErrors.value[field] = []
  }
  error.value = null
}

// Handle form submission
const handleSubmit = async () => {
  if (!formValid.value) return

  loading.value = true
  error.value = null
  fieldErrors.value = {}

  try {
    // Emit the add event
    emit('add', { ...form.value })
    
    // Close dialog and reset form on success
    closeDialog()
  } catch (e: any) {
    // Handle validation errors
    if (e.response?.status === 422 && e.response?.data?.errors) {
      fieldErrors.value = e.response.data.errors
    } else {
      error.value = e.message || 'Failed to add device. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

// Close dialog and reset form
const closeDialog = () => {
  emit('update:modelValue', false)
  resetForm()
}

// Reset form to initial state
const resetForm = () => {
  form.value = {
    ip: '',
    name: '',
    username: 'admin',
    password: '',
  }
  error.value = null
  fieldErrors.value = {}
  showPassword.value = false
  
  // Reset form validation
  if (formRef.value) {
    formRef.value.reset()
  }
}

// Reset form when dialog closes
watch(() => props.modelValue, (newValue) => {
  if (!newValue) {
    // Small delay to allow dialog close animation
    setTimeout(resetForm, 300)
  }
})
</script>

<style scoped>
/* Add any custom styling if needed */
:deep(.v-text-field .v-field) {
  border-radius: 8px;
}
</style>
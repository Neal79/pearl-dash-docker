<template>
  <v-dialog 
    :model-value="true" 
    @update:model-value="emit('close')"
    max-width="500px"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span class="text-h5">Add Pearl Device</span>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="emit('close')"
        />
      </v-card-title>

      <v-divider />

      <v-card-text class="pt-6">
        <v-form ref="form" v-model="valid" @submit.prevent="submitForm">
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="formData.ip"
                label="IP Address"
                placeholder="192.168.1.100"
                prepend-inner-icon="mdi-ip-network"
                variant="outlined"
                :rules="ipRules"
                required
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="formData.name"
                label="Device Name (Optional)"
                placeholder="Main Lobby"
                prepend-inner-icon="mdi-rename-box"
                variant="outlined"
                :rules="nameRules"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="formData.username"
                label="Username"
                placeholder="admin"
                prepend-inner-icon="mdi-account"
                variant="outlined"
                :rules="usernameRules"
                required
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="formData.password"
                label="Password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Password"
                prepend-inner-icon="mdi-lock"
                :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                variant="outlined"
                :rules="passwordRules"
                required
                @click:append-inner="showPassword = !showPassword"
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          color="grey"
          variant="text"
          @click="emit('close')"
        >
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :loading="loading"
          :disabled="!valid"
          @click="submitForm"
        >
          Add Device
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

interface DeviceFormData {
  ip: string
  name: string
  username: string
  password: string
}

const emit = defineEmits<{
  close: []
  add: [device: DeviceFormData]
}>()

const form = ref()
const valid = ref(false)
const showPassword = ref(false)
const loading = ref(false)

const formData = reactive<DeviceFormData>({
  ip: '',
  name: '',
  username: '',
  password: ''
})

// Validation rules
const ipRules = [
  (v: string) => !!v || 'IP address is required',
  (v: string) => {
    const ipRegex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/
    return ipRegex.test(v) || 'Please enter a valid IP address'
  }
]

const nameRules = [
  (v: string) => !v || v.length <= 100 || 'Name must be less than 100 characters'
]

const usernameRules = [
  (v: string) => !!v || 'Username is required',
  (v: string) => v.length <= 100 || 'Username must be less than 100 characters'
]

const passwordRules = [
  (v: string) => !!v || 'Password is required',
  (v: string) => v.length <= 100 || 'Password must be less than 100 characters'
]

const submitForm = async () => {
  const { valid: isValid } = await form.value.validate()
  
  if (isValid) {
    loading.value = true
    
    try {
      // Emit the form data to parent
      emit('add', { ...formData })
      
      // Reset form
      Object.assign(formData, {
        ip: '',
        name: '',
        username: '',
        password: ''
      })
      
      form.value.reset()
    } finally {
      loading.value = false
    }
  }
}
</script>

<style scoped>
.v-card {
  overflow: visible;
}
</style>
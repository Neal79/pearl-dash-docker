<template>
  <v-app>
    <!-- Theme Toggle (Top Right) -->
    <v-btn
      :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
      variant="text"
      size="large"
      class="theme-toggle"
      @click="toggleTheme"
    />

    <!-- Main Content -->
    <v-main class="login-background">
      <v-container fluid class="fill-height">
        <v-row justify="center" align="center" class="fill-height">
          <v-col cols="12" sm="8" md="6" lg="4" xl="3">
            <!-- Add User Card -->
            <v-card
              elevation="8"
              rounded="xl"
              class="login-card"
            >
              <!-- Header -->
              <v-card-text class="text-center pt-8 pb-6">
                <!-- Logo -->
                <v-avatar 
                  color="primary" 
                  size="64" 
                  class="mb-4"
                >
                  <v-icon color="white" size="32">mdi-account-plus</v-icon>
                </v-avatar>
                
                <!-- Title -->
                <div class="text-h4 font-weight-bold mb-2">Add New User</div>
                <div class="text-body-1 text-medium-emphasis">
                  Create a new Pearl Dashboard account
                </div>
              </v-card-text>

              <!-- Add User Form -->
              <v-card-text class="px-8 pb-8">
                <v-form
                  ref="userForm"
                  v-model="formValid"
                  @submit.prevent="handleAddUser"
                >
                  <!-- Name Field -->
                  <v-text-field
                    v-model="form.name"
                    label="Full Name"
                    type="text"
                    prepend-inner-icon="mdi-account"
                    variant="outlined"
                    :rules="nameRules"
                    :error-messages="errors.name"
                    :disabled="loading"
                    required
                    class="mb-4"
                    rounded="lg"
                  />

                  <!-- Email Field -->
                  <v-text-field
                    v-model="form.email"
                    label="Email"
                    type="email"
                    prepend-inner-icon="mdi-email"
                    variant="outlined"
                    :rules="emailRules"
                    :error-messages="errors.email"
                    :disabled="loading"
                    required
                    class="mb-4"
                    rounded="lg"
                  />

                  <!-- Password Field -->
                  <v-text-field
                    v-model="form.password"
                    label="Password"
                    :type="showPassword ? 'text' : 'password'"
                    prepend-inner-icon="mdi-lock"
                    :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                    variant="outlined"
                    :rules="passwordRules"
                    :error-messages="errors.password"
                    :disabled="loading"
                    required
                    class="mb-4"
                    rounded="lg"
                    @click:append-inner="showPassword = !showPassword"
                  />

                  <!-- Confirm Password Field -->
                  <v-text-field
                    v-model="form.password_confirmation"
                    label="Confirm Password"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    prepend-inner-icon="mdi-lock-check"
                    :append-inner-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
                    variant="outlined"
                    :rules="confirmPasswordRules"
                    :error-messages="errors.password_confirmation"
                    :disabled="loading"
                    required
                    class="mb-6"
                    rounded="lg"
                    @click:append-inner="showConfirmPassword = !showConfirmPassword"
                  />

                  <!-- Error Message -->
                  <v-alert
                    v-if="errors.general"
                    type="error"
                    variant="tonal"
                    class="mb-4"
                    rounded="lg"
                  >
                    {{ errors.general }}
                  </v-alert>

                  <!-- Success Message -->
                  <v-alert
                    v-if="successMessage"
                    type="success"
                    variant="tonal"
                    class="mb-4"
                    rounded="lg"
                  >
                    {{ successMessage }}
                  </v-alert>

                  <!-- Submit Button -->
                  <v-btn
                    type="submit"
                    color="primary"
                    variant="flat"
                    size="large"
                    block
                    :loading="loading"
                    :disabled="!formValid || loading"
                    rounded="lg"
                    class="mb-4"
                  >
                    <v-icon left class="mr-2">mdi-account-plus</v-icon>
                    Create User
                  </v-btn>

                  <!-- Back to Dashboard Link -->
                  <div class="text-center">
                    <v-btn
                      variant="text"
                      color="primary"
                      size="small"
                      :disabled="loading"
                      @click="goToDashboard"
                    >
                      ← Back to Dashboard
                    </v-btn>
                  </div>
                </v-form>
              </v-card-text>
            </v-card>

            <!-- Footer -->
            <div class="text-center mt-6">
              <div class="text-caption text-medium-emphasis">
                © 2025 Pearl Dashboard. All rights reserved.
              </div>
            </div>
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <!-- Loading Overlay -->
    <v-overlay
      v-model="loading"
      class="align-center justify-center"
      persistent
    >
      <v-progress-circular
        indeterminate
        size="64"
        color="primary"
      />
    </v-overlay>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTheme } from 'vuetify'
import { router } from '@inertiajs/vue3'

// Theme management
const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)

const toggleTheme = () => {
  theme.global.name.value = isDark.value ? 'light' : 'dark'
  localStorage.setItem('theme', theme.global.name.value)
}

// Form state
const userForm = ref()
const formValid = ref(false)
const loading = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const successMessage = ref('')

// Form data
const form = ref({
  name: '',
  email: '',
  password: '',
  password_confirmation: ''
})

// Error handling
const errors = ref({
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
  general: ''
})

// Form validation rules
const nameRules = [
  (v: string) => !!v || 'Name is required',
  (v: string) => v.length >= 2 || 'Name must be at least 2 characters'
]

const emailRules = [
  (v: string) => !!v || 'Email is required',
  (v: string) => /.+@.+\..+/.test(v) || 'Email must be valid'
]

const passwordRules = [
  (v: string) => !!v || 'Password is required',
  (v: string) => v.length >= 8 || 'Password must be at least 8 characters',
  (v: string) => /[A-Z]/.test(v) || 'Password must contain at least one uppercase letter',
  (v: string) => /[a-z]/.test(v) || 'Password must contain at least one lowercase letter',
  (v: string) => /[0-9]/.test(v) || 'Password must contain at least one number'
]

const confirmPasswordRules = [
  (v: string) => !!v || 'Please confirm your password',
  (v: string) => v === form.value.password || 'Passwords do not match'
]

// Clear errors when user types
const clearErrors = () => {
  errors.value = {
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    general: ''
  }
}

// Handle user creation
const handleAddUser = async () => {
  clearErrors()
  
  if (!userForm.value?.validate()) {
    return
  }
  
  loading.value = true
  
  try {
    // Submit user creation form using Inertia
    router.post('/add-user', {
      name: form.value.name,
      email: form.value.email,
      password: form.value.password,
      password_confirmation: form.value.password_confirmation
    }, {
      onSuccess: () => {
        successMessage.value = 'User created successfully!'
        // Reset form
        form.value = {
          name: '',
          email: '',
          password: '',
          password_confirmation: ''
        }
        userForm.value?.reset()
      },
      onError: (errors: any) => {
        console.error('User creation failed:', errors)
        
        // Handle validation errors
        if (errors.name) {
          errors.value.name = Array.isArray(errors.name) ? errors.name[0] : errors.name
        }
        if (errors.email) {
          errors.value.email = Array.isArray(errors.email) ? errors.email[0] : errors.email
        }
        if (errors.password) {
          errors.value.password = Array.isArray(errors.password) ? errors.password[0] : errors.password
        }
        if (errors.password_confirmation) {
          errors.value.password_confirmation = Array.isArray(errors.password_confirmation) ? errors.password_confirmation[0] : errors.password_confirmation
        }
        
        // Handle general errors
        if (errors.message || errors.error) {
          errors.value.general = errors.message || errors.error || 'Failed to create user'
        } else if (!errors.name && !errors.email && !errors.password && !errors.password_confirmation) {
          errors.value.general = 'User creation failed. Please check your input and try again.'
        }
      },
      onFinish: () => {
        loading.value = false
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    errors.value.general = 'An unexpected error occurred. Please try again.'
    loading.value = false
  }
}

// Navigation
const goToDashboard = () => {
  router.visit('/dashboard')
}

// Initialize component
onMounted(() => {
  // Load theme from localStorage
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    theme.global.name.value = savedTheme
  }
})
</script>

<style scoped>
/* Theme toggle positioning */
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
}

/* Login background */
.login-background {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-secondary)) 100%);
  min-height: 100vh;
}

/* Card styling */
.login-card {
  backdrop-filter: blur(10px);
  background: rgba(var(--v-theme-surface), 0.95) !important;
  border: 1px solid rgba(var(--v-theme-outline), 0.12);
}

/* Form field enhancements */
:deep(.v-field--variant-outlined .v-field__outline) {
  border-width: 2px;
}

:deep(.v-field--focused .v-field__outline) {
  border-color: rgb(var(--v-theme-primary));
}

/* Button styling */
:deep(.v-btn) {
  text-transform: none;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* Alert styling */
:deep(.v-alert) {
  border-radius: 12px !important;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .theme-toggle {
    top: 12px;
    right: 12px;
  }
  
  .login-card {
    margin: 16px;
  }
}

/* Dark mode adjustments */
.v-theme--dark .login-background {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-secondary)) 100%);
}

.v-theme--dark .login-card {
  background: rgba(var(--v-theme-surface), 0.95) !important;
  border: 1px solid rgba(var(--v-theme-outline), 0.2);
}
</style>
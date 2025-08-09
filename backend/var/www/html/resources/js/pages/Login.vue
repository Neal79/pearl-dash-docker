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
            <!-- Login Card -->
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
                  <v-icon color="white" size="32">mdi-view-dashboard</v-icon>
                </v-avatar>
                
                <!-- Title -->
                <div class="text-h4 font-weight-bold mb-2">Pearl Dash</div>
                <div class="text-body-1 text-medium-emphasis">
                  Sign in to your dashboard
                </div>
              </v-card-text>

              <!-- Login Form -->
              <v-card-text class="px-8 pb-8">
                <v-form
                  ref="loginForm"
                  v-model="formValid"
                  @submit.prevent="handleLogin"
                >
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
                    :label="'Password'"
                    :type="showPassword ? 'text' : 'password'"
                    prepend-inner-icon="mdi-lock"
                    :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                    variant="outlined"
                    :rules="passwordRules"
                    :error-messages="errors.password"
                    :disabled="loading"
                    required
                    class="mb-6"
                    rounded="lg"
                    @click:append-inner="showPassword = !showPassword"
                  />

                  <!-- Remember Me -->
                  <v-checkbox
                    v-model="form.remember"
                    label="Remember me"
                    :disabled="loading"
                    class="mb-4"
                    hide-details
                  />

                  <!-- Error Alert -->
                  <v-alert
                    v-if="errors.general"
                    type="error"
                    variant="tonal"
                    class="mb-4"
                    rounded="lg"
                  >
                    {{ errors.general }}
                  </v-alert>

                  <!-- Success Alert -->
                  <v-alert
                    v-if="successMessage"
                    type="success"
                    variant="tonal"
                    class="mb-4"
                    rounded="lg"
                  >
                    {{ successMessage }}
                  </v-alert>

                  <!-- Login Button -->
                  <v-btn
                    type="submit"
                    color="primary"
                    size="large"
                    block
                    :loading="loading"
                    :disabled="!formValid || loading"
                    rounded="lg"
                    class="mb-4"
                  >
                    <v-icon left class="mr-2">mdi-login</v-icon>
                    Sign In
                  </v-btn>

                  <!-- Forgot Password Link -->
                  <div class="text-center">
                    <v-btn
                      variant="text"
                      color="primary"
                      size="small"
                      :disabled="loading"
                      @click="goToForgotPassword"
                    >
                      Forgot your password?
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
const loginForm = ref()
const formValid = ref(false)
const loading = ref(false)
const showPassword = ref(false)
const successMessage = ref('')

// Form data
const form = ref({
  email: '',
  password: '',
  remember: false
})

// Errors
const errors = ref({
  email: '',
  password: '',
  general: ''
})

// Form validation rules
const emailRules = [
  (v: string) => !!v || 'Email is required',
  (v: string) => /.+@.+\..+/.test(v) || 'Email must be valid'
]

const passwordRules = [
  (v: string) => !!v || 'Password is required',
  (v: string) => v.length >= 6 || 'Password must be at least 6 characters'
]

// Clear errors when user types
const clearErrors = () => {
  errors.value = {
    email: '',
    password: '',
    general: ''
  }
}

// Handle login
const handleLogin = async () => {
  clearErrors()
  
  if (!loginForm.value?.validate()) {
    return
  }
  
  loading.value = true
  
  try {
    // Submit login form using Inertia
    router.post('/login', {
      email: form.value.email,
      password: form.value.password,
      remember: form.value.remember
    }, {
      onSuccess: () => {
        successMessage.value = 'Login successful! Redirecting...'
        // Inertia will handle the redirect automatically
      },
      onError: (errors: any) => {
        console.error('Login failed:', errors)
        
        // Handle validation errors
        if (errors.email) {
          errors.value.email = Array.isArray(errors.email) ? errors.email[0] : errors.email
        }
        if (errors.password) {
          errors.value.password = Array.isArray(errors.password) ? errors.password[0] : errors.password
        }
        
        // Handle general authentication errors
        if (errors.message || errors.error) {
          errors.value.general = errors.message || errors.error || 'Invalid email or password'
        } else if (!errors.email && !errors.password) {
          errors.value.general = 'Login failed. Please check your credentials and try again.'
        }
      },
      onFinish: () => {
        loading.value = false
      }
    })
  } catch (error) {
    console.error('Unexpected error during login:', error)
    errors.value.general = 'An unexpected error occurred. Please try again.'
    loading.value = false
  }
}

// Navigation helpers
const goToForgotPassword = () => {
  router.visit('/forgot-password')
}

// Initialize component
onMounted(() => {
  // Load theme from localStorage
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    theme.global.name.value = savedTheme
  }
  
  // Focus email field
  // Note: We'll add this after the component is fully mounted
  setTimeout(() => {
    const emailField = document.querySelector('input[type="email"]') as HTMLInputElement
    if (emailField) {
      emailField.focus()
    }
  }, 100)
})
</script>

<style scoped>
/* Login Background */
.login-background {
  background: linear-gradient(135deg, 
    rgb(var(--v-theme-primary)) 0%, 
    rgb(var(--v-theme-secondary)) 100%
  );
  min-height: 100vh;
  position: relative;
}

/* Background overlay for better contrast */
.login-background::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(var(--v-theme-surface), 0.1);
  backdrop-filter: blur(1px);
}

/* Login Card */
.login-card {
  position: relative;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--v-theme-outline), 0.12);
}

/* Theme Toggle */
.theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  background: rgba(var(--v-theme-surface), 0.9) !important;
  backdrop-filter: blur(10px);
}

/* Form Field Customizations */
:deep(.v-field--variant-outlined) {
  --v-field-border-opacity: 0.12;
}

:deep(.v-field--variant-outlined.v-field--focused) {
  --v-field-border-opacity: 1;
}

/* Button hover effects */
:deep(.v-btn) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.v-btn:hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.3);
}

/* Alert customizations */
:deep(.v-alert) {
  border: none;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .login-card {
    margin: 16px;
  }
  
  :deep(.v-card-text) {
    padding-left: 24px !important;
    padding-right: 24px !important;
  }
}

/* Dark theme adjustments */
.v-theme--dark .login-background {
  background: linear-gradient(135deg, 
    rgba(var(--v-theme-primary), 0.8) 0%, 
    rgba(var(--v-theme-secondary), 0.8) 100%
  );
}

.v-theme--dark .login-background::before {
  background: rgba(var(--v-theme-surface), 0.2);
}

/* Animation for card entrance */
.login-card {
  animation: slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Loading state */
:deep(.v-btn--loading) {
  pointer-events: none;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-outline), 0.1);
}

::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-outline), 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-outline), 0.5);
}
</style>
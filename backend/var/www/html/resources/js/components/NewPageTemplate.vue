<template>
  <v-container 
    fluid 
    :class="mobile ? 'pa-4' : 'pa-6'"
    class="main-container fill-height"
  >
    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-h3 font-weight-bold text-primary mb-2">{{ pageTitle }}</h1>
      <p class="text-body-1 text-medium-emphasis">
        {{ pageDescription }}
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="d-flex justify-center align-center" style="height: 200px;">
      <v-progress-circular 
        indeterminate 
        color="primary" 
        size="64"
      />
    </div>

    <!-- Main Content -->
    <div v-else>
      <!-- Content Grid -->
      <v-row>
        <!-- Left Column -->
        <v-col cols="12" md="8">
          <v-card elevation="2" class="mb-4">
            <v-card-title class="text-h5">
              Main Content Area
            </v-card-title>
            <v-card-text>
              <p class="text-body-1 mb-4">
                This is the main content area. Replace this with your page-specific content.
              </p>
              
              <!-- Example action button -->
              <v-btn
                color="primary"
                prepend-icon="mdi-plus"
                @click="handleAction"
              >
                Example Action
              </v-btn>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Right Column / Sidebar -->
        <v-col cols="12" md="4">
          <v-card elevation="2">
            <v-card-title class="text-h6">
              Sidebar / Info Panel
            </v-card-title>
            <v-card-text>
              <p class="text-body-2 text-medium-emphasis">
                Use this area for secondary information, controls, or navigation.
              </p>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Success Snackbar -->
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3000"
      location="top"
    >
      {{ snackbar.message }}
      <template v-slot:actions>
        <v-btn
          variant="text"
          @click="snackbar.show = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDisplay } from 'vuetify'

// Props (customize for your page)
const props = withDefaults(defineProps<{
  pageTitle?: string
  pageDescription?: string
}>(), {
  pageTitle: 'New Page',
  pageDescription: 'Description of what this page does'
})

// Mobile detection
const { mobile } = useDisplay()

// Page state
const loading = ref(false)

// Snackbar for notifications
const snackbar = ref({
  show: false,
  message: '',
  color: 'success'
})

// Example action handler
const handleAction = () => {
  showSnackbar('Action performed successfully!', 'success')
}

// Show snackbar helper
const showSnackbar = (message: string, color: string = 'success') => {
  snackbar.value = {
    show: true,
    message,
    color
  }
}

// TODO: Add your page-specific logic here
// - API calls
// - State management
// - Event handlers
// - Computed properties
// - Lifecycle hooks (onMounted, etc.)
</script>

<style scoped>
/* Fix main content overflow */
.main-container {
  max-width: 100vw;
  overflow-x: hidden;
}

/* Add your page-specific styles here */
</style>
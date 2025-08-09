<template>
  <div class="empty-state">
    <v-container class="text-center py-12">
      <div class="empty-state-content">
        <!-- Icon -->
        <v-avatar
          size="120"
          color="surface-variant"
          class="mb-6"
        >
          <v-icon
            size="60"
            color="medium-emphasis"
          >
            mdi-monitor-off
          </v-icon>
        </v-avatar>

        <!-- Title -->
        <h2 class="text-h4 font-weight-light text-high-emphasis mb-4">
          No devices added yet
        </h2>

        <!-- Description -->
        <p class="text-body-1 text-medium-emphasis mb-8 mx-auto" style="max-width: 480px;">
          Get started by adding your first Pearl Mini device. You'll be able to monitor 
          audio levels, view channel previews, and manage your streaming setup.
        </p>

        <!-- Call to Action -->
        <v-btn
          color="primary"
          variant="elevated"
          size="large"
          prepend-icon="mdi-plus"
          @click="$emit('addDevice')"
          class="mb-6"
        >
          Add Your First Device
        </v-btn>

        <!-- Help Section -->
        <v-card 
          variant="tonal" 
          color="info"
          class="mx-auto mt-8"
          max-width="600"
        >
          <v-card-text class="pa-6">
            <div class="d-flex align-start">
              <v-icon
                color="info"
                class="mr-4 mt-1"
                size="24"
              >
                mdi-information
              </v-icon>
              
              <div class="text-left">
                <h3 class="text-h6 font-weight-medium mb-2">
                  Getting Started
                </h3>
                
                <div class="text-body-2 text-medium-emphasis">
                  <p class="mb-2">
                    <strong>What you'll need:</strong>
                  </p>
                  <ul class="ml-4">
                    <li>Pearl Mini device IP address</li>
                    <li>Admin username and password</li>
                    <li>Network connection to the device</li>
                  </ul>
                  
                  <p class="mt-4 mb-0">
                    Once added, you can select channels, view live previews, 
                    and monitor audio levels in real-time.
                  </p>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </v-container>
  </div>
</template>

<script setup lang="ts">
interface Emits {
  (e: 'addDevice'): void
}

defineEmits<Emits>()
</script>

<style scoped>
.empty-state {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-content {
  max-width: 800px;
  margin: 0 auto;
}

/* Add subtle animation to the icon */
.v-avatar {
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}
</style>
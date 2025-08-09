<template>
  <v-container 
    fluid 
    :class="mobile ? 'pa-4' : 'pa-6'"
    class="main-container fill-height"
  >
    <!-- Settings Header -->
    <div class="mb-6">
      <h1 class="text-h3 font-weight-bold text-primary">Settings</h1>
    </div>

    <!-- Blank space for future implementation -->
  </v-container>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'

// Mobile detection
const { mobile } = useDisplay()
</script>

<style scoped>
/* Fix main content overflow */
.main-container {
  max-width: 100vw;
  overflow-x: hidden;
}
</style>
<template>
  <v-app>
    <!-- Navigation Drawer -->
    <AppNavigation 
      v-model="drawer"
      :rail="rail"
      @update:rail="rail = $event"
    />
    
    <!-- App Bar -->
    <AppTopBar 
      @toggle-drawer="toggleDrawer"
      @toggle-rail="toggleRail"
      @add-device="$emit('addDevice')"
      :drawer="drawer"
    />

    <!-- Main Content -->
    <v-main>
      <v-container fluid class="fill-height pa-0">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import AppNavigation from './AppNavigation.vue'
import AppTopBar from './AppTopBar.vue'

interface Emits {
  (e: 'addDevice'): void
}

defineEmits<Emits>()

// Responsive state management
const { mobile } = useDisplay()
const drawer = ref(!mobile.value) // Open by default on desktop
const rail = ref(false) // Rail mode for desktop

// Toggle drawer (mobile)
const toggleDrawer = () => {
  drawer.value = !drawer.value
}

// Toggle rail mode (desktop)
const toggleRail = () => {
  rail.value = !rail.value
}

// Auto-adjust drawer based on screen size
onMounted(() => {
  // Close drawer on mobile by default
  if (mobile.value) {
    drawer.value = false
  }
})
</script>
<template>
  <v-app-bar
    :elevation="0"
    color="surface"
    height="64"
    border="b"
  >
    <!-- Mobile: Hamburger Menu -->
    <v-app-bar-nav-icon
      v-if="mobile"
      @click="$emit('toggleDrawer')"
      color="on-surface"
    />
    
    <!-- Desktop: Rail Toggle -->
    <v-btn
      v-else-if="drawer"
      icon="mdi-menu"
      variant="text"
      @click="$emit('toggleRail')"
      color="on-surface"
      class="ml-2"
    />

    <!-- Title -->
    <v-app-bar-title class="text-h5 font-weight-bold text-high-emphasis">
      Pearl Mini Dashboard
    </v-app-bar-title>

    <v-spacer />

    <!-- Theme Toggle -->
    <ThemeToggle :mobile="mobile" />

    <!-- Add Device Button -->
    <v-btn
      color="primary"
      variant="elevated"
      prepend-icon="mdi-plus"
      class="ml-4"
      @click="$emit('addDevice')"
    >
      <span v-if="!mobile">Add Device</span>
    </v-btn>
  </v-app-bar>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'

interface Props {
  drawer?: boolean
}

interface Emits {
  (e: 'toggleDrawer'): void
  (e: 'toggleRail'): void
  (e: 'addDevice'): void
}

defineProps<Props>()
defineEmits<Emits>()

const { mobile } = useDisplay()
</script>

<style scoped>
/* Custom app bar styling */
:deep(.v-toolbar__content) {
  padding-left: 16px;
  padding-right: 16px;
}

@media (max-width: 600px) {
  :deep(.v-toolbar__content) {
    padding-left: 8px;
    padding-right: 8px;
  }
}
</style>
<template>
  <v-navigation-drawer
    v-model="drawerModel"
    :rail="rail"
    permanent
    :mobile="mobile"
    :width="280"
    :rail-width="64"
    color="surface"
    class="app-navigation"
    style="height: 100vh !important;"
  >
    <!-- Header -->
    <div class="pa-4 d-flex align-center justify-center">
      <v-avatar 
        v-if="!rail" 
        size="32" 
        color="primary" 
        class="mr-3"
      >
        <v-icon color="white">mdi-monitor-dashboard</v-icon>
      </v-avatar>
      
      <div v-if="!rail" class="text-h6 text-high-emphasis font-weight-bold">
        Pearl Dash
      </div>
      
      <!-- Rail mode: Just icon -->
      <v-btn
        v-if="rail"
        icon="mdi-monitor-dashboard"
        variant="text"
        color="primary"
        @click="$emit('update:rail', false)"
      />
    </div>

    <v-divider />

    <!-- Navigation List -->
    <v-list 
      density="compact" 
      nav
      class="pa-2"
    >
      <v-list-item
        v-for="item in navigationItems"
        :key="item.title"
        :prepend-icon="item.icon"
        :title="item.title"
        :value="item.value"
        :active="item.active"
        :to="item.to"
        color="primary"
        rounded="lg"
        class="mb-1"
      />
    </v-list>

    <!-- Spacer to push settings to bottom -->
    <v-spacer />

    <!-- Settings Section -->
    <template v-slot:append>
      <div class="pa-2">
        <v-divider class="mb-2" />
        <v-list density="compact" nav>
          <v-list-item
            prepend-icon="mdi-cog"
            title="Settings"
            value="settings"
            color="primary"
            rounded="lg"
          />
        </v-list>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

interface NavigationItem {
  title: string
  icon: string
  value: string
  active?: boolean
  to?: string
}

interface Props {
  modelValue: boolean
  rail?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:rail', value: boolean): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const { mobile } = useDisplay()

// Two-way binding for drawer state
const drawerModel = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Navigation items
const navigationItems: NavigationItem[] = [
  {
    title: 'Dashboard',
    icon: 'mdi-view-dashboard',
    value: 'dashboard',
    active: true, // Mark as active for current page
  },
  {
    title: 'Devices',
    icon: 'mdi-monitor',
    value: 'devices',
  },
  {
    title: 'Audio Streams',
    icon: 'mdi-headphones',
    value: 'audio-streams',
  },
  {
    title: 'Monitoring',
    icon: 'mdi-chart-line',
    value: 'monitoring',
  },
]

</script>

<style scoped>
.app-navigation {
  border-right: 1px solid rgb(var(--v-theme-outline-variant)) !important;
}

/* Custom scrollbar for navigation */
.app-navigation :deep(.v-navigation-drawer__content) {
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--v-theme-outline-variant)) transparent;
}

.app-navigation :deep(.v-navigation-drawer__content)::-webkit-scrollbar {
  width: 4px;
}

.app-navigation :deep(.v-navigation-drawer__content)::-webkit-scrollbar-track {
  background: transparent;
}

.app-navigation :deep(.v-navigation-drawer__content)::-webkit-scrollbar-thumb {
  background-color: rgb(var(--v-theme-outline-variant));
  border-radius: 4px;
}
</style>
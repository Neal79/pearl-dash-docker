<template>
  <v-app>
    <!-- Navigation Drawer -->
    <v-navigation-drawer
      v-model="drawer"
      :rail="rail && !mobile"
      :permanent="!mobile"
      :temporary="mobile"
      :mobile-breakpoint="960"
      color="surface"
      elevation="1"
      :width="280"
      :rail-width="72"
    >
      <!-- Navigation Header -->
      <div class="px-4 py-6">
        <div v-if="!rail" class="d-flex align-center">
          <v-avatar color="primary" size="40" class="mr-3">
            <v-icon color="white" size="24">mdi-view-dashboard</v-icon>
          </v-avatar>
          <div>
            <div class="text-h6 font-weight-bold">Pearl Dash</div>
            <div class="text-caption text-medium-emphasis">Dashboard</div>
          </div>
        </div>
        
        <div v-else class="d-flex justify-center">
          <v-avatar color="primary" size="40">
            <v-icon color="white" size="24">mdi-view-dashboard</v-icon>
          </v-avatar>
        </div>
      </div>

      <v-divider class="mb-2" />

      <!-- Main Navigation -->
      <v-list
        density="compact"
        nav
        class="px-2"
      >
        <v-list-item
          v-for="item in mainNavItems"
          :key="item.value"
          :prepend-icon="item.icon"
          :title="item.title"
          :value="item.value"
          :active="item.active"
          color="primary"
          rounded="xl"
          class="mb-1"
          @click="setActiveItem(item.value)"
        >
          <template v-slot:append v-if="item.badge">
            <v-badge
              :content="item.badge"
              color="error"
              inline
            />
          </template>
        </v-list-item>
      </v-list>

      <!-- Secondary Navigation -->
      <div class="mt-6">
        <v-list-subheader v-if="!rail" class="px-4 text-medium-emphasis">
          TOOLS
        </v-list-subheader>
        
        <v-list
          density="compact"
          nav
          class="px-2"
        >
          <v-list-item
            v-for="item in toolsNavItems"
            :key="item.value"
            :prepend-icon="item.icon"
            :title="item.title"
            :value="item.value"
            :active="item.active"
            color="primary"
            rounded="xl"
            class="mb-1"
            @click="setActiveItem(item.value)"
          />
        </v-list>
      </div>

      <!-- Bottom Navigation -->
      <template v-slot:append>
        <div class="pa-2">
          <v-divider class="mb-2" />
          
          <v-list density="compact" nav>
            <v-list-item
              prepend-icon="mdi-cog"
              title="Settings"
              value="settings"
              color="primary"
              rounded="xl"
              :active="activeItem === 'settings'"
              @click="setActiveItem('settings')"
            />
            
            <v-list-item
              prepend-icon="mdi-help-circle"
              title="Help & Support"
              value="help"
              color="primary"
              rounded="xl"
              :active="activeItem === 'help'"
              @click="setActiveItem('help')"
            />
          </v-list>

          <!-- User Profile (collapsed state) -->
          <div v-if="!rail" class="px-3 py-4 mt-2">
            <div class="d-flex align-center">
              <v-avatar size="32" color="secondary" class="mr-3">
                <v-icon color="white" size="18">mdi-account</v-icon>
              </v-avatar>
              <div class="flex-grow-1">
                <div class="text-body-2 font-weight-medium">Admin User</div>
                <div class="text-caption text-medium-emphasis">admin@example.com</div>
              </div>
              <v-btn
                icon="mdi-dots-vertical"
                size="small"
                variant="text"
                density="compact"
              />
            </div>
          </div>
        </div>
      </template>
    </v-navigation-drawer>

    <!-- App Bar -->
    <v-app-bar
      :elevation="0"
      color="surface"
      border="b"
      height="64"
    >
      <!-- Navigation Toggle -->
      <v-app-bar-nav-icon
        @click="toggleDrawer"
        :icon="rail ? 'mdi-menu-open' : 'mdi-menu'"
      />

      <!-- Page Title -->
      <v-app-bar-title class="font-weight-bold">
        {{ currentPageTitle }}
      </v-app-bar-title>

      <v-spacer />

      <!-- Action Buttons -->
      <div class="d-flex align-center ga-1">
        <!-- Search (hidden on mobile) -->
        <v-btn
          v-if="!mobile"
          icon="mdi-magnify"
          variant="text"
          density="comfortable"
        />
        
        <!-- Notifications -->
        <v-btn
          icon="mdi-bell"
          variant="text"
          density="comfortable"
          size="small"
        >
          <v-badge
            content="3"
            color="error"
            offset-x="2"
            offset-y="2"
          >
            <v-icon>mdi-bell</v-icon>
          </v-badge>
        </v-btn>

        <!-- Theme Toggle (hidden on mobile) -->
        <v-btn
          v-if="!mobile"
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          density="comfortable"
          @click="toggleTheme"
        />

        <!-- Profile Menu -->
        <v-menu location="bottom end">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              variant="text"
              density="comfortable"
              size="small"
            >
              <v-avatar :size="mobile ? 28 : 32" color="primary">
                <v-icon color="white" size="16">mdi-account</v-icon>
              </v-avatar>
            </v-btn>
          </template>

          <v-card :min-width="mobile ? 160 : 200">
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-account"
                title="Profile"
                :subtitle="mobile ? undefined : 'View profile'"
              />
              <v-list-item
                prepend-icon="mdi-cog"
                title="Settings"
                :subtitle="mobile ? undefined : 'Manage account'"
              />
              <!-- Theme toggle for mobile -->
              <v-list-item
                v-if="mobile"
                :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
                :title="isDark ? 'Light Mode' : 'Dark Mode'"
                @click="toggleTheme"
              />
              <v-divider />
              <v-list-item
                prepend-icon="mdi-logout"
                title="Sign Out"
                base-color="error"
              />
            </v-list>
          </v-card>
        </v-menu>
      </div>
    </v-app-bar>

    <!-- Main Content Area -->
    <v-main>
      <v-container 
        fluid 
        :class="mobile ? 'pa-4' : 'pa-6'"
        class="main-container fill-height"
      >
        <!-- Blank Canvas - Ready for Content -->
        <!-- Add your content here -->
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useTheme, useDisplay } from 'vuetify'

// Theme management
const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)

// Mobile detection
const { mobile } = useDisplay()

const toggleTheme = () => {
  theme.global.name.value = isDark.value ? 'light' : 'dark'
  localStorage.setItem('theme', theme.global.name.value)
}

// Navigation state management
const drawer = ref(true)
const rail = ref(false)
const activeItem = ref('dashboard')

// Load drawer state from localStorage
const loadDrawerState = () => {
  const saved = localStorage.getItem('dashboard-drawer-state')
  if (saved) {
    const state = JSON.parse(saved)
    // Default to closed on mobile, open on desktop
    drawer.value = mobile.value ? false : (state.drawer ?? true)
    rail.value = state.rail ?? false
  } else {
    // Initial state: closed on mobile, open on desktop
    drawer.value = !mobile.value
    rail.value = false
  }
}

// Save drawer state to localStorage
const saveDrawerState = () => {
  localStorage.setItem('dashboard-drawer-state', JSON.stringify({
    drawer: drawer.value,
    rail: rail.value
  }))
}

// Watch for state changes and persist them
watch([drawer, rail], () => {
  saveDrawerState()
}, { deep: true })

// Toggle drawer rail mode
const toggleDrawer = () => {
  if (mobile.value) {
    // On mobile: just toggle drawer open/closed
    drawer.value = !drawer.value
  } else {
    // On desktop: cycle through states
    if (drawer.value && !rail.value) {
      rail.value = true
    } else if (rail.value) {
      rail.value = false
    } else {
      drawer.value = true
    }
  }
}

// Navigation items
const mainNavItems = ref([
  {
    title: 'Dashboard',
    icon: 'mdi-view-dashboard',
    value: 'dashboard',
    active: true,
  },
  {
    title: 'Devices',
    icon: 'mdi-monitor',
    value: 'devices',
    active: false,
    badge: '12',
  },
  {
    title: 'Audio Streams',
    icon: 'mdi-headphones',
    value: 'streams',
    active: false,
  },
  {
    title: 'Analytics',
    icon: 'mdi-chart-line',
    value: 'analytics',
    active: false,
  },
  {
    title: 'Recordings',
    icon: 'mdi-record-rec',
    value: 'recordings',
    active: false,
  },
])

const toolsNavItems = ref([
  {
    title: 'System Health',
    icon: 'mdi-heart-pulse',
    value: 'health',
    active: false,
  },
  {
    title: 'Logs',
    icon: 'mdi-text-box-multiple',
    value: 'logs',
    active: false,
  },
  {
    title: 'API Explorer',
    icon: 'mdi-api',
    value: 'api',
    active: false,
  },
])

// Set active navigation item
const setActiveItem = (value: string) => {
  activeItem.value = value
  
  // Reset all items
  mainNavItems.value.forEach(item => item.active = false)
  toolsNavItems.value.forEach(item => item.active = false)
  
  // Set active item
  const allItems = [...mainNavItems.value, ...toolsNavItems.value]
  const item = allItems.find(item => item.value === value)
  if (item) {
    item.active = true
  }
}

// Current page title based on active item
const currentPageTitle = computed(() => {
  const allItems = [...mainNavItems.value, ...toolsNavItems.value]
  const item = allItems.find(item => item.value === activeItem.value)
  return item?.title || 'Dashboard'
})


// Initialize component
onMounted(() => {
  loadDrawerState()
  
  // Load theme from localStorage
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    theme.global.name.value = savedTheme
  }
})
</script>

<style scoped>
/* Fix main content overflow */
.main-container {
  max-width: 100vw;
  overflow-x: hidden;
}

.min-height-content {
  min-height: calc(100vh - 64px);
}

/* Mobile-specific adjustments */
@media (max-width: 960px) {
  :deep(.v-app-bar-title) {
    font-size: 1.1rem !important;
  }
  
  /* Ensure content doesn't overflow */
  :deep(.v-main) {
    overflow-x: hidden;
  }
}

/* Custom app bar shadow */
:deep(.v-app-bar) {
  backdrop-filter: blur(10px);
}

/* Smooth transitions */
.v-navigation-drawer {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Custom scrollbar for navigation */
:deep(.v-navigation-drawer__content) {
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--v-theme-outline-variant)) transparent;
}

:deep(.v-navigation-drawer__content)::-webkit-scrollbar {
  width: 4px;
}

:deep(.v-navigation-drawer__content)::-webkit-scrollbar-track {
  background: transparent;
}

:deep(.v-navigation-drawer__content)::-webkit-scrollbar-thumb {
  background-color: rgb(var(--v-theme-outline-variant));
  border-radius: 4px;
}

/* Enhanced list item styling */
:deep(.v-list-item--active) {
  font-weight: 600;
}

</style>
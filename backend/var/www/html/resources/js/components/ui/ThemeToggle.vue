<template>
  <div class="theme-toggle">
    <!-- Mobile: Icon Button -->
    <v-btn
      v-if="mobile"
      :icon="themeIcon"
      variant="text"
      @click="toggleTheme"
      :title="`Switch to ${nextThemeName} mode`"
    />
    
    <!-- Desktop: Switch with Labels -->
    <div v-else class="d-flex align-center ga-3">
      <v-icon :icon="themeIcon" size="small" />
      <v-switch
        :model-value="isDark"
        @update:model-value="handleSwitchToggle"
        hide-details
        density="compact"
        :ripple="false"
        :title="`Switch to ${nextThemeName} mode`"
      />
      <span class="text-caption text-medium-emphasis">
        {{ currentTheme === 'system' ? 'Auto' : (isDark ? 'Dark' : 'Light') }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { useThemeVuetify } from '@/composables/useThemeVuetify'

interface Props {
  mobile?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  mobile: false,
})

const { mobile: isMobileDisplay } = useDisplay()
const { currentTheme, isDark, toggleTheme, setTheme } = useThemeVuetify()

// Use mobile prop or auto-detect
const mobile = computed(() => props.mobile || isMobileDisplay.value)

// Theme icon based on current state
const themeIcon = computed(() => {
  switch (currentTheme.value) {
    case 'light':
      return 'mdi-weather-sunny'
    case 'dark':
      return 'mdi-weather-night'
    case 'system':
      return 'mdi-theme-light-dark'
    default:
      return 'mdi-weather-night'
  }
})

// Next theme name for accessibility
const nextThemeName = computed(() => {
  return isDark.value ? 'light' : 'dark'
})

// Handle switch toggle (for desktop switch)
const handleSwitchToggle = (value: boolean) => {
  setTheme(value ? 'dark' : 'light')
}
</script>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
}
</style>
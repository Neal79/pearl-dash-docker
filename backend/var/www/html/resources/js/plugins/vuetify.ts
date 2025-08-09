import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          // Main backgrounds - matching current gray-900/gray-800
          background: '#111827',    // gray-900
          surface: '#1f2937',       // gray-800
          'surface-variant': '#374151', // gray-700
          
          // Primary colors - emerald to match Add Device button
          primary: '#10b981',       // emerald-500
          'primary-darken-1': '#059669', // emerald-600
          
          // Secondary and accent
          secondary: '#6b7280',     // gray-500
          accent: '#3b82f6',        // blue-500
          
          // Status colors
          error: '#ef4444',         // red-500
          warning: '#f59e0b',       // amber-500
          info: '#3b82f6',          // blue-500
          success: '#10b981',       // emerald-500
          
          // Text colors
          'on-background': '#f9fafb',   // gray-50
          'on-surface': '#f3f4f6',      // gray-100
          'on-surface-variant': '#d1d5db', // gray-300
          'on-primary': '#ffffff',
          'on-secondary': '#ffffff',
          
          // Borders and dividers
          outline: '#4b5563',       // gray-600
          'outline-variant': '#374151', // gray-700
        },
      },
      light: {
        dark: false,
        colors: {
          // Light theme backgrounds
          background: '#ffffff',
          surface: '#f8fafc',       // slate-50
          'surface-variant': '#f1f5f9', // slate-100
          
          // Primary colors - same emerald
          primary: '#10b981',       // emerald-500
          'primary-darken-1': '#059669', // emerald-600
          
          // Secondary and accent
          secondary: '#64748b',     // slate-500
          accent: '#3b82f6',        // blue-500
          
          // Status colors
          error: '#ef4444',         // red-500
          warning: '#f59e0b',       // amber-500
          info: '#3b82f6',          // blue-500
          success: '#10b981',       // emerald-500
          
          // Text colors
          'on-background': '#0f172a',   // slate-900
          'on-surface': '#1e293b',      // slate-800
          'on-surface-variant': '#475569', // slate-600
          'on-primary': '#ffffff',
          'on-secondary': '#ffffff',
          
          // Borders and dividers
          outline: '#cbd5e1',       // slate-300
          'outline-variant': '#e2e8f0', // slate-200
        },
      },
    },
  },
  defaults: {
    VCard: {
      elevation: 2,
    },
    VBtn: {
      elevation: 0,
    },
    VNavigationDrawer: {
      elevation: 0,
    },
  },
})
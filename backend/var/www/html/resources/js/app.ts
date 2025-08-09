import '../css/app.css';

import { createInertiaApp } from '@inertiajs/vue3';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import type { DefineComponent } from 'vue';
import { createApp, h } from 'vue';
import { ZiggyVue } from 'ziggy-js';
import { initializeTheme } from './composables/useAppearance';
import vuetify from './plugins/vuetify';
import axios from 'axios';

// Configure Axios for session-based SPA authentication
axios.defaults.withCredentials = true;
axios.defaults.withXSRFToken = true;

// Set up CSRF token from meta tag as fallback
const token = document.head.querySelector('meta[name="csrf-token"]');
if (token) {
  axios.defaults.headers.common['X-CSRF-TOKEN'] = token.getAttribute('content');
}

// Configure Inertia with CSRF token - simplified approach
import { router } from '@inertiajs/vue3';

// Set up CSRF token handling for Inertia
router.on('before', (event) => {
  const token = document.querySelector('meta[name="csrf-token"]');
  if (token) {
    event.detail.visit.headers = {
      ...event.detail.visit.headers,
      'X-CSRF-TOKEN': token.getAttribute('content')
    };
  }
});

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),
  resolve: (name) =>
    resolvePageComponent(
      `./pages/${name}.vue`,
      import.meta.glob<DefineComponent>('./pages/**/*.vue')
    ),
  setup({ el, App, props, plugin }) {
    const vueApp = createApp({ render: () => h(App, props) })
      .use(plugin)
      .use(ZiggyVue)
      .use(vuetify);

    vueApp.mount(el);
  },
  progress: {
    color: '#4B5563',
  },
});

// Initialize theme after Inertia setup
initializeTheme();

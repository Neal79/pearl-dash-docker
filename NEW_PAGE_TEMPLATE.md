# New Page Template Guide

This guide documents the pattern for adding new pages to Pearl Dashboard.

## Template Pattern

### 1. Create New Page File
**Location**: `/resources/js/pages/YourPageName.vue`

```vue
<template>
  <AppSidebarLayout>
    <div class="p-6">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Your Page Title</h1>
      
      <div class="max-w-4xl">
        <!-- Your page content goes here -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h2 class="text-lg font-medium text-gray-900 mb-4">Section Title</h2>
          <p class="text-gray-600">Your content here.</p>
        </div>
      </div>
    </div>
  </AppSidebarLayout>
</template>

<script setup lang="ts">
import AppSidebarLayout from '@/layouts/app/AppSidebarLayout.vue'

// Page metadata
defineOptions({
  layout: false, // We handle layout manually with AppSidebarLayout
})

// Add your page logic here
</script>
```

### 2. Add Route
**Location**: `/routes/web.php`

```php
Route::middleware('auth')->group(function () {
    // ... existing routes
    
    Route::get('/your-page', fn() => Inertia::render('YourPageName'))
         ->name('your-page');
});
```

### 3. Add Navigation Link
**Location**: `/resources/js/pages/PearlDashboard.vue`

Add to either `mainNavItems` (for main navigation) or `toolsNavItems` (for tools section):

```javascript
const toolsNavItems = ref([
  // ... existing items
  {
    title: 'Your Page',
    icon: 'mdi-your-icon', // Choose from Material Design Icons
    value: 'your-page',    // Must match route name
    active: false,
    isRoute: true,         // Flag to indicate this navigates to a route
  },
])
```

## Key Patterns

### Page Structure
- **Layout**: Use `AppSidebarLayout` for consistent sidebar navigation
- **Content**: Wrap in `div class="p-6"` for consistent padding
- **Typography**: Use Tailwind CSS classes for consistent styling
- **Cards**: Use `bg-white rounded-lg border border-gray-200 p-6` for content sections

### Navigation Integration
- **isRoute: true**: Marks navigation items that should navigate to routes (vs internal tabs)
- **Navigation logic**: Existing `setActiveItem()` function handles route navigation automatically
- **Icon selection**: Use Material Design Icons (`mdi-*`) for consistency

### Authentication
- All new pages are automatically protected by the `auth` middleware when added to the protected route group
- Pages inherit the authentication context from the parent layout

## Examples

### Simple Settings Page (Implemented)
```vue
<template>
  <AppSidebarLayout>
    <div class="p-6">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <div class="max-w-4xl">
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h2 class="text-lg font-medium text-gray-900 mb-4">Application Settings</h2>
          <p class="text-gray-600">Settings configuration will be implemented here.</p>
        </div>
      </div>
    </div>
  </AppSidebarLayout>
</template>
```

### Route Definition
```php
Route::get('/settings', fn() => Inertia::render('Settings'))->name('settings');
```

### Navigation Item
```javascript
{
  title: 'Settings',
  icon: 'mdi-cog',
  value: 'settings',
  active: false,
  isRoute: true,
}
```

## Navigation Flow

1. User clicks navigation item in sidebar
2. `setActiveItem(value)` function called
3. If `item.isRoute === true`, navigate to route using `router.visit(\`/\${value}\`)`
4. Otherwise, handle as internal tab within PearlDashboard

## Best Practices

1. **Consistent Layout**: Always use `AppSidebarLayout` for pages with sidebar navigation
2. **Route Names**: Use kebab-case route names that match the navigation value
3. **Icons**: Choose appropriate Material Design Icons that represent your page function
4. **Content Structure**: Follow the established pattern for content containers and typography
5. **Authentication**: Add all protected pages to the `auth` middleware group

## Future Enhancements

This template provides a foundation that can be extended with:
- Page-specific breadcrumbs using `AppSidebarLayout`'s breadcrumb support  
- Dynamic navigation highlighting based on current route
- Page-specific meta tags and SEO
- Custom layouts for specialized page types
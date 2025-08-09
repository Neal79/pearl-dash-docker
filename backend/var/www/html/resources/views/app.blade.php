<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  <title inertia>{{ config('app.name') }}</title>

  {{-- Vite-built CSS/JS --}}
  @vite(['resources/css/app.css','resources/js/app.ts'])

  {{-- Inertia head --}}
  @inertiaHead
</head>
<body class="bg-gray-100 font-sans antialiased">
  {{-- This is where Inertia injects your Dashboard.vue --}}
  @inertia

  {{-- If you need Tailwind’s base scripts: --}}
  @stack('scripts')
</body>
</html>


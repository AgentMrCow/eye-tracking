// src/components/not-found.tsx
import { A } from "@solidjs/router";

export default function NotFound() {
  return (
    <div class="flex flex-col items-center justify-center h-full">
      <h1 class="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p class="text-gray-600 mb-8">The page you're looking for doesn't exist.</p>
      <A 
        href="/" 
        class="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        Go Home
      </A>
    </div>
  );
}
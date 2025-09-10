// src/components/app-sidebar.tsx
import { For } from "solid-js";
import { A } from "@solidjs/router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarTrigger
} from "@/components/ui/sidebar";

import {
  Eye,
  BarChart3,
  Users,
  Layout,
  Settings,
  Table
} from "lucide-solid";

const navigationItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Layout
  },
  {
    title: "Gaze Analysis",
    url: "/gaze",
    icon: Eye
  },
  {
    title: "Catalog Compare",
    url: "/compare",
    icon: Table
  },
  {
    title: "Statistics",
    url: "/stats",
    icon: BarChart3
  },
  {
    title: "Participants",
    url: "/participants",
    icon: Users
  },
  {
    title: "Data Toggle",
    url: "/data-toggle",
    icon: Layout
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings
  }
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader class="p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Eye Tracking Analysis</h2>
          <SidebarTrigger />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <For each={navigationItems}>
                {(item) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <A
                        href={item.url}
                        class="flex items-center gap-2 w-full h-full px-3 py-2"
                        activeClass="bg-accent text-accent-foreground rounded-md"
                      >
                        <item.icon class="w-4 h-4" />
                        <span>{item.title}</span>
                      </A>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </For>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

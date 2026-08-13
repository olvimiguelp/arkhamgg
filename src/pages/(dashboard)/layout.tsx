"use client"

import React from "react"
import { BusinessProvider } from "@super_admin/lib/business-context"
import { SidebarProvider } from "@super_admin/lib/sidebar-context"
import { AppLayout } from "@super_admin/components/app-layout"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <BusinessProvider>
      <SidebarProvider>
        <AppLayout>{children}</AppLayout>
      </SidebarProvider>
    </BusinessProvider>
  )
}



import { AppSidebar } from "@/components/nav/app-sidebar";
import { CommandPalette } from "@/components/nav/CommandPalette";
import { LocatorPill } from "@/components/nav/LocatorPill";
import { QuickSwitcher } from "@/components/nav/QuickSwitcher";
import { TopLocator } from "@/components/nav/TopLocator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopLocator pill={<LocatorPill />} />
          <main className="flex-1 px-4 py-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
      <QuickSwitcher />
      <Toaster richColors closeButton position="bottom-right" />
    </TooltipProvider>
  );
}

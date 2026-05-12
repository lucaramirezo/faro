import { CommandPalette } from "@/components/nav/CommandPalette";
import { TopBar } from "@/components/nav/TopBar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <TooltipProvider delayDuration={250}>
      <TopBar />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
      <CommandPalette />
      <Toaster richColors closeButton position="bottom-right" />
    </TooltipProvider>
  );
}

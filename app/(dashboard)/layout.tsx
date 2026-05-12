import { CommandPalette } from "@/components/nav/CommandPalette";
import { TopBar } from "@/components/nav/TopBar";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
      <CommandPalette />
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
}

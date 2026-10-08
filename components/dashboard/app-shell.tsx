"use client";

import { Suspense } from "react";
import { ChatWidget } from "@/components/chat/chat-widget";
import { TimePreviewProvider } from "@/components/time/time-preview-provider";
import { TimeSliderWidget } from "@/components/time/time-slider-widget";
import { TopNav } from "./top-nav";
import { Footer } from "./footer";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TimePreviewProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <TopNav />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-8 sm:px-8 lg:px-10">
          {children}
        </main>
        <Suspense fallback={null}>
          <TimeSliderWidget />
        </Suspense>
        <Suspense fallback={null}>
          <ChatWidget />
        </Suspense>
        <Footer />
      </div>
    </TimePreviewProvider>
  );
}

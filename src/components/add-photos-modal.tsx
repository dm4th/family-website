"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoUpload } from "@/components/photo-upload";
import { GooglePhotosPicker } from "@/components/google-photos-picker";

type Attachment =
  | { kind: "profile"; profileId: string }
  | { kind: "property"; propertyId: string };

type Source = "device" | "google";
const LAST_TAB_KEY = "addPhotos.lastTab";

// Safe to read at render time: the Sheet content is portaled and starts
// closed, so this only matters after first client mount — no SSR/hydration
// mismatch is observable.
function readLastTab(): Source {
  if (typeof window === "undefined") return "device";
  const saved = window.localStorage.getItem(LAST_TAB_KEY);
  return saved === "device" || saved === "google" ? saved : "device";
}

export function AddPhotosModal({
  attachment,
  triggerLabel = "Add Photos",
}: {
  attachment: Attachment;
  triggerLabel?: string;
}) {
  const [tab, setTab] = useState<Source>(readLastTab);
  const [open, setOpen] = useState(false);

  function onTabChange(next: string) {
    if (next !== "device" && next !== "google") return;
    setTab(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_TAB_KEY, next);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Photos</SheetTitle>
          <SheetDescription>
            Bring photos in from your device or your Google Photos library.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <Tabs value={tab} onValueChange={onTabChange} className="gap-5">
            <TabsList>
              <TabsTrigger value="device">From Device</TabsTrigger>
              <TabsTrigger value="google">Google Photos</TabsTrigger>
            </TabsList>

            <TabsContent value="device">
              <PhotoUpload attachment={attachment} />
            </TabsContent>

            <TabsContent value="google">
              <GooglePhotosPicker attachment={attachment} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

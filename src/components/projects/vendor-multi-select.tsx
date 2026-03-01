"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface ProjectVendorEntry {
  vendorId: string;
  region: string;
  storeLink: string;
  customVendorName?: string;
}

interface VendorMultiSelectProps {
  vendors: { id: string; name: string; regionsServed?: string[]; storefrontUrl?: string | null }[];
  value: ProjectVendorEntry[];
  onChange: (value: ProjectVendorEntry[]) => void;
}

export function VendorMultiSelect({
  vendors,
  value,
  onChange,
}: VendorMultiSelectProps) {
  useEffect(() => {
    let changed = false;
    const hydrated = value.map((entry) => {
      if (!entry.vendorId || entry.vendorId === "__new__") return entry;
      const vendor = vendors.find((v) => v.id === entry.vendorId);
      if (!vendor) return entry;

      const nextRegion = entry.region?.trim() ? entry.region : (vendor.regionsServed?.join(", ") ?? "");
      const nextStoreLink = entry.storeLink?.trim() ? entry.storeLink : (vendor.storefrontUrl ?? "");

      if (nextRegion !== entry.region || nextStoreLink !== entry.storeLink) {
        changed = true;
        return { ...entry, region: nextRegion, storeLink: nextStoreLink };
      }
      return entry;
    });

    if (changed) onChange(hydrated);
  }, [value, vendors, onChange]);

  const addEntry = () => {
    onChange([
      ...value,
      {
        vendorId: "",
        region: "",
        storeLink: "",
        customVendorName: "",
      },
    ]);
  };

  const updateEntry = (
    index: number,
    field: keyof ProjectVendorEntry,
    val: string
  ) => {
    const updated = [...value];
    updated[index] = { ...updated[index], [field]: val };

    // Auto-populate region and store link when vendor is selected
    if (field === "vendorId" && val && val !== "none" && val !== "__new__") {
      const vendor = vendors.find((v) => v.id === val);
      if (vendor) {
        // Always sync defaults when vendor changes (works for edit + create flows)
        updated[index].region = vendor.regionsServed?.join(", ") ?? "";
        updated[index].storeLink = vendor.storefrontUrl ?? "";
      }
    }

    onChange(updated);
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Vendors</Label>
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="mr-1 h-4 w-4" />
          Add Vendor
        </Button>
      </div>
      {value.map((entry, i) => (
        <div key={i} className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Vendor</Label>
              <Select
                value={entry.vendorId || "none"}
                onValueChange={(v) =>
                  updateEntry(i, "vendorId", v === "none" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select vendor</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Add new vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {entry.vendorId === "__new__" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">New vendor name</Label>
                  <Input
                    value={entry.customVendorName ?? ""}
                    onChange={(e) =>
                      updateEntry(i, "customVendorName", e.target.value)
                    }
                    placeholder="Vendor name"
                  />
                </div>

              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Region</Label>
              <Input
                value={entry.region}
                onChange={(e) => updateEntry(i, "region", e.target.value)}
                placeholder="e.g. US, EU, Asia"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Store Link</Label>
              <Input
                value={entry.storeLink}
                onChange={(e) => updateEntry(i, "storeLink", e.target.value)}
                placeholder="https://..."
              />
            </div>

          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => removeEntry(i)}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      ))}
      {value.length === 0 && (
        <p className="text-muted-foreground text-sm">No vendors added</p>
      )}
    </div>
  );
}

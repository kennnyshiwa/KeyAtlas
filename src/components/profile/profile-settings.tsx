"use client";

import { useState, useRef } from "react";
import { formatDate } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Camera, Loader2, Save, User } from "lucide-react";
import { toast } from "sonner";
import { NotificationSettings } from "@/components/profile/notification-settings";

interface ProfileSettingsProps {
  user: {
    id: string;
    name: string | null;
    username: string | null;
    displayName: string | null;
    bio: string | null;
    email: string | null;
    image: string | null;
    createdAt: string;
  };
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? user.name ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [image, setImage] = useState(user.image);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (displayName || user.name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to upload avatar");
        return;
      }

      const data = await res.json();
      setImage(data.url);
      toast.success("Avatar updated!");
    } catch {
      toast.error("Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          username: username.trim() || undefined,
          bio: bio.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save profile");
        return;
      }

      toast.success("Profile updated!");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>
            Click on your avatar to upload a new picture. Max 2MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="group relative"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Avatar className="h-20 w-20">
                <AvatarImage src={image ?? undefined} alt="Profile" />
                <AvatarFallback className="text-lg">
                  {initials || <User className="h-8 w-8" />}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </button>
            <div>
              <p className="font-medium">{displayName || user.name || "No name set"}</p>
              <p className="text-muted-foreground text-sm">
                {user.email || "No email"}
              </p>
              <p className="text-muted-foreground text-xs">
                Member since {formatDate(user.createdAt)}
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </CardContent>
      </Card>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your display name, username, and bio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                  @
                </span>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))
                  }
                  placeholder="username"
                  maxLength={30}
                  className="pl-7"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Your unique URL: keyatlas.io/users/{username || "username"}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself and your keyboard interests..."
              maxLength={500}
              rows={3}
            />
            <p className="text-muted-foreground text-xs text-right">
              {bio.length}/500
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <NotificationSettings />
    </div>
  );
}

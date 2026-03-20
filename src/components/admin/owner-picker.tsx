"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Search, User } from "lucide-react";

interface OwnerPickerProps {
  ownerId: string | null;
  ownerName?: string | null;
  onChange: (userId: string | null) => void;
}

interface UserResult {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

export function OwnerPicker({ ownerId, ownerName, onChange }: OwnerPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedName, setSelectedName] = useState(ownerName ?? null);

  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search, doSearch]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ownerId ? (
          <div className="flex items-center gap-2 rounded-md border p-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">
              {selectedName || ownerId}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                onChange(null);
                setSelectedName(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {searching && (
              <p className="text-xs text-muted-foreground">Searching...</p>
            )}
            {results.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {results.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onChange(user.id);
                      setSelectedName(user.username || user.name || user.id);
                      setSearch("");
                      setResults([]);
                    }}
                  >
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{user.username || user.name}</span>
                    {user.username && user.name && (
                      <span className="text-muted-foreground">({user.name})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Assign a user as owner to let them edit this page directly.
        </p>
      </CardContent>
    </Card>
  );
}

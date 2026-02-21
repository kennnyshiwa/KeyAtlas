"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RichTextRenderer } from "@/components/editor/rich-text-renderer";
import { UpdateForm } from "./update-form";
import { formatDate } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";

interface UpdateCardProps {
  update: {
    id: string;
    title: string;
    content: string;
    createdAt: string;
  };
  canEdit: boolean;
  onDeleted: () => void;
  onUpdated: () => void;
}

export function UpdateCard({
  update,
  canEdit,
  onDeleted,
  onUpdated,
}: UpdateCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <UpdateForm
        projectId=""
        update={update}
        onSubmitted={() => {
          setIsEditing(false);
          onUpdated();
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{update.title}</CardTitle>
            <p className="text-muted-foreground text-xs">
              {formatDate(update.createdAt)}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:text-red-600"
                onClick={onDeleted}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <RichTextRenderer content={update.content} />
      </CardContent>
    </Card>
  );
}

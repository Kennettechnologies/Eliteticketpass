"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function PrivacyPage() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>("/config/").then((res) => {
      if (res.success && res.data) {
        setContent(res.data.privacy || res.data.privacy_policy || "Privacy policy has not been set yet.");
      } else {
        setContent("Failed to load privacy policy.");
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-3xl mx-auto bg-surface border border-border rounded-xl p-8 md:p-12">
        <h1 className="text-3xl font-display font-bold mb-8 text-center">Privacy Policy</h1>
        
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="prose prose-invert prose-p:text-muted max-w-none">
            <ReactMarkdown>{content || ""}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Users, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn, getInitials } from "@/lib/utils";
import { toast } from "sonner";

interface Organizer {
  id: string; name: string; slug: string; logo?: string;
  tagline?: string; follower_count: number; event_count: number;
  is_verified: boolean;
}

export default function FollowingPage() {
  const [orgs,    setOrgs]    = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [unfolding, setUnfolding] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ results: Organizer[] }>("/organizers/following/").then(r => {
      if (r.success) setOrgs((r.data as any)?.results || []);
      setLoading(false);
    });
  }, []);

  const unfollow = async (orgId: string) => {
    setUnfolding(orgId);
    const res = await api.post(`/organizers/${orgId}/follow/`);
    if (res.success) {
      setOrgs(o => o.filter(x => x.id !== orgId));
      toast.success("Unfollowed");
    }
    setUnfolding(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Following</h1>
      <p className="text-sm text-muted -mt-2">Organizers you follow — their upcoming events appear in your feed.</p>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-surface-2 border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-bold mb-2">Not following anyone</h3>
          <p className="text-muted text-sm">Follow organizers to see their events first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map(org => (
            <div key={org.id} className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl p-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0 overflow-hidden">
                {org.logo
                  ? <img src={org.logo} alt="" className="w-12 h-12 object-cover rounded-full" />
                  : getInitials(org.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm truncate">{org.name}</p>
                  {org.is_verified && <span className="text-xs text-primary">✓</span>}
                </div>
                {org.tagline && <p className="text-xs text-muted truncate">{org.tagline}</p>}
                <p className="text-xs text-muted mt-0.5">{org.follower_count.toLocaleString()} followers · {org.event_count} events</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/organizers/${org.slug}`}
                  className="text-xs text-muted hover:text-foreground border border-border rounded-sm px-2.5 py-1.5 flex items-center gap-1 transition-colors">
                  <ExternalLink className="w-3 h-3" /> View
                </Link>
                <button onClick={() => unfollow(org.id)} disabled={unfolding === org.id}
                  className={cn("text-xs border rounded-sm px-2.5 py-1.5 transition-colors",
                    unfolding === org.id ? "opacity-50 cursor-not-allowed border-border text-muted" :
                    "border-error/40 text-error hover:bg-error/5")}>
                  Unfollow
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

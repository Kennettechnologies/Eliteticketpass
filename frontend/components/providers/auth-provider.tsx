"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { GoogleOAuthProvider } from "@react-oauth/google";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "dummy_client_id_to_prevent_crash";

  return (
    <GoogleOAuthProvider clientId={clientId}>
      {children}
    </GoogleOAuthProvider>
  );
}

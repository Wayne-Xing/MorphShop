"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="flex items-center gap-2 mr-6">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="font-bold">MorphShop</span>
        </Link>

        {isAuthenticated && (
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.header.dashboard}
            </Link>
            <Link
              href="/results"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.header.results}
            </Link>
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.dashboard.newProject}
            </Link>
          </nav>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <LanguageSwitcher />

          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                <span>{user?.username}</span>
                <span className="text-muted-foreground">
                  ({user?.credits.toFixed(2)} credits)
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                {t.auth.logout}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  {t.auth.login}
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">{t.auth.register}</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

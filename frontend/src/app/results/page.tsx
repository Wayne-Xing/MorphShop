"use client";

import { Suspense, useCallback } from "react";
import useSWR from "swr";
import { Download, Loader2 } from "lucide-react";

import { AuthProvider } from "@/components/layout/AuthProvider";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useI18n } from "@/lib/i18n";
import { api, Asset } from "@/lib/api";
import { getErrorMessage, triggerBrowserDownload } from "@/lib/utils";

function ResultsPageInner() {
  const { toast } = useToast();
  const { t, locale } = useI18n();

  const { data, error, isLoading, mutate } = useSWR<Asset[]>(
    ["results-assets"],
    () =>
      api.getAssets({
        days: 7,
        limit: 200,
        asset_type: ["try_on_result", "background_result", "video_result"],
      }),
    { revalidateOnFocus: false }
  );

  const download = useCallback(
    async (asset: Asset) => {
      try {
        const { blob, filename } = await api.downloadAsset(asset.id);
        triggerBrowserDownload(blob, filename ?? asset.display_name ?? asset.original_filename ?? "result");
      } catch (e) {
        toast({ title: t.results.download, description: getErrorMessage(e), variant: "destructive" });
      }
    },
    [t.results.download, toast]
  );

  const assets = data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t.results.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t.results.description}</p>
          </div>
          <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
            {locale === "zh" ? "刷新" : "Refresh"}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            {locale === "zh" ? "加载中…" : "Loading…"}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {getErrorMessage(error)}
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            {t.results.empty}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <Card key={a.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium truncate">
                    {a.display_name ?? a.original_filename}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-hidden rounded-lg border bg-muted/30">
                    {/* Results are images today; video is reserved */}
                    <img src={a.file_url} alt={a.original_filename} className="h-48 w-full object-contain" />
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => download(a)}>
                    <Download className="h-4 w-4 mr-2" />
                    {t.results.download}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <AuthProvider>
      <Suspense>
        <ResultsPageInner />
      </Suspense>
    </AuthProvider>
  );
}

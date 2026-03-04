import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';

const Y_OFFSET_MIN = -20;
const Y_OFFSET_MAX = 20;

function injectLineTunerCss(html: string, yOffsetPx: number): string {
  const css = `
<style id="proposal-inline-line-tuner">
  .section-header,
  .ss-section-header {
    align-items: center !important;
    padding-bottom: 0 !important;
    margin-bottom: 24px !important;
    position: relative !important;
    border-bottom: none !important;
  }

  .section-header::after,
  .ss-section-header::after {
    content: "" !important;
    position: absolute !important;
    left: 16px !important;
    right: 0 !important;
    bottom: -10px !important;
    height: 2px !important;
    background: #dbe5f3 !important;
  }

  .section-accent-bar,
  .ss-accent-bar {
    display: none !important;
  }

  .section-title,
  .ss-section-title {
    position: relative !important;
    padding-left: 16px !important;
    margin: 0 !important;
    line-height: 1.2 !important;
    padding-bottom: 0 !important;
    border-bottom: none !important;
  }

  .section-title::before,
  .ss-section-title::before {
    content: "" !important;
    position: absolute !important;
    left: 0 !important;
    top: 50% !important;
    transform: translateY(calc(-50% + ${yOffsetPx}px)) !important;
    width: 4px !important;
    height: 1em !important;
    min-height: 1em !important;
    border-radius: 2px !important;
    background: #1e3a5f !important;
  }
</style>
  `.trim();

  if (html.includes('</head>')) {
    return html.replace('</head>', `${css}\n</head>`);
  }

  return `${css}\n${html}`;
}

export default function ProposalLineTunerPage() {
  const [proposalId, setProposalId] = useState('');
  const [sourceHtml, setSourceHtml] = useState<string | null>(null);
  const [isLoadingProposal, setIsLoadingProposal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [yOffsetPx, setYOffsetPx] = useState(0);
  const [lastPdfUrl, setLastPdfUrl] = useState<string | null>(null);

  const previewHtml = useMemo(() => {
    if (!sourceHtml) return null;
    return injectLineTunerCss(sourceHtml, yOffsetPx);
  }, [sourceHtml, yOffsetPx]);

  const handleLoadProposal = useCallback(async () => {
    const trimmedId = proposalId.trim();
    if (!trimmedId) {
      toast.error('Enter a proposal ID first');
      return;
    }

    setIsLoadingProposal(true);
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('id, rendered_html, pdf_url')
        .eq('id', trimmedId)
        .maybeSingle();

      if (error) {
        toast.error('Failed to load proposal');
        console.error('[ProposalLineTuner] Load proposal error:', error);
        return;
      }

      if (!data) {
        toast.error('Proposal not found');
        return;
      }

      const html = data.rendered_html as string | null;
      if (!html) {
        toast.error('No rendered_html found. Render once first.');
        return;
      }

      setSourceHtml(html);
      setLastPdfUrl((data.pdf_url as string | null) ?? null);
      toast.success('Loaded proposal HTML');
    } catch (err) {
      console.error('[ProposalLineTuner] Unexpected load error:', err);
      toast.error('Unexpected error loading proposal');
    } finally {
      setIsLoadingProposal(false);
    }
  }, [proposalId]);

  const handleGeneratePdf = useCallback(async () => {
    const trimmedId = proposalId.trim();
    if (!trimmedId) {
      toast.error('Enter a proposal ID first');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('proposal-render-gotenberg', {
        body: {
          proposal_id: trimmedId,
          line_y_offset_px: yOffsetPx,
        },
      });

      if (error) {
        toast.error('Failed to generate PDF');
        console.error('[ProposalLineTuner] Generate error:', error);
        return;
      }

      const pdfUrl = typeof data?.pdf_url === 'string' ? data.pdf_url : null;
      if (!pdfUrl) {
        toast.error('Render succeeded but no pdf_url returned');
        return;
      }

      setLastPdfUrl(pdfUrl);
      toast.success(`Rendered PDF with Y offset ${yOffsetPx}px`);
      window.open(pdfUrl, '_blank', 'noopener');

      // Refresh rendered_html so inline preview matches the latest render output.
      await handleLoadProposal();
    } catch (err) {
      console.error('[ProposalLineTuner] Unexpected generate error:', err);
      toast.error('Unexpected error during PDF generation');
    } finally {
      setIsGenerating(false);
    }
  }, [proposalId, yOffsetPx, handleLoadProposal]);

  return (
    <div className="mx-auto w-full max-w-7xl p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Proposal Line Tuner</CardTitle>
          <CardDescription>
            Tune section accent line Y position and generate a PDF with the selected offset.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="proposal-id">Proposal ID</Label>
              <Input
                id="proposal-id"
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value)}
                placeholder="e.g. c2096eec-e9c7-4912-a80e-63c95adc4a80"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleLoadProposal}
              disabled={isLoadingProposal}
            >
              {isLoadingProposal ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Load HTML
            </Button>
            <Button
              onClick={handleGeneratePdf}
              disabled={isGenerating}
            >
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate PDF
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="line-y-offset">Line Y Offset (px)</Label>
              <Input
                id="line-y-offset"
                type="number"
                className="w-24"
                min={Y_OFFSET_MIN}
                max={Y_OFFSET_MAX}
                value={yOffsetPx}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setYOffsetPx(Math.max(Y_OFFSET_MIN, Math.min(Y_OFFSET_MAX, Math.round(next))));
                }}
              />
            </div>
            <Slider
              value={[yOffsetPx]}
              onValueChange={(values) => setYOffsetPx(values[0] ?? 0)}
              min={Y_OFFSET_MIN}
              max={Y_OFFSET_MAX}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              Negative moves the line up. Positive moves the line down.
            </p>
          </div>

          {lastPdfUrl && (
            <p className="text-sm text-muted-foreground">
              Last generated PDF:&nbsp;
              <a
                href={lastPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                open
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
          <CardDescription>
            Preview uses the same alignment override logic with your current Y offset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewHtml ? (
            <div className="overflow-auto rounded-md border bg-muted/10 p-4">
              <iframe
                title="Proposal line tuner preview"
                srcDoc={previewHtml}
                className="border-0 bg-white"
                sandbox="allow-same-origin"
                style={{
                  width: '794px',
                  height: '1123px',
                }}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-sm text-muted-foreground">
              Load a proposal to start tuning.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

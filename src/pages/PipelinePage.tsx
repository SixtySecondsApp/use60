import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Pipeline } from '@/components/Pipeline';
import { HelpPanel } from '@/components/docs/HelpPanel';

export function PipelinePage() {
  return (
    <>
      <Helmet>
        <title>Pipeline Tracker | Sales Dashboard</title>
      </Helmet>
      <div className="absolute top-4 right-4 z-10">
        <HelpPanel docSlug="pipeline-deals" tooltip="Pipeline help" />
      </div>
      <Pipeline />
    </>
  );
} 
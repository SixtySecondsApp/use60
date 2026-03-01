/**
 * Section Component Registry
 *
 * Maps (SectionType, LayoutVariant) → React component.
 * Fallback chain: exact match → type default → HeroCentered.
 */

import React from 'react';
import type { LandingSection, SectionType, LayoutVariant } from '../types';

export type SectionComponentProps = {
  section: LandingSection;
  onSectionClick?: () => void;
};

type SectionComponent = React.FC<SectionComponentProps>;

type RegistryKey = `${SectionType}:${LayoutVariant}`;

const REGISTRY = new Map<string, SectionComponent>();
const TYPE_DEFAULTS = new Map<SectionType, SectionComponent>();

export function registerSection(
  type: SectionType,
  variant: LayoutVariant,
  component: SectionComponent,
  isDefault = false,
): void {
  const key: RegistryKey = `${type}:${variant}`;
  REGISTRY.set(key, component);
  if (isDefault || !TYPE_DEFAULTS.has(type)) {
    TYPE_DEFAULTS.set(type, component);
  }
}

let globalFallback: SectionComponent | null = null;

export function setGlobalFallback(component: SectionComponent): void {
  globalFallback = component;
}

export function getSectionComponent(
  type: SectionType,
  variant: LayoutVariant,
): SectionComponent {
  const key: RegistryKey = `${type}:${variant}`;

  // Exact match
  const exact = REGISTRY.get(key);
  if (exact) return exact;

  // Per-type fallback
  const typeFallback = TYPE_DEFAULTS.get(type);
  if (typeFallback) return typeFallback;

  // Global fallback
  if (globalFallback) return globalFallback;

  // Last resort: return a placeholder
  return ({ section }) =>
    React.createElement('div', {
      className: 'py-16 px-6 text-center opacity-50',
      'data-section-id': section.id,
    }, `[${section.type}:${section.layout_variant}]`);
}

export function getRegisteredTypes(): string[] {
  return Array.from(REGISTRY.keys());
}

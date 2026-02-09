import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Filter,
  Pencil,
  EyeOff,
  Trash2,
  Check,
  X,
  RefreshCw,
  Play,
  RotateCcw,
  Sparkles,
  Settings,
  Mail,
  Zap,
} from 'lucide-react';

interface ColumnHeaderMenuProps {
  isOpen: boolean;
  onClose: () => void;
  column: { id: string; label: string; key: string; is_enrichment: boolean; column_type?: string };
  onRename: (label: string) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onFilter: () => void;
  onHide: () => void;
  onDelete: () => void;
  onRecalcFormula?: () => void;
  onRunIntegration?: () => void;
  onRetryFailed?: () => void;
  onEditEnrichment?: () => void;
  onEnrichRemaining?: () => void;
  onReEnrich?: () => void;
  onEditFormula?: () => void;
  onEditButton?: () => void;
  onEditApollo?: () => void;
  onEditInstantly?: () => void;
  onEditEmailGeneration?: () => void;
  onRegenerateEmails?: () => void;
  onCreateCampaignFromSteps?: () => void;
  anchorRect?: DOMRect;
}

export function ColumnHeaderMenu({
  isOpen,
  onClose,
  column,
  onRename,
  onSortAsc,
  onSortDesc,
  onFilter,
  onHide,
  onDelete,
  onRecalcFormula,
  onRunIntegration,
  onRetryFailed,
  onEditEnrichment,
  onEnrichRemaining,
  onReEnrich,
  onEditFormula,
  onEditButton,
  onEditApollo,
  onEditInstantly,
  onEditEmailGeneration,
  onRegenerateEmails,
  onCreateCampaignFromSteps,
  anchorRect,
}: ColumnHeaderMenuProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.label);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Reset rename state when menu opens/closes
  useEffect(() => {
    if (isOpen) {
      setIsRenaming(false);
      setRenameValue(column.label);
    }
  }, [isOpen, column.label]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 50);
    }
  }, [isRenaming]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use a short delay so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isRenaming) {
          setIsRenaming(false);
          setRenameValue(column.label);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRenaming, column.label, onClose]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== column.label) {
      onRename(trimmed);
    }
    setIsRenaming(false);
    onClose();
  }, [renameValue, column.label, onRename, onClose]);

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    }
  };

  if (!isOpen) return null;

  // Detect email step columns by key pattern
  const isEmailStepColumn = /^instantly_step_\d+_(subject|body)$/.test(column.key);

  // Calculate position from anchor
  const style: React.CSSProperties = {};
  if (anchorRect) {
    style.position = 'fixed';
    style.top = anchorRect.bottom + 4;
    style.left = anchorRect.left;
    // Ensure menu doesn't overflow viewport right edge
    const menuWidth = 220;
    if (anchorRect.left + menuWidth > window.innerWidth) {
      style.left = window.innerWidth - menuWidth - 8;
    }
  }

  return (
    <div
      ref={menuRef}
      style={style}
      className="z-50 w-56 rounded-lg border border-gray-700 bg-gray-900 py-1.5 shadow-2xl"
    >
      {/* Sort Ascending */}
      <MenuItem
        icon={<ArrowUp className="h-4 w-4" />}
        label="Sort ascending"
        onClick={() => {
          onSortAsc();
          onClose();
        }}
      />

      {/* Sort Descending */}
      <MenuItem
        icon={<ArrowDown className="h-4 w-4" />}
        label="Sort descending"
        onClick={() => {
          onSortDesc();
          onClose();
        }}
      />

      <Separator />

      {/* Filter */}
      <MenuItem
        icon={<Filter className="h-4 w-4" />}
        label="Filter this column"
        onClick={() => {
          onFilter();
          onClose();
        }}
      />

      {/* Email step column actions */}
      {isEmailStepColumn && onEditEmailGeneration && (
        <MenuItem
          icon={<Settings className="h-4 w-4" />}
          label="Edit generation config"
          onClick={() => {
            onEditEmailGeneration();
            onClose();
          }}
        />
      )}
      {isEmailStepColumn && onRegenerateEmails && (
        <MenuItem
          icon={<RefreshCw className="h-4 w-4" />}
          label="Regenerate all emails"
          onClick={() => {
            onRegenerateEmails();
            onClose();
          }}
        />
      )}
      {isEmailStepColumn && onCreateCampaignFromSteps && (
        <MenuItem
          icon={<Zap className="h-4 w-4" />}
          label="Create Instantly campaign"
          onClick={() => {
            onCreateCampaignFromSteps();
            onClose();
          }}
        />
      )}

      {/* Enrichment actions (suppressed for email step columns) */}
      {column.is_enrichment && !isEmailStepColumn && onEditEnrichment && (
        <MenuItem
          icon={<Settings className="h-4 w-4" />}
          label="Edit prompt"
          onClick={() => {
            onEditEnrichment();
            onClose();
          }}
        />
      )}
      {column.is_enrichment && !isEmailStepColumn && onEnrichRemaining && (
        <MenuItem
          icon={<Sparkles className="h-4 w-4" />}
          label="Enrich remaining"
          onClick={() => {
            onEnrichRemaining();
            onClose();
          }}
        />
      )}
      {column.is_enrichment && !isEmailStepColumn && onReEnrich && (
        <MenuItem
          icon={<RotateCcw className="h-4 w-4" />}
          label="Re-enrich all rows"
          onClick={() => {
            onReEnrich();
            onClose();
          }}
        />
      )}

      {/* Edit formula (formula columns only) */}
      {column.column_type === 'formula' && onEditFormula && (
        <MenuItem
          icon={<Settings className="h-4 w-4" />}
          label="Edit formula"
          onClick={() => {
            onEditFormula();
            onClose();
          }}
        />
      )}

      {/* Edit Apollo settings */}
      {(column.column_type === 'apollo_property' || column.column_type === 'apollo_org_property') && onEditApollo && (
        <MenuItem
          icon={<Settings className="h-4 w-4" />}
          label="Edit settings"
          onClick={() => {
            onEditApollo();
            onClose();
          }}
        />
      )}
      {(column.column_type === 'apollo_property' || column.column_type === 'apollo_org_property') && onEnrichRemaining && (
        <MenuItem
          icon={<Sparkles className="h-4 w-4" />}
          label="Enrich remaining"
          onClick={() => {
            onEnrichRemaining();
            onClose();
          }}
        />
      )}
      {(column.column_type === 'apollo_property' || column.column_type === 'apollo_org_property') && onReEnrich && (
        <MenuItem
          icon={<RotateCcw className="h-4 w-4" />}
          label="Re-enrich all rows"
          onClick={() => {
            onReEnrich();
            onClose();
          }}
        />
      )}

      {/* LinkedIn property actions */}
      {column.column_type === 'linkedin_property' && onEnrichRemaining && (
        <MenuItem
          icon={<Sparkles className="h-4 w-4" />}
          label="Enrich remaining"
          onClick={() => {
            onEnrichRemaining();
            onClose();
          }}
        />
      )}
      {column.column_type === 'linkedin_property' && onReEnrich && (
        <MenuItem
          icon={<RotateCcw className="h-4 w-4" />}
          label="Re-enrich all rows"
          onClick={() => {
            onReEnrich();
            onClose();
          }}
        />
      )}

      {/* Edit Instantly settings */}
      {column.column_type === 'instantly' && onEditInstantly && (
        <MenuItem
          icon={<Settings className="h-4 w-4" />}
          label="Edit campaign settings"
          onClick={() => {
            onEditInstantly();
            onClose();
          }}
        />
      )}

      {/* Edit button config (button columns only) */}
      {column.column_type === 'button' && onEditButton && (
        <MenuItem
          icon={<Settings className="h-4 w-4" />}
          label="Edit button"
          onClick={() => {
            onEditButton();
            onClose();
          }}
        />
      )}

      {/* Recalculate (formula columns only) */}
      {column.column_type === 'formula' && onRecalcFormula && (
        <MenuItem
          icon={<RefreshCw className="h-4 w-4" />}
          label="Recalculate"
          onClick={() => {
            onRecalcFormula();
            onClose();
          }}
        />
      )}

      {/* Integration actions */}
      {column.column_type === 'integration' && onRunIntegration && (
        <MenuItem
          icon={<Play className="h-4 w-4" />}
          label="Run integration"
          onClick={() => {
            onRunIntegration();
            onClose();
          }}
        />
      )}
      {column.column_type === 'integration' && onRetryFailed && (
        <MenuItem
          icon={<RotateCcw className="h-4 w-4" />}
          label="Retry failed"
          onClick={() => {
            onRetryFailed();
            onClose();
          }}
        />
      )}

      <Separator />

      {/* Rename */}
      {isRenaming ? (
        <div className="flex items-center gap-1.5 px-2 py-1">
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-100 outline-none focus:border-violet-500"
          />
          <button
            onClick={handleRenameSubmit}
            className="rounded p-1 text-green-400 transition-colors hover:bg-gray-800"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              setIsRenaming(false);
              setRenameValue(column.label);
            }}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <MenuItem
          icon={<Pencil className="h-4 w-4" />}
          label="Rename"
          onClick={() => setIsRenaming(true)}
        />
      )}

      {/* Hide Column */}
      <MenuItem
        icon={<EyeOff className="h-4 w-4" />}
        label="Hide column"
        onClick={() => {
          onHide();
          onClose();
        }}
      />

      <Separator />

      {/* Delete Column */}
      <MenuItem
        icon={<Trash2 className="h-4 w-4" />}
        label="Delete column"
        variant="danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}) {
  const colorClasses =
    variant === 'danger'
      ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
      : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100';

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${colorClasses}`}
    >
      {icon}
      {label}
    </button>
  );
}

function Separator() {
  return <div className="my-1.5 border-t border-gray-700/60" />;
}

export default ColumnHeaderMenu;

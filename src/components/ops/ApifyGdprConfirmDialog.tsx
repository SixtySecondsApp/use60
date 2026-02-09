import React, { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface ApifyGdprConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flaggedCount: number
  onConfirm: (basis: string) => void
}

const LEGAL_BASES = [
  {
    value: 'legitimate_interest',
    label: 'Legitimate Interest',
    description: 'Processing is necessary for a legitimate interest not overridden by the data subject\'s rights.',
  },
  {
    value: 'consent_obtained',
    label: 'Consent Obtained',
    description: 'The data subject has given explicit consent for processing their personal data.',
  },
  {
    value: 'contract_necessity',
    label: 'Contract Necessity',
    description: 'Processing is necessary for the performance of a contract with the data subject.',
  },
]

export function ApifyGdprConfirmDialog({
  open,
  onOpenChange,
  flaggedCount,
  onConfirm,
}: ApifyGdprConfirmDialogProps) {
  const [selectedBasis, setSelectedBasis] = useState('')

  const handleConfirm = () => {
    if (!selectedBasis) return
    onConfirm(selectedBasis)
    setSelectedBasis('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            GDPR Flagged Records
          </DialogTitle>
          <DialogDescription>
            {flaggedCount} record{flaggedCount !== 1 ? 's' : ''} contain personal email addresses.
            Select a legal basis before proceeding.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedBasis} onValueChange={setSelectedBasis} className="space-y-3 py-2">
          {LEGAL_BASES.map((basis) => (
            <div key={basis.value} className="flex items-start gap-3">
              <RadioGroupItem value={basis.value} id={basis.value} className="mt-1" />
              <Label htmlFor={basis.value} className="cursor-pointer space-y-0.5">
                <div className="text-sm font-medium">{basis.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {basis.description}
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!selectedBasis} onClick={handleConfirm}>
            Confirm & Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal-policies"

interface LegalPoliciesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "privacy" | "terms"
}

export function LegalPoliciesModal({ open, onOpenChange, type }: LegalPoliciesModalProps) {
  const policy = type === "privacy" ? PRIVACY_POLICY : TERMS_OF_SERVICE

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-white">
            {policy.title}
          </DialogTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Última actualización: {policy.lastUpdated}
          </p>
        </DialogHeader>
        
        <div className="mt-6 space-y-6">
          {policy.content.split('\n\n').map((section, index) => {
            // Manejar títulos y párrafos
            const lines = section.split('\n')
            const isTitle = lines[0].match(/^\d+\./)
            
            return (
              <div key={index}>
                {isTitle ? (
                  <>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-2">
                      {lines[0]}
                    </h3>
                    {lines.slice(1).map((line, i) => (
                      <p key={i} className="text-sm text-slate-700 dark:text-slate-300 mb-1">
                        {line}
                      </p>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {section}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

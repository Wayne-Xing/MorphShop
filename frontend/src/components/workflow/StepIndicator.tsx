"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  id: number;
  name: string;
  description: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  completedSteps: number[];
}

export function StepIndicator({
  steps,
  currentStep,
  completedSteps,
}: StepIndicatorProps) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center">
        {steps.map((step, stepIdx) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;

          return (
            <li
              key={step.id}
              className={cn(
                "relative",
                stepIdx !== steps.length - 1 ? "pr-8 sm:pr-20 flex-1" : ""
              )}
            >
              {/* Connector line */}
              {stepIdx !== steps.length - 1 && (
                <div
                  className="absolute top-4 left-7 -ml-px mt-0.5 h-0.5 w-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      isCompleted ? "bg-primary w-full" : "bg-muted w-0"
                    )}
                  />
                </div>
              )}

              <div className="group relative flex items-start">
                <span className="flex h-9 items-center">
                  <span
                    className={cn(
                      "relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                      isCompleted
                        ? "bg-primary"
                        : isCurrent
                        ? "border-2 border-primary bg-background"
                        : "border-2 border-muted bg-background"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5 text-primary-foreground" />
                    ) : (
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          isCurrent ? "bg-primary" : "bg-muted"
                        )}
                      />
                    )}
                  </span>
                </span>

                <span className="ml-4 flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {step.name}
                  </span>
                  <span className="text-sm text-muted-foreground hidden sm:block">
                    {step.description}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

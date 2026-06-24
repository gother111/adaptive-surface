import { useContext } from "react";
import { PerceptionContext } from "@/perception/react/PerceptionContext";

export function usePerception() {
  const context = useContext(PerceptionContext);
  if (!context) {
    throw new Error("usePerception must be used inside PerceptionProviderRoot.");
  }
  return context;
}

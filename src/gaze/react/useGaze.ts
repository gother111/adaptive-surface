import { useContext, useEffect, useState } from "react";
import { getCurrentAttention, subscribeToAttentionTarget } from "@/gaze/attention";
import { GazeContext } from "@/gaze/react/GazeContext";

export function useGaze() {
  const context = useContext(GazeContext);
  if (!context) {
    throw new Error("useGaze must be used inside GazeProviderRoot");
  }

  return context;
}

export function useCurrentAttention() {
  const [attention, setAttention] = useState(() => getCurrentAttention());

  useEffect(() => subscribeToAttentionTarget(setAttention), []);

  return attention;
}

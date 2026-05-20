// 라즈베리파이가 Supabase Realtime broadcast 로 푸시하는 추론 프레임을 구독.
//   토픽:   feeder:<deviceId>
//   이벤트: "frame"
//   페이로드:
//     {
//       jpeg_b64,                         // 송출용 다운스케일 JPEG
//       ts,                               // epoch ms
//       width, height,                    // 송출 프레임 픽셀 크기
//       detections: [                     // 0~1 정규화 bbox
//         { track_id?, x, y, w, h, conf, class, stale? }
//       ],
//       status                            // "detecting" | "idle" | ...
//     }
//
// deviceId 가 비면 no-op. (Supabase 는 supabase.ts 에서 항상 보장됨)

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type FeederDetection = {
  track_id?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
  class: string;
  stale?: boolean;
};

export type FeederStreamState = {
  frameUrl?: string;
  detections: FeederDetection[];
  status?: string;
  lastTs?: number;
  connected: boolean;
};

const INITIAL: FeederStreamState = { detections: [], connected: false };

export function useFeederStream(deviceId?: string): FeederStreamState {
  const [state, setState] = useState<FeederStreamState>(INITIAL);

  useEffect(() => {
    if (!deviceId) {
      setState(INITIAL);
      return;
    }

    const channel = supabase
      .channel(`feeder:${deviceId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "frame" }, ({ payload }) => {
        const p = payload as {
          jpeg_b64?: string;
          ts?: number;
          detections?: FeederDetection[];
          status?: string;
        };
        if (!p?.jpeg_b64) return;
        setState({
          frameUrl: `data:image/jpeg;base64,${p.jpeg_b64}`,
          detections: p.detections ?? [],
          status: p.status,
          lastTs: p.ts,
          connected: true,
        });
      })
      .subscribe((channelStatus) => {
        setState((s) => ({ ...s, connected: channelStatus === "SUBSCRIBED" }));
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId]);

  return state;
}

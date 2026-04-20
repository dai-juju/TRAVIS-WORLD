"use client";
/**
 * DummyCard — M1.4 Step 2 검증용 임시 카드.
 *
 * 목적:
 *   Step 2 에서 CardContainer / cardComponentRegistry / __TRAVIS_INJECT__ 전체
 *   체인이 제대로 동작하는지 확인하려면 componentId 하나가 실제로 렌더되어야 한다.
 *   Step 3 에서 TickerCard 가 완성되면 이 파일은 삭제 예정 — Step 2 산출물의
 *   수명은 Step 3 까지.
 *
 * 설계:
 *   - `config` 전체를 JSON 으로 스트링화해 보여준다. AI 가 준 설정이 그대로 들어왔는지
 *     육안 확인 가능.
 *   - UI 스타일은 TRAVIS Command Deck 토큰(`text-muted-foreground` / `bg-card` 등)을 그대로 사용.
 */

import type { CardComponentProps } from "@/lib/cardComponentRegistry";

export default function DummyCard({ config }: CardComponentProps) {
  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-3 text-xs">
      <div className="text-muted-foreground">
        componentId: <span className="text-foreground">{config.componentId}</span>
      </div>
      <div className="text-muted-foreground">
        updateMode: <span className="text-foreground">{config.updateMode}</span>
      </div>
      <div className="text-muted-foreground">
        datasource: <span className="text-foreground">{config.data.datasource}</span>
      </div>
      {config.data.symbol && (
        <div className="text-muted-foreground">
          symbol: <span className="text-foreground">{config.data.symbol}</span>
        </div>
      )}
      <div className="mt-auto rounded-sm bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
        Step 2 dummy — 실제 카드는 Step 3~5 에서 연결.
      </div>
    </div>
  );
}

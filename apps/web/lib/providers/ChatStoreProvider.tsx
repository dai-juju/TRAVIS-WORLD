"use client";
/**
 * 채팅 스토어 Provider — Zustand v5 vanilla + React Context (M1.4 Step 4-3).
 *
 * 역할:
 *   - createChatStore() 인스턴스를 useState lazy 로 단 한 번 생성
 *   - Context 로 하위 트리에 주입
 *   - useChatStore(selector) 훅으로 selective 구독 노출
 *
 * 패턴 출처: CanvasStoreProvider / ToastStoreProvider 와 동일. 3개 스토어 모두
 * 같은 shape 을 유지하면 유지보수 비용이 최소화된다.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createChatStore, type ChatStore } from "@/lib/stores/chatStore";

type ChatStoreApi = ReturnType<typeof createChatStore>;

const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

export const ChatStoreProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState<ChatStoreApi>(() => createChatStore());
  return <ChatStoreContext.Provider value={store}>{children}</ChatStoreContext.Provider>;
};

export const useChatStore = <T,>(selector: (store: ChatStore) => T): T => {
  const ctx = useContext(ChatStoreContext);
  if (!ctx) {
    throw new Error("useChatStore must be used within ChatStoreProvider");
  }
  return useStore(ctx, selector);
};

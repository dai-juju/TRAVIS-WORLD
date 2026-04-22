/**
 * chatStore (Zustand vanilla) — TRAVIS 채팅 입력 상태 (M1.4 Step 4-3).
 *
 * 책임:
 *   - 사용자가 입력 중인 텍스트 (input)
 *   - 제출 이력 (history) — 단순 문자열 큐 (M1.4 범위)
 *   - 제출 상태 (status) — M1.5 에서 Claude 호출 중 로딩 스피너에 쓸 플래그
 *
 * 왜 canvasStore 와 분리했나:
 *   "never one god store" 원칙 (nextjs-frontend-specialist §3.1). 캔버스는 React
 *   Flow 와 강결합된 상태고, 채팅은 입력 UI 와 AI orchestration 흐름이라 생명주기
 *   가 다르다. 분리하면 selective 구독 범위가 좁아져 리렌더도 줄어든다.
 *
 * 제출 흐름 (M1.5 Step 3 부터):
 *   ChatInputBar.handleSubmit 가 `fetch("/api/orchestrate")` 호출 → 응답을
 *   `dispatchOrchestrateResponse` 에 전달 → 카드 생성 또는 fallback 토스트.
 *   status 는 "loading" 동안 input + button 을 disabled 로 잠그는 데 쓰인다.
 */
import { createStore } from "zustand/vanilla";

export type ChatEntry = {
  id: string;
  text: string;
  submittedAt: number;
};

export type ChatStatus = "idle" | "loading" | "error";

export type ChatState = {
  input: string;
  history: ChatEntry[];
  status: ChatStatus;
  lastError: string | null;
};

export type ChatActions = {
  setInput: (text: string) => void;
  /** 입력 텍스트를 history 에 push + input clear. 실제 AI 호출은 외부에서. */
  recordSubmission: (text: string) => string;
  setStatus: (status: ChatStatus, errorMsg?: string | null) => void;
  reset: () => void;
};

export type ChatStore = ChatState & ChatActions;

export const defaultChatState: ChatState = {
  input: "",
  history: [],
  status: "idle",
  lastError: null,
};

/** id 는 동일 ms 내 다중 제출 충돌만 방지하면 충분. */
function makeEntryId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const createChatStore = (initState: ChatState = defaultChatState) => {
  return createStore<ChatStore>()((set, get) => ({
    ...initState,

    setInput: (text) => set({ input: text }),

    recordSubmission: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return "";
      const entry: ChatEntry = {
        id: makeEntryId(),
        text: trimmed,
        submittedAt: Date.now(),
      };
      set({
        history: [...get().history, entry],
        input: "",
      });
      return entry.id;
    },

    setStatus: (status, errorMsg = null) =>
      set({ status, lastError: status === "error" ? errorMsg : null }),

    reset: () => set(defaultChatState),
  }));
};

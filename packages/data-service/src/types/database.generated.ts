/**
 * AUTO-GENERATED — DO NOT EDIT MANUALLY.
 *
 * Source: Supabase MCP `generate_typescript_types` (2026-06-16).
 * Latest migration: M2 테마 C Step 2 Sub-step 1 — saved_views ADD (2026-06-16).
 *   - saved_views: id PK / user_id FK / name / cards_config JSONB / canvas_state JSONB
 *     / created_at / updated_at (마이그레이션 20260616000001, Dashboard 적용 2026-06-16).
 *   - user_preferences: Step 1 (2026-06-15, 마이그레이션 20260615000001) 도 본 재생성에
 *     처음 포함됨(Step 1 은 DB-only 라 코드 미참조였어 타입 미반영 상태였음).
 *
 * 이전 이력:
 *   - M1.8 §8.1 (2026-05-25): funding predicted/realized 분리 + basis ADD + funding_interval_hours.
 *   - M2 테마 B (2026-06-11~12): now_spot_ticker / now_futures_ticker quote_asset ADD.
 *   - M2 retention S2 (2026-06-13): history_futures_indicator.id DROP + natural_pk PRIMARY KEY 승격.
 *
 * Regeneration workflow:
 *   1. Apply new migration to Supabase (Dashboard SQL Editor or `db push`)
 *   2. Run `mcp__supabase__generate_typescript_types`
 *   3. Overwrite this file with the result (헤더 주석은 보존/갱신)
 *   4. Update `tables.ts` aliases if new tables added
 *   5. `pnpm -r type-check` to surface any drift
 *
 * 진실 공급원은 `supabase/migrations/*.sql` + Supabase live schema. 이 파일은 거울일 뿐.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      history_futures_indicator: {
        Row: {
          annualized_basis_rate: number | null
          basis: number | null
          basis_rate: number | null
          exchange: string
          global_ls_ratio: number | null
          index_price: number | null
          interval: string
          last_settled_funding_rate: number | null
          mark_price: number | null
          market_type: string
          oi_chg_15m: number | null
          oi_chg_1h: number | null
          oi_chg_4h: number | null
          oi_chg_5m: number | null
          open_interest: number | null
          predicted_funding_rate: number | null
          recorded_at: string
          symbol: string
          taker_buy_sell_ratio: number | null
          taker_buy_vol: number | null
          taker_sell_vol: number | null
          top_ls_ratio_accounts: number | null
          top_ls_ratio_positions: number | null
        }
        Insert: {
          annualized_basis_rate?: number | null
          basis?: number | null
          basis_rate?: number | null
          exchange: string
          global_ls_ratio?: number | null
          index_price?: number | null
          interval: string
          last_settled_funding_rate?: number | null
          mark_price?: number | null
          market_type: string
          oi_chg_15m?: number | null
          oi_chg_1h?: number | null
          oi_chg_4h?: number | null
          oi_chg_5m?: number | null
          open_interest?: number | null
          predicted_funding_rate?: number | null
          recorded_at?: string
          symbol: string
          taker_buy_sell_ratio?: number | null
          taker_buy_vol?: number | null
          taker_sell_vol?: number | null
          top_ls_ratio_accounts?: number | null
          top_ls_ratio_positions?: number | null
        }
        Update: {
          annualized_basis_rate?: number | null
          basis?: number | null
          basis_rate?: number | null
          exchange?: string
          global_ls_ratio?: number | null
          index_price?: number | null
          interval?: string
          last_settled_funding_rate?: number | null
          mark_price?: number | null
          market_type?: string
          oi_chg_15m?: number | null
          oi_chg_1h?: number | null
          oi_chg_4h?: number | null
          oi_chg_5m?: number | null
          open_interest?: number | null
          predicted_funding_rate?: number | null
          recorded_at?: string
          symbol?: string
          taker_buy_sell_ratio?: number | null
          taker_buy_vol?: number | null
          taker_sell_vol?: number | null
          top_ls_ratio_accounts?: number | null
          top_ls_ratio_positions?: number | null
        }
        Relationships: []
      }
      history_futures_kline: {
        Row: {
          base_volume: number | null
          close_price: number
          close_time: number
          exchange: string
          high_price: number
          interval: string
          low_price: number
          market_type: string
          open_price: number
          open_time: number
          quote_volume: number | null
          symbol: string
          taker_buy_base_vol: number | null
          taker_buy_quote_vol: number | null
          trade_count: number | null
          volume: number
        }
        Insert: {
          base_volume?: number | null
          close_price: number
          close_time: number
          exchange: string
          high_price: number
          interval: string
          low_price: number
          market_type: string
          open_price: number
          open_time: number
          quote_volume?: number | null
          symbol: string
          taker_buy_base_vol?: number | null
          taker_buy_quote_vol?: number | null
          trade_count?: number | null
          volume: number
        }
        Update: {
          base_volume?: number | null
          close_price?: number
          close_time?: number
          exchange?: string
          high_price?: number
          interval?: string
          low_price?: number
          market_type?: string
          open_price?: number
          open_time?: number
          quote_volume?: number | null
          symbol?: string
          taker_buy_base_vol?: number | null
          taker_buy_quote_vol?: number | null
          trade_count?: number | null
          volume?: number
        }
        Relationships: []
      }
      history_futures_liquidation: {
        Row: {
          accumulated_qty: number | null
          avg_price: number | null
          exchange: string
          id: number
          last_filled_qty: number | null
          market_type: string
          notional: number | null
          order_status: string | null
          price: number
          quantity: number
          recorded_at: string
          side: string
          symbol: string
          trade_time: string
        }
        Insert: {
          accumulated_qty?: number | null
          avg_price?: number | null
          exchange: string
          id?: never
          last_filled_qty?: number | null
          market_type: string
          notional?: number | null
          order_status?: string | null
          price: number
          quantity: number
          recorded_at?: string
          side: string
          symbol: string
          trade_time: string
        }
        Update: {
          accumulated_qty?: number | null
          avg_price?: number | null
          exchange?: string
          id?: never
          last_filled_qty?: number | null
          market_type?: string
          notional?: number | null
          order_status?: string | null
          price?: number
          quantity?: number
          recorded_at?: string
          side?: string
          symbol?: string
          trade_time?: string
        }
        Relationships: []
      }
      history_futures_ticker: {
        Row: {
          base_volume: number | null
          exchange: string
          high_price: number | null
          id: number
          last_price: number | null
          low_price: number | null
          market_type: string
          price_change_pct: number | null
          price_chg_15m: number | null
          price_chg_1h: number | null
          price_chg_4h: number | null
          price_chg_5m: number | null
          quote_volume: number | null
          recorded_at: string
          symbol: string
          trade_count: number | null
          volume: number | null
          volume_chg_15m: number | null
          volume_chg_1h: number | null
          volume_chg_5m: number | null
          volume_ratio: number | null
        }
        Insert: {
          base_volume?: number | null
          exchange: string
          high_price?: number | null
          id?: never
          last_price?: number | null
          low_price?: number | null
          market_type: string
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_volume?: number | null
          recorded_at?: string
          symbol: string
          trade_count?: number | null
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
        }
        Update: {
          base_volume?: number | null
          exchange?: string
          high_price?: number | null
          id?: never
          last_price?: number | null
          low_price?: number | null
          market_type?: string
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_volume?: number | null
          recorded_at?: string
          symbol?: string
          trade_count?: number | null
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
        }
        Relationships: []
      }
      history_spot_kline: {
        Row: {
          close_price: number
          close_time: number
          exchange: string
          high_price: number
          interval: string
          low_price: number
          market_type: string
          open_price: number
          open_time: number
          quote_volume: number
          symbol: string
          taker_buy_base_vol: number | null
          taker_buy_quote_vol: number | null
          trade_count: number | null
          volume: number
        }
        Insert: {
          close_price: number
          close_time: number
          exchange: string
          high_price: number
          interval: string
          low_price: number
          market_type?: string
          open_price: number
          open_time: number
          quote_volume: number
          symbol: string
          taker_buy_base_vol?: number | null
          taker_buy_quote_vol?: number | null
          trade_count?: number | null
          volume: number
        }
        Update: {
          close_price?: number
          close_time?: number
          exchange?: string
          high_price?: number
          interval?: string
          low_price?: number
          market_type?: string
          open_price?: number
          open_time?: number
          quote_volume?: number
          symbol?: string
          taker_buy_base_vol?: number | null
          taker_buy_quote_vol?: number | null
          trade_count?: number | null
          volume?: number
        }
        Relationships: []
      }
      history_spot_ticker: {
        Row: {
          exchange: string
          high_price: number | null
          id: number
          last_price: number | null
          low_price: number | null
          market_type: string
          price_change_pct: number | null
          price_chg_15m: number | null
          price_chg_1h: number | null
          price_chg_4h: number | null
          price_chg_5m: number | null
          quote_volume: number | null
          recorded_at: string
          symbol: string
          trade_count: number | null
          volume: number | null
          volume_chg_15m: number | null
          volume_chg_1h: number | null
          volume_chg_5m: number | null
          volume_ratio: number | null
        }
        Insert: {
          exchange: string
          high_price?: number | null
          id?: never
          last_price?: number | null
          low_price?: number | null
          market_type?: string
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_volume?: number | null
          recorded_at?: string
          symbol: string
          trade_count?: number | null
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
        }
        Update: {
          exchange?: string
          high_price?: number | null
          id?: never
          last_price?: number | null
          low_price?: number | null
          market_type?: string
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_volume?: number | null
          recorded_at?: string
          symbol?: string
          trade_count?: number | null
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
        }
        Relationships: []
      }
      log_behavior: {
        Row: {
          created_at: string
          event_type: string
          id: number
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: never
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: never
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      log_chat: {
        Row: {
          ai_response: Json | null
          attempt_number: number
          created_at: string
          fallback_reason: string | null
          id: number
          input_tokens: number
          latency_ms: number
          model_id: string
          output_tokens: number
          query_text: string
          status: string
          system_prompt_version: string | null
          user_id: string | null
          user_query_hash: string | null
        }
        Insert: {
          ai_response?: Json | null
          attempt_number?: number
          created_at?: string
          fallback_reason?: string | null
          id?: never
          input_tokens: number
          latency_ms: number
          model_id: string
          output_tokens: number
          query_text: string
          status: string
          system_prompt_version?: string | null
          user_id?: string | null
          user_query_hash?: string | null
        }
        Update: {
          ai_response?: Json | null
          attempt_number?: number
          created_at?: string
          fallback_reason?: string | null
          id?: never
          input_tokens?: number
          latency_ms?: number
          model_id?: string
          output_tokens?: number
          query_text?: string
          status?: string
          system_prompt_version?: string | null
          user_id?: string | null
          user_query_hash?: string | null
        }
        Relationships: []
      }
      log_validation_failure: {
        Row: {
          ai_response: Json | null
          attempt_number: number
          created_at: string
          error_message: string | null
          error_type: string | null
          id: number
          model_id: string | null
          query_text: string | null
          system_prompt_version: string | null
          user_id: string | null
          user_query_hash: string | null
        }
        Insert: {
          ai_response?: Json | null
          attempt_number?: number
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: never
          model_id?: string | null
          query_text?: string | null
          system_prompt_version?: string | null
          user_id?: string | null
          user_query_hash?: string | null
        }
        Update: {
          ai_response?: Json | null
          attempt_number?: number
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: never
          model_id?: string | null
          query_text?: string | null
          system_prompt_version?: string | null
          user_id?: string | null
          user_query_hash?: string | null
        }
        Relationships: []
      }
      now_futures_indicator: {
        Row: {
          annualized_basis_rate: number | null
          basis: number | null
          basis_rate: number | null
          estimated_settle_price: number | null
          exchange: string
          global_long_account: number | null
          global_ls_ratio: number | null
          global_short_account: number | null
          index_price: number | null
          interest_rate: number | null
          last_settled_funding_rate: number | null
          last_settled_funding_time: number | null
          mark_price: number | null
          market_type: string
          next_funding_time: number | null
          oi_chg_15m: number | null
          oi_chg_1h: number | null
          oi_chg_4h: number | null
          oi_chg_5m: number | null
          open_interest: number | null
          predicted_funding_rate: number | null
          symbol: string
          taker_buy_sell_ratio: number | null
          taker_buy_vol: number | null
          taker_sell_vol: number | null
          top_long_account: number | null
          top_long_position: number | null
          top_ls_ratio_accounts: number | null
          top_ls_ratio_positions: number | null
          top_short_account: number | null
          top_short_position: number | null
          updated_at: string
        }
        Insert: {
          annualized_basis_rate?: number | null
          basis?: number | null
          basis_rate?: number | null
          estimated_settle_price?: number | null
          exchange: string
          global_long_account?: number | null
          global_ls_ratio?: number | null
          global_short_account?: number | null
          index_price?: number | null
          interest_rate?: number | null
          last_settled_funding_rate?: number | null
          last_settled_funding_time?: number | null
          mark_price?: number | null
          market_type: string
          next_funding_time?: number | null
          oi_chg_15m?: number | null
          oi_chg_1h?: number | null
          oi_chg_4h?: number | null
          oi_chg_5m?: number | null
          open_interest?: number | null
          predicted_funding_rate?: number | null
          symbol: string
          taker_buy_sell_ratio?: number | null
          taker_buy_vol?: number | null
          taker_sell_vol?: number | null
          top_long_account?: number | null
          top_long_position?: number | null
          top_ls_ratio_accounts?: number | null
          top_ls_ratio_positions?: number | null
          top_short_account?: number | null
          top_short_position?: number | null
          updated_at?: string
        }
        Update: {
          annualized_basis_rate?: number | null
          basis?: number | null
          basis_rate?: number | null
          estimated_settle_price?: number | null
          exchange?: string
          global_long_account?: number | null
          global_ls_ratio?: number | null
          global_short_account?: number | null
          index_price?: number | null
          interest_rate?: number | null
          last_settled_funding_rate?: number | null
          last_settled_funding_time?: number | null
          mark_price?: number | null
          market_type?: string
          next_funding_time?: number | null
          oi_chg_15m?: number | null
          oi_chg_1h?: number | null
          oi_chg_4h?: number | null
          oi_chg_5m?: number | null
          open_interest?: number | null
          predicted_funding_rate?: number | null
          symbol?: string
          taker_buy_sell_ratio?: number | null
          taker_buy_vol?: number | null
          taker_sell_vol?: number | null
          top_long_account?: number | null
          top_long_position?: number | null
          top_ls_ratio_accounts?: number | null
          top_ls_ratio_positions?: number | null
          top_short_account?: number | null
          top_short_position?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      now_futures_ticker: {
        Row: {
          base_volume: number | null
          close_time: number | null
          exchange: string
          high_price: number | null
          last_price: number | null
          low_price: number | null
          market_type: string
          open_price: number | null
          open_time: number | null
          price_change: number | null
          price_change_pct: number | null
          price_chg_15m: number | null
          price_chg_1h: number | null
          price_chg_4h: number | null
          price_chg_5m: number | null
          quote_asset: string | null
          quote_volume: number | null
          symbol: string
          trade_count: number | null
          updated_at: string
          volume: number | null
          volume_chg_15m: number | null
          volume_chg_1h: number | null
          volume_chg_5m: number | null
          volume_ratio: number | null
          weighted_avg_price: number | null
        }
        Insert: {
          base_volume?: number | null
          close_time?: number | null
          exchange: string
          high_price?: number | null
          last_price?: number | null
          low_price?: number | null
          market_type: string
          open_price?: number | null
          open_time?: number | null
          price_change?: number | null
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_asset?: string | null
          quote_volume?: number | null
          symbol: string
          trade_count?: number | null
          updated_at?: string
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
          weighted_avg_price?: number | null
        }
        Update: {
          base_volume?: number | null
          close_time?: number | null
          exchange?: string
          high_price?: number | null
          last_price?: number | null
          low_price?: number | null
          market_type?: string
          open_price?: number | null
          open_time?: number | null
          price_change?: number | null
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_asset?: string | null
          quote_volume?: number | null
          symbol?: string
          trade_count?: number | null
          updated_at?: string
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
          weighted_avg_price?: number | null
        }
        Relationships: []
      }
      now_spot_ticker: {
        Row: {
          ask_price: number | null
          ask_qty: number | null
          bid_price: number | null
          bid_qty: number | null
          close_time: number | null
          exchange: string
          high_price: number | null
          last_price: number | null
          low_price: number | null
          market_type: string
          open_price: number | null
          open_time: number | null
          prev_close_price: number | null
          price_change: number | null
          price_change_pct: number | null
          price_chg_15m: number | null
          price_chg_1h: number | null
          price_chg_4h: number | null
          price_chg_5m: number | null
          quote_asset: string | null
          quote_volume: number | null
          symbol: string
          trade_count: number | null
          updated_at: string
          volume: number | null
          volume_chg_15m: number | null
          volume_chg_1h: number | null
          volume_chg_5m: number | null
          volume_ratio: number | null
          weighted_avg_price: number | null
        }
        Insert: {
          ask_price?: number | null
          ask_qty?: number | null
          bid_price?: number | null
          bid_qty?: number | null
          close_time?: number | null
          exchange: string
          high_price?: number | null
          last_price?: number | null
          low_price?: number | null
          market_type?: string
          open_price?: number | null
          open_time?: number | null
          prev_close_price?: number | null
          price_change?: number | null
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_asset?: string | null
          quote_volume?: number | null
          symbol: string
          trade_count?: number | null
          updated_at?: string
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
          weighted_avg_price?: number | null
        }
        Update: {
          ask_price?: number | null
          ask_qty?: number | null
          bid_price?: number | null
          bid_qty?: number | null
          close_time?: number | null
          exchange?: string
          high_price?: number | null
          last_price?: number | null
          low_price?: number | null
          market_type?: string
          open_price?: number | null
          open_time?: number | null
          prev_close_price?: number | null
          price_change?: number | null
          price_change_pct?: number | null
          price_chg_15m?: number | null
          price_chg_1h?: number | null
          price_chg_4h?: number | null
          price_chg_5m?: number | null
          quote_asset?: string | null
          quote_volume?: number | null
          symbol?: string
          trade_count?: number | null
          updated_at?: string
          volume?: number | null
          volume_chg_15m?: number | null
          volume_chg_1h?: number | null
          volume_chg_5m?: number | null
          volume_ratio?: number | null
          weighted_avg_price?: number | null
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          canvas_state: Json
          cards_config: Json
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canvas_state?: Json
          cards_config?: Json
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canvas_state?: Json
          cards_config?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      symbols: {
        Row: {
          base_asset: string
          contract_type: string | null
          delivery_date: string | null
          exchange: string
          funding_interval_hours: number | null
          market_type: string
          min_notional: number | null
          onboard_date: string | null
          price_precision: number | null
          quantity_precision: number | null
          quote_asset: string
          status: string
          step_size: number | null
          symbol: string
          tick_size: number | null
          updated_at: string
        }
        Insert: {
          base_asset: string
          contract_type?: string | null
          delivery_date?: string | null
          exchange: string
          funding_interval_hours?: number | null
          market_type: string
          min_notional?: number | null
          onboard_date?: string | null
          price_precision?: number | null
          quantity_precision?: number | null
          quote_asset: string
          status?: string
          step_size?: number | null
          symbol: string
          tick_size?: number | null
          updated_at?: string
        }
        Update: {
          base_asset?: string
          contract_type?: string | null
          delivery_date?: string | null
          exchange?: string
          funding_interval_hours?: number | null
          market_type?: string
          min_notional?: number | null
          onboard_date?: string | null
          price_precision?: number | null
          quantity_precision?: number | null
          quote_asset?: string
          status?: string
          step_size?: number | null
          symbol?: string
          tick_size?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

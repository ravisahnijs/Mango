export interface BetResult {
  is_win: boolean;
  result_multiplier: number;
  payout: number;
  new_balance: number;
  nonce?: number;
  client_seed?: string;
  server_seed_hash?: string;
}

export interface Profile {
  id: string;
  balance: number;
}

export interface BetHistoryItem {
  id: string;
  timestamp: Date;
  bet_amount: number;
  target_multiplier: number;
  result_multiplier: number;
  payout: number;
  is_win: boolean;
}

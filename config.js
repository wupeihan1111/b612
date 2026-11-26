/* 雲端同步設定（Supabase）。
   url 和 anonKey 從 Supabase 專案的 Project Settings → API 複製過來。
   anonKey 本來就是公開用的金鑰，放在這裡沒關係；資料的安全由資料庫的 RLS 規則保護（只有登入的本人讀寫得到自己的進度）。
   兩個都留空時，遊戲照常運作，只是不會同步。 */
window.B612_SUPABASE = {
  url: "",
  anonKey: "",
};

import { isAuthenticated } from "@/lib/auth";
import { getWatchlist } from "@/lib/db";
import { LoginForm } from "./LoginForm";
import { WatchlistManager } from "./WatchlistManager";

export default async function SettingsPage() {
  const authed = await isAuthenticated();

  if (!authed) {
    return <LoginForm />;
  }

  const watchlist = await getWatchlist();
  return <WatchlistManager initialWatchlist={watchlist} />;
}

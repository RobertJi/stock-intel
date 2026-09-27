import { LoginForm } from "@/app/settings/LoginForm";

export const metadata = { title: "登录 · Stock Intel" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <LoginForm next={safeNext} />;
}

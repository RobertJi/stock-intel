import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "登录 · Stock Intel" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <LoginForm next={safeNext} />
    </main>
  );
}

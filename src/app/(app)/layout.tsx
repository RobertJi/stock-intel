import { Sidebar } from "@/components/Sidebar";

// 登录后才能看到的页面共用这层布局。登录页不在这个分组里,所以不会渲染侧栏(侧栏会读主题和管道数据)。
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-5 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
      <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mb-4">
        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <span className="text-sm font-semibold text-gray-300">Đang chuẩn bị dữ liệu Pet Travel...</span>
      <span className="text-xs text-gray-500 mt-1">Đồng bộ dữ liệu phiên bản mới nhất</span>
    </div>
  );
}

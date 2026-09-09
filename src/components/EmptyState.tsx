import { Inbox } from 'lucide-react';

export default function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
        <Inbox className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {message && <p className="text-xs text-gray-400">{message}</p>}
    </div>
  );
}

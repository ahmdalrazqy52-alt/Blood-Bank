import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  );
}

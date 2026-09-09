import type { BloodType } from '@/lib/types';
import { BLOOD_TYPE_COLORS } from '@/lib/constants';

interface BloodTypeBadgeProps {
  type: BloodType;
  size?: 'sm' | 'md' | 'lg';
}

export default function BloodTypeBadge({ type, size = 'md' }: BloodTypeBadgeProps) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };
  return (
    <div
      className={`${sizes[size]} ${BLOOD_TYPE_COLORS[type]} rounded-xl flex items-center justify-center font-bold text-white shadow-sm shrink-0`}
    >
      {type}
    </div>
  );
}
